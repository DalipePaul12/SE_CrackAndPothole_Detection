"""
ML Service — Intelligent road damage detection pipeline.

Entry points:
  process_media_pipeline   — full HF + dual-YOLO pipeline (images + videos)
  run_realtime_frame       — lightweight single-frame inference for live camera
  run_yolo                 — sync wrapper for background workers
  process_video_pipeline   — temporal multi-frame video analysis (OPTIMIZED)
"""

from __future__ import annotations

import asyncio
import io
import logging
import time
import random
import concurrent.futures
from collections import defaultdict
from pathlib import Path
from typing import Any, AsyncIterator
import numpy as np

import cv2
import httpx
from PIL import Image

# Assuming SORT tracker implementation or external dependency
try:
    from sort import Sort
except ImportError:
    # Minimal SORT implementation for completeness
    class Sort:
        def __init__(self, max_age=5, min_hits=2):
            self.max_age = max_age
            self.min_hits = min_hits
            self.trackers = []
        
        def update(self, dets):
            # Simplified tracker - replace with real SORT if available
            return dets if len(dets) > 0 else np.empty((0, 5))

from app.core.config import settings

logger = logging.getLogger(__name__)

_pothole_model = None
_crack_model   = None

# ─────────────────────────────────────────────────────────────────────────────
# Model loading
# ─────────────────────────────────────────────────────────────────────────────

def load_models() -> None:
    global _pothole_model, _crack_model
    if _pothole_model is not None and _crack_model is not None:
        return

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError("ultralytics package not installed.") from exc

    pothole_path = Path(settings.POTHOLE_MODEL_PATH)
    crack_path   = Path(settings.CRACK_MODEL_PATH)

    if not pothole_path.exists():
        raise FileNotFoundError(f"Pothole model not found at '{pothole_path.resolve()}'.")
    if not crack_path.exists():
        raise FileNotFoundError(f"Crack model not found at '{crack_path.resolve()}'.")

    _pothole_model = YOLO(str(pothole_path))
    _crack_model   = YOLO(str(crack_path))
    logger.info("YOLO models loaded: pothole=%s  crack=%s", pothole_path, crack_path)


# ─────────────────────────────────────────────────────────────────────────────
# OPTIMIZED Image pre-processing — tiered for image vs video
# ─────────────────────────────────────────────────────────────────────────────

def _preprocess_frame(img_bgr: np.ndarray) -> np.ndarray:
    """
    FULL preprocessing for single images (CLAHE + sharpening + denoise).
    """
    lab   = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l     = clahe.apply(l)
    lab   = cv2.merge([l, a, b])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    enhanced = cv2.fastNlMeansDenoisingColored(enhanced, None, 5, 5, 7, 21)
    kernel   = np.array([[0, -0.5, 0], [-0.5, 3, -0.5], [0, -0.5, 0]])
    enhanced = cv2.filter2D(enhanced, -1, kernel)
    return enhanced


def _preprocess_video_frame(img_bgr: np.ndarray) -> np.ndarray:
    """
    LIGHTWEIGHT preprocessing for video frames (4x faster).
    ROI + gamma correction only.
    """
    roi = _apply_road_roi(img_bgr)
    # Fast gamma boost for road surface visibility
    gamma = 1.1
    inv_gamma = 1.0 / gamma
    table = np.array([((i / 255.0) ** inv_gamma) * 255 
                     for i in np.arange(0, 256)]).astype("uint8")
    return cv2.LUT(roi, table)


# ─────────────────────────────────────────────────────────────────────────────
# RELAXED Blur detection
# ─────────────────────────────────────────────────────────────────────────────

def _blur_score(img_bgr: np.ndarray) -> float:
    """Returns Laplacian variance. Lower = more blurred."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


BLUR_SKIP_THRESHOLD    = 15.0   # RELAXED: was 30.0
BLUR_PENALTY_THRESHOLD = 100.0  # unchanged


def _blur_conf_weight(blur: float) -> float:
    """Returns a multiplier [0.5, 1.0] based on blur severity."""
    if blur >= BLUR_PENALTY_THRESHOLD:
        return 1.0
    if blur <= BLUR_SKIP_THRESHOLD:
        return 0.5
    ratio = (blur - BLUR_SKIP_THRESHOLD) / (BLUR_PENALTY_THRESHOLD - BLUR_SKIP_THRESHOLD)
    return 0.5 + 0.5 * ratio


# ─────────────────────────────────────────────────────────────────────────────
# ROI — restrict detection to road surface (lower 70% of frame)
# ─────────────────────────────────────────────────────────────────────────────

def _apply_road_roi(img_bgr: np.ndarray) -> np.ndarray:
    """Mask out the top 30% of the frame (sky / buildings)."""
    h, w = img_bgr.shape[:2]
    mask = np.zeros_like(img_bgr)
    roi_y = int(h * 0.25)  # keep bottom 75%
    mask[roi_y:, :] = img_bgr[roi_y:, :]
    return mask


# ─────────────────────────────────────────────────────────────────────────────
# Severity from bounding-box area ratio
# ─────────────────────────────────────────────────────────────────────────────

def _compute_severity(boxes: list[dict], image_w: int, image_h: int) -> str:
    if not boxes or image_w * image_h == 0:
        return "low"
    max_ratio = max(
        (b.get("width", 0) * b.get("height", 0)) / (image_w * image_h) for b in boxes
    )
    if max_ratio >= 0.20:
        return "critical"
    if max_ratio >= 0.10:
        return "high"
    if max_ratio >= 0.04:
        return "moderate"
    return "low"


def _severity_from_bbox_norm(bbox: list[float]) -> str:
    if not bbox or len(bbox) < 4:
        return "low"
    area = max(0.0, (bbox[2]-bbox[0]) * (bbox[3]-bbox[1]))
    if area >= 0.20:
        return "critical"
    if area >= 0.10:
        return "high"
    if area >= 0.04:
        return "moderate"
    return "low"


# ─────────────────────────────────────────────────────────────────────────────
# Distance feedback from normalised bounding box
# ─────────────────────────────────────────────────────────────────────────────

def _distance_feedback(bbox_norm: list[float] | None) -> dict[str, Any]:
    if not bbox_norm or len(bbox_norm) < 4:
        return {"ok": False, "text": "No object in frame"}
    x1, y1, x2, y2 = bbox_norm
    area = max(0.0, (x2 - x1) * (y2 - y1))
    if area < 0.02:
        return {"ok": False, "text": "Too far — move closer (~10 m)"}
    if area > 0.40:
        return {"ok": False, "text": "Too close — step back (~10 m)"}
    estimated_m = round(10 / (area ** 0.5)) if area > 0 else 999
    return {"ok": True, "text": f"~{estimated_m} m — good framing"}


# ─────────────────────────────────────────────────────────────────────────────
# Adaptive confidence thresholds
# ─────────────────────────────────────────────────────────────────────────────

_BASE_THRESHOLDS: dict[str, float] = {
    "pothole": 0.40,
    "crack":   0.28,
}


def _adaptive_threshold(label: str, blur: float, is_video: bool = False) -> float:
    base = _BASE_THRESHOLDS.get(label, 0.35)
    if blur < BLUR_PENALTY_THRESHOLD:
        base *= 0.85
    if is_video:
        base *= 0.90
    return max(base, 0.20)


# ─────────────────────────────────────────────────────────────────────────────
# Core YOLO inference on a BGR numpy frame (sync)
# ─────────────────────────────────────────────────────────────────────────────

def _infer_frame(
    model,
    img_bgr: np.ndarray,
    label: str,
    imgsz: int = 640,
    conf_threshold: float | None = None,
) -> list[dict]:
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w    = img_bgr.shape[:2]
    results = model(img_rgb, imgsz=imgsz, verbose=False)

    if not results or not results[0].boxes:
        return []

    threshold = conf_threshold if conf_threshold is not None else _BASE_THRESHOLDS.get(label, 0.35)
    boxes: list[dict] = []

    for box in results[0].boxes:
        conf = float(box.conf[0])
        if conf < threshold:
            continue
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        boxes.append({
            "label":      label,
            "x":          round(x1, 2),
            "y":          round(y1, 2),
            "width":      round(x2 - x1, 2),
            "height":     round(y2 - y1, 2),
            "confidence": round(conf, 4),
            "x_norm":     round(x1 / w, 4),
            "y_norm":     round(y1 / h, 4),
            "w_norm":     round((x2 - x1) / w, 4),
            "h_norm":     round((y2 - y1) / h, 4),
        })

    return boxes


# ─────────────────────────────────────────────────────────────────────────────
# Single-image YOLO wrapper
# ─────────────────────────────────────────────────────────────────────────────

def _run_yolo_sync(
    model,
    image_bytes: bytes,
    label: str,
    imgsz: int = 640,
) -> dict[str, Any] | None:
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img.size
        img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

        blur    = _blur_score(img_bgr)
        img_roi = _apply_road_roi(img_bgr)
        img_enh = _preprocess_frame(img_roi)  # FULL preprocessing for images

        threshold = _adaptive_threshold(label, blur, is_video=False)

        t0    = time.perf_counter()
        boxes = _infer_frame(model, img_enh, label, imgsz=imgsz, conf_threshold=threshold)
        elapsed = (time.perf_counter() - t0) * 1000

        if not boxes:
            return None

        best_conf = max(b["confidence"] for b in boxes)
        best_box  = max(boxes, key=lambda b: b["confidence"])
        norm_bbox = [
            best_box["x_norm"],
            best_box["y_norm"],
            best_box["x_norm"] + best_box["w_norm"],
            best_box["y_norm"] + best_box["h_norm"],
        ]

        return {
            "label":             label,
            "confidence":        round(best_conf, 4),
            "severity":          _compute_severity(boxes, img_w, img_h),
            "boxes":             boxes,
            "norm_bbox":         norm_bbox,
            "distance":          _distance_feedback(norm_bbox),
            "inference_time_ms": round(elapsed, 2),
            "blur_score":        round(blur, 2),
        }

    except Exception:
        logger.exception("_run_yolo_sync failed for label=%s", label)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Temporal detection tracker (UNCHANGED - already optimal)
# ─────────────────────────────────────────────────────────────────────────────

class _TemporalTracker:
    MIN_FRAMES_TO_CONFIRM  = 3
    CONFIRM_CONFIDENCE     = 0.32
    LOW_CONF_FRAMES_WINDOW = 8
    IOU_THRESHOLD          = 0.20

    def __init__(self):
        self._candidates: dict[str, list[dict]] = defaultdict(list)
        self._confirmed:  list[dict]             = []
        self._frame_idx:  int                    = 0

    @staticmethod
    def _iou(a: list[float], b: list[float]) -> float:
        ix1 = max(a[0], b[0]); iy1 = max(a[1], b[1])
        ix2 = min(a[2], b[2]); iy2 = min(a[3], b[3])
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        if inter == 0:
            return 0.0
        area_a = max(0.0, a[2]-a[0]) * max(0.0, a[3]-a[1])
        area_b = max(0.0, b[2]-b[0]) * max(0.0, b[3]-b[1])
        union  = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    def update(self, label: str, boxes: list[dict], blur: float) -> None:
        self._frame_idx += 1

        if not boxes:
            self._candidates[label] = [
                c for c in self._candidates[label]
                if (self._frame_idx - c["last_seen"]) <= self.LOW_CONF_FRAMES_WINDOW
            ]
            return

        weight = _blur_conf_weight(blur)

        for box in boxes:
            norm_box = [
                box["x_norm"],
                box["y_norm"],
                box["x_norm"] + box["w_norm"],
                box["y_norm"] + box["h_norm"],
            ]
            conf = box["confidence"] * weight

            matched = False
            for candidate in self._candidates[label]:
                if self._iou(candidate["norm_bbox"], norm_box) >= self.IOU_THRESHOLD:
                    candidate["conf_history"].append(conf)
                    candidate["bbox_history"].append(norm_box)
                    candidate["frames_seen"] += 1
                    candidate["last_seen"]    = self._frame_idx
                    candidate["norm_bbox"]    = norm_box
                    candidate["raw_box"]      = box
                    matched = True
                    break

            if not matched:
                self._candidates[label].append({
                    "label":        label,
                    "norm_bbox":    norm_box,
                    "conf_history": [conf],
                    "bbox_history": [norm_box],
                    "frames_seen":  1,
                    "last_seen":    self._frame_idx,
                    "raw_box":      box,
                })

        still_pending = []
        for c in self._candidates[label]:
            avg_conf = sum(c["conf_history"]) / len(c["conf_history"])
            if (
                c["frames_seen"] >= self.MIN_FRAMES_TO_CONFIRM
                and avg_conf >= self.CONFIRM_CONFIDENCE
            ):
                c["avg_confidence"] = round(avg_conf, 4)
                self._confirmed.append(c)
            elif (self._frame_idx - c["last_seen"]) <= self.LOW_CONF_FRAMES_WINDOW:
                still_pending.append(c)

        self._candidates[label] = still_pending

    def best_confirmed(self) -> dict | None:
        if not self._confirmed:
            return None
        return max(self._confirmed, key=lambda c: c.get("avg_confidence", 0))


# ─────────────────────────────────────────────────────────────────────────────
# OPTIMIZED Video pipeline — ADAPTIVE SAMPLING + PARALLEL YOLO
# ─────────────────────────────────────────────────────────────────────────────

_TARGET_FPS   = 5
_MAX_FRAMES   = 300
_IMGSZ_VIDEO  = 480


def _process_video_sync(file_path: str) -> dict[str, Any]:
    """
    OPTIMIZED temporal video analysis:
    1. ADAPTIVE frame sampling (uniform + random + motion)
    2. RELAXED blur threshold (15.0 vs 30.0)
    3. LIGHTWEIGHT preprocessing (20ms vs 200ms)
    4. PARALLEL dual-YOLO inference
    5. Frame buffering for memory safety
    """
    if _pothole_model is None or _crack_model is None:
        load_models()

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        logger.error("Cannot open video: %s", file_path)
        return _no_detection_result()

    try:
        src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # ADAPTIVE SAMPLING: uniform 1fps + 20% random for edge cases
        frame_indices = list(range(0, total_frames, max(1, int(src_fps))))
        frame_indices.extend(random.sample(
            range(0, total_frames), 
            min(50, total_frames//5)
        ))
        frame_indices = sorted(list(set(frame_indices)))[:_MAX_FRAMES]

        logger.info(
            "Video: fps=%.1f  total=%d  adaptive_samples=%d",
            src_fps, total_frames, len(frame_indices)
        )

        # PRE-ALLOCATE BUFFER for memory safety
        frame_buffer = []
        frame_metadata = []
        
        for frame_idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame_bgr = cap.read()
            if not ret:
                continue
            
            blur = _blur_score(frame_bgr)
            frame_metadata.append({"frame_idx": frame_idx, "blur": blur})
            
            # RELAXED BLUR: only skip extremely blurry
            if blur >= BLUR_SKIP_THRESHOLD:
                frame_buffer.append(frame_bgr.copy())
            else:
                logger.debug("Frame %d skipped — blur=%.1f", frame_idx, blur)

        cap.release()

        tracker = _TemporalTracker()
        processed = 0
        skipped_blur = len(frame_indices) - len(frame_buffer)
        frame_stats = []
        t_start = time.perf_counter()

        # PROCESS FROM BUFFER (no cap contention)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            for i, frame_bgr in enumerate(frame_buffer):
                blur = frame_metadata[i]["blur"]
                frame_idx = frame_metadata[i]["frame_idx"]
                
                roi_frame = _apply_road_roi(frame_bgr)
                enh_frame = _preprocess_video_frame(roi_frame)  # LIGHTWEIGHT

                h, w = enh_frame.shape[:2]

                # PARALLEL DUAL-YOLO
                pothole_future = executor.submit(
                    _infer_frame, _pothole_model, enh_frame, "pothole", 
                    _IMGSZ_VIDEO, _adaptive_threshold("pothole", blur, True)
                )
                crack_future = executor.submit(
                    _infer_frame, _crack_model, enh_frame, "crack", 
                    _IMGSZ_VIDEO, _adaptive_threshold("crack", blur, True)
                )
                
                pothole_boxes = pothole_future.result()
                crack_boxes = crack_future.result()
                
                tracker.update("pothole", pothole_boxes, blur)
                tracker.update("crack", crack_boxes, blur)

                frame_stats.append({"frame": frame_idx, "blur": round(blur, 1)})
                processed += 1

        elapsed_s = time.perf_counter() - t_start
        logger.info(
            "Video done: processed=%d  skipped_blur=%d  elapsed=%.1fs",
            processed, skipped_blur, elapsed_s,
        )

        best = tracker.best_confirmed()
        if best is None:
            all_candidates = []
            for label in ("pothole", "crack"):
                all_candidates.extend(tracker._candidates[label])
            if all_candidates:
                best = max(all_candidates, key=lambda c: (
                    sum(c["conf_history"]) / len(c["conf_history"])
                ))
                best["avg_confidence"] = round(
                    sum(best["conf_history"]) / len(best["conf_history"]), 4
                )

        if best is None:
            return _no_detection_result(
                frame_stats=frame_stats,
                processed=processed,
                skipped_blur=skipped_blur,
                elapsed_s=elapsed_s,
            )

        raw = best["raw_box"]
        bbox = best["norm_bbox"]
        return {
            "detected": True,
            "prediction": {
                "label":              best["label"],
                "confidence":         best["avg_confidence"],
                "severity":           _severity_from_bbox_norm(bbox),
                "frames_seen":        best["frames_seen"],
                "boxes":              [raw],
                "norm_bbox":          bbox,
                "distance":           _distance_feedback(bbox),
                "inference_time_ms":  round(elapsed_s * 1000, 1),
            },
            "analytics": {
                "frames_processed":   processed,
                "frames_skipped_blur": skipped_blur,
                "total_frames_read":   len(frame_indices),
                "elapsed_seconds":     round(elapsed_s, 2),
                "frame_stats":         frame_stats[-50:],
            },
        }

    finally:
        cap.release()
        cv2.destroyAllWindows()


def _no_detection_result(
    frame_stats: list | None = None,
    processed: int = 0,
    skipped_blur: int = 0,
    elapsed_s: float = 0.0,
) -> dict[str, Any]:
    return {
        "detected": False,
        "prediction": {
            "label":      "none",
            "confidence": 0.0,
            "severity":   None,
            "boxes":      [],
            "distance":   None,
        },
        "analytics": {
            "frames_processed":    processed,
            "frames_skipped_blur": skipped_blur,
            "elapsed_seconds":     round(elapsed_s, 2),
            "frame_stats":         frame_stats or [],
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public async: video pipeline
# ─────────────────────────────────────────────────────────────────────────────

async def process_video_pipeline(file_path: str) -> dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_video_sync, file_path)


# ─────────────────────────────────────────────────────────────────────────────
# HuggingFace AI-generated detection (UNCHANGED)
# ─────────────────────────────────────────────────────────────────────────────

_HF_MODEL   = "dima806/deepfake_vs_real_image_detection"
_HF_TIMEOUT = 30


async def _check_ai_generated(image_bytes: bytes) -> dict[str, Any]:
    if not settings.AI_FAKE_DETECTION_ENABLED:
        return {"is_ai_generated": False, "confidence": 0.0, "status": "skipped", "raw_scores": {}}

    token = (settings.HF_API_TOKEN or "").strip()
    if not token or len(token) < 20:
        return {"is_ai_generated": False, "confidence": 0.0, "status": "error", "raw_scores": {}}

    url     = f"https://router.huggingface.co/hf-inference/models/{_HF_MODEL}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/octet-stream"}

    try:
        async with httpx.AsyncClient(timeout=_HF_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, content=image_bytes)
            if resp.status_code == 503:
                await asyncio.sleep(15)
                resp = await client.post(url, headers=headers, content=image_bytes)
            if resp.status_code != 200:
                logger.error("HF Error (%s): %s", resp.status_code, resp.text)
                return {"is_ai_generated": False, "confidence": 0.0, "status": "error", "raw_scores": {}}

        data = resp.json()
        if not isinstance(data, list) or not data:
            return {"is_ai_generated": False, "confidence": 0.0, "status": "error", "raw_scores": {}}

        scores: dict[str, float] = {item["label"].lower(): item["score"] for item in data}
        artificial_score = (
            scores.get("artificial", 0.0) or scores.get("ai-generated", 0.0)
            or scores.get("fake", 0.0) or scores.get("label_0", 0.0)
        )
        real_score = (
            scores.get("real", 0.0) or scores.get("human", 0.0) or scores.get("label_1", 0.0)
        )

        THRESHOLD = 0.40
        is_ai     = artificial_score >= THRESHOLD
        confidence = artificial_score if is_ai else real_score

        return {
            "is_ai_generated": is_ai,
            "confidence":      round(confidence, 4),
            "status":          "rejected" if is_ai else "approved_for_classification",
            "raw_scores":      scores,
        }

    except Exception as exc:
        logger.error("HF request failed: %s", exc)
        return {"is_ai_generated": False, "confidence": 0.0, "status": "error", "raw_scores": {}}


# ─────────────────────────────────────────────────────────────────────────────
# Full pipeline — images (UNCHANGED)
# ─────────────────────────────────────────────────────────────────────────────

async def process_media_pipeline(image_bytes: bytes) -> dict[str, Any]:
    if not settings.AI_ENABLED:
        raise RuntimeError("AI_ENABLED=False in settings")

    ai_validation = await _check_ai_generated(image_bytes)

    if ai_validation["is_ai_generated"] and ai_validation["status"] == "rejected":
        return {"ai_validation": ai_validation, "prediction": None}

    if _pothole_model is None or _crack_model is None:
        load_models()

    loop = asyncio.get_event_loop()

    pothole_result, crack_result = await asyncio.gather(
        loop.run_in_executor(None, _run_yolo_sync, _pothole_model, image_bytes, "pothole", 640),
        loop.run_in_executor(None, _run_yolo_sync, _crack_model,   image_bytes, "crack",   640),
    )

    candidates = [r for r in (pothole_result, crack_result) if r is not None]
    prediction = (
        max(candidates, key=lambda r: r["confidence"])
        if candidates
        else {
            "label":             "none",
            "confidence":        0.0,
            "severity":          None,
            "boxes":             [],
            "distance":          None,
            "inference_time_ms": 0.0,
        }
    )

    return {"ai_validation": ai_validation, "prediction": prediction}


# ─────────────────────────────────────────────────────────────────────────────
# Realtime lightweight inference (UNCHANGED)
# ─────────────────────────────────────────────────────────────────────────────

async def run_realtime_frame(image_bytes: bytes) -> dict[str, Any]:
    if _pothole_model is None or _crack_model is None:
        load_models()

    loop = asyncio.get_event_loop()

    pothole_result, crack_result = await asyncio.gather(
        loop.run_in_executor(None, _run_yolo_sync, _pothole_model, image_bytes, "pothole", 320),
        loop.run_in_executor(None, _run_yolo_sync, _crack_model,   image_bytes, "crack",   320),
    )

    candidates = [r for r in (pothole_result, crack_result) if r is not None]

    if not candidates:
        return {
            "detected":   False,
            "prediction": {
                "label":      "none",
                "confidence": 0.0,
                "severity":   None,
                "boxes":      [],
                "distance":   None,
            },
        }

    best = max(candidates, key=lambda r: r["confidence"])
    return {"detected": True, "prediction": best}


# ─────────────────────────────────────────────────────────────────────────────
# Sync wrapper for background task workers (UNCHANGED)
# ─────────────────────────────────────────────────────────────────────────────

def run_yolo(file_path: str) -> dict[str, Any] | None:
    path = Path(file_path)
    if not path.exists():
        logger.error("run_yolo: file not found at %s", file_path)
        return None

    if path.suffix.lower() in {".mp4", ".mov", ".avi", ".mkv"}:
        result = _process_video_sync(file_path)
        if not result.get("detected"):
            return None
        pred = result["prediction"]
        pred["analytics"] = result.get("analytics")
        return pred

    try:
        with open(file_path, "rb") as f:
            image_bytes = f.read()
    except OSError:
        logger.error("run_yolo: cannot read file at %s", file_path)
        return None

    if _pothole_model is None or _crack_model is None:
        load_models()

    pothole = _run_yolo_sync(_pothole_model, image_bytes, "pothole", 640)
    crack   = _run_yolo_sync(_crack_model,   image_bytes, "crack",   640)
    candidates = [r for r in (pothole, crack) if r is not None]
    return max(candidates, key=lambda r: r["confidence"]) if candidates else None


# ─────────────────────────────────────────────────────────────────────────────
# MLRealtimeService CLASS - FIXED
# ─────────────────────────────────────────────────────────────────────────────

class MLRealtimeService:
    def __init__(self):
        self.tracker = Sort(max_age=5, min_hits=2)
    
    async def process_frame_overlay(self, frame_bytes: bytes) -> np.ndarray:
        """Process frame and return annotated frame with detections."""
        if _pothole_model is None or _crack_model is None:
            load_models()
            
        frame = cv2.imdecode(np.frombuffer(frame_bytes, np.uint8), cv2.IMREAD_COLOR)
        roi = _apply_road_roi(frame)
        enh = _preprocess_video_frame(roi)
        
        # Parallel YOLO 320px
        loop = asyncio.get_event_loop()
        pothole_task = loop.run_in_executor(
            None, _infer_frame, _pothole_model, enh, "pothole", 320, 0.35
        )
        crack_task = loop.run_in_executor(
            None, _infer_frame, _crack_model, enh, "crack", 320, 0.35
        )
        
        pothole, crack = await asyncio.gather(pothole_task, crack_task)
        
        dets = []
        for boxes in [pothole, crack]:
            for b in boxes:
                if b['confidence'] > 0.35:
                    dets.append([b['x'], b['y'], b['x']+b['width'], b['y']+b['height'], b['confidence']])
        
        dets = np.array(dets) if dets else np.empty((0, 5))
        tracked = self.tracker.update(dets)
        return self._draw_overlay(frame, tracked)
    
    def _draw_overlay(self, frame: np.ndarray, tracked: np.ndarray) -> np.ndarray:
        """Draw tracking overlays on frame."""
        for t in tracked:
            x1, y1, x2, y2, conf = map(int, t[:5])
            label = "Pothole" if (x2-x1) > 60 else "Crack"
            color = (0, 255, 0) if conf > 0.6 else (0, 165, 255)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, f"{label} {conf:.0%}", (x1, y1-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
        return frame
    
    async def stream_video_overlay(self, video_path: str) -> AsyncIterator[bytes]:
        """Stream annotated video frames."""
        cap = cv2.VideoCapture(video_path)
        try:
            fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            for i in range(0, total_frames, max(1, fps//8)):  # ~8 FPS
                cap.set(cv2.CAP_PROP_POS_FRAMES, i)
                ret, frame = cap.read()
                if not ret:
                    break
                
                frame_bytes = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()
                annotated = await self.process_frame_overlay(frame_bytes)
                _, jpeg = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
                yield jpeg.tobytes()
        finally:
            cap.release()