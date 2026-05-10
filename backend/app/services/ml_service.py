"""
ML Service — Intelligent road damage detection pipeline.

Entry points:
  process_media_pipeline   — full HF + dual-YOLO pipeline (images, concurrent)
  run_realtime_frame       — lightweight single-frame inference for live camera
  run_yolo                 — sync wrapper for background workers
  process_video_pipeline   — temporal multi-frame video analysis (OPTIMIZED)

KEY FIXES vs previous version:
  FIX-1: process_media_pipeline now runs HF check + both YOLO models CONCURRENTLY
          instead of sequentially. Saves 10-30s per request.
  FIX-2: _check_ai_generated timeout reduced 30s→12s, retry sleep 15s→5s.
          On timeout/503 it returns "skipped" instead of blocking YOLO.
  FIX-3: _check_ai_generated returns "skipped" (not "error") on non-200 so
          the pipeline never rejects a valid road image due to HF being down.
  FIX-4: load_models() is idempotent and safe to call from lifespan startup.
"""

from __future__ import annotations

import asyncio
import base64
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

try:
    from sort import Sort
except ImportError:
    class Sort:
        def __init__(self, max_age=5, min_hits=2):
            self.max_age = max_age
            self.min_hits = min_hits
            self.trackers = []

        def update(self, dets):
            return dets if len(dets) > 0 else np.empty((0, 5))

from app.core.config import settings

logger = logging.getLogger(__name__)

_pothole_model = None
_crack_model   = None


# ─────────────────────────────────────────────────────────────────────────────
# Model loading
# ─────────────────────────────────────────────────────────────────────────────

def load_models() -> None:
    """
    Load both YOLO models into module-level globals.
    Idempotent — safe to call multiple times (no-op if already loaded).
    Called once at server startup via lifespan in main.py.
    """
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
# Image pre-processing
# ─────────────────────────────────────────────────────────────────────────────

def _preprocess_frame(img_bgr: np.ndarray) -> np.ndarray:
    """FULL preprocessing for single images (CLAHE + sharpening — no NLM denoise)."""
    lab      = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b  = cv2.split(lab)
    clahe    = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l        = clahe.apply(l)
    lab      = cv2.merge([l, a, b])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    # Removed fastNlMeansDenoisingColored — takes 30-120s on CPU, kills the pipeline.
    # Use a fast Gaussian blur instead for mild noise reduction.
    enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)
    kernel   = np.array([[0, -0.5, 0], [-0.5, 3, -0.5], [0, -0.5, 0]])
    enhanced = cv2.filter2D(enhanced, -1, kernel)
    return enhanced


def _preprocess_video_frame(img_bgr: np.ndarray) -> np.ndarray:
    """LIGHTWEIGHT preprocessing for video frames (gamma correction only)."""
    gamma     = 1.1
    inv_gamma = 1.0 / gamma
    table     = np.array(
        [((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]
    ).astype("uint8")
    return cv2.LUT(img_bgr, table)


# ─────────────────────────────────────────────────────────────────────────────
# Blur detection
# ─────────────────────────────────────────────────────────────────────────────

def _blur_score(img_bgr: np.ndarray) -> float:
    """Returns Laplacian variance. Lower = more blurred."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


BLUR_SKIP_THRESHOLD    = 15.0
BLUR_PENALTY_THRESHOLD = 100.0


def _blur_conf_weight(blur: float) -> float:
    """Returns a multiplier [0.5, 1.0] based on blur severity."""
    if blur >= BLUR_PENALTY_THRESHOLD:
        return 1.0
    if blur <= BLUR_SKIP_THRESHOLD:
        return 0.5
    ratio = (blur - BLUR_SKIP_THRESHOLD) / (BLUR_PENALTY_THRESHOLD - BLUR_SKIP_THRESHOLD)
    return 0.5 + 0.5 * ratio


# ─────────────────────────────────────────────────────────────────────────────
# Severity from bounding-box area ratio
# ─────────────────────────────────────────────────────────────────────────────

def _compute_severity(boxes: list[dict], image_w: int, image_h: int) -> str:
    if not boxes or image_w * image_h == 0:
        return "non-critical"
    max_ratio = max(
        (b.get("width", 0) * b.get("height", 0)) / (image_w * image_h) for b in boxes
    )
    return "critical" if max_ratio >= 0.10 else "non-critical"


def _severity_from_bbox_norm(bbox: list[float]) -> str:
    if not bbox or len(bbox) < 4:
        return "non-critical"
    area = max(0.0, (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
    return "critical" if area >= 0.10 else "non-critical"

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
# Filmstrip snapshot helper
# ─────────────────────────────────────────────────────────────────────────────

def _annotate_frame(frame_bgr: np.ndarray, boxes: list[dict], label: str) -> str:
    """
    Draw bounding boxes on a copy of frame_bgr and return as base64 JPEG string.
    Uses pixel coords (x, y, width, height) from each box dict.
    """
    annotated = frame_bgr.copy()
    color     = (0, 60, 220) if label == "pothole" else (0, 140, 255)

    for b in boxes:
        x1 = int(round(b["x"]))
        y1 = int(round(b["y"]))
        x2 = int(round(b["x"] + b["width"]))
        y2 = int(round(b["y"] + b["height"]))

        h, w = annotated.shape[:2]
        x1 = max(0, min(x1, w - 1))
        y1 = max(0, min(y1, h - 1))
        x2 = max(0, min(x2, w))
        y2 = max(0, min(y2, h))

        overlay = annotated.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
        cv2.addWeighted(overlay, 0.15, annotated, 0.85, 0, annotated)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

        conf_pct          = int(b["confidence"] * 100)
        text              = f"{label.upper()} {conf_pct}%"
        (tw, th), _       = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        pill_y1           = max(y1 - th - 8, 0)
        pill_y2           = max(y1, th + 8)
        cv2.rectangle(annotated, (x1, pill_y1), (x1 + tw + 10, pill_y2), color, -1)
        cv2.putText(
            annotated, text,
            (x1 + 5, pill_y2 - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1,
            cv2.LINE_AA,
        )

    _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 78])
    return base64.b64encode(jpeg.tobytes()).decode("utf-8")


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
    img_rgb   = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w      = img_bgr.shape[:2]
    results   = model(img_rgb, imgsz=imgsz, verbose=False)

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

        # Cap input size before preprocessing — large images kill CLAHE and
        # the old NLM denoising step. 1280px is more than enough for YOLO at 640.
        if max(img.size) > 1280:
            img.thumbnail((1280, 1280), Image.LANCZOS)

        img_w, img_h = img.size
        img_bgr      = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

        blur      = _blur_score(img_bgr)
        img_enh   = _preprocess_frame(img_bgr)
        threshold = _adaptive_threshold(label, blur, is_video=False)

        t0      = time.perf_counter()
        boxes   = _infer_frame(model, img_enh, label, imgsz=imgsz, conf_threshold=threshold)
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
# Temporal detection tracker
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
        ix1   = max(a[0], b[0]); iy1 = max(a[1], b[1])
        ix2   = min(a[2], b[2]); iy2 = min(a[3], b[3])
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        if inter == 0:
            return 0.0
        area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
        area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
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
            conf    = box["confidence"] * weight
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
# OPTIMIZED Video pipeline
# ─────────────────────────────────────────────────────────────────────────────

_TARGET_FPS    = 5
_MAX_FRAMES    = 300
_IMGSZ_VIDEO   = 480
_MAX_SNAPSHOTS = 12


def _process_video_sync(file_path: str) -> dict[str, Any]:
    """
    OPTIMIZED temporal video analysis with filmstrip snapshots.
    Phase 1: Read + blur-filter frames into buffer.
    Phase 2: Parallel YOLO inference with ThreadPoolExecutor(max_workers=2).
    """
    if _pothole_model is None or _crack_model is None:
        load_models()

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        logger.error("Cannot open video: %s", file_path)
        return _no_detection_result()

    frame_buffer:        list[np.ndarray] = []
    frame_metadata:      list[dict]       = []
    tracker              = _TemporalTracker()
    processed            = 0
    skipped_blur         = 0
    frame_stats:         list[dict]       = []
    frame_indices:       list[int]        = []
    detection_snapshots: list[dict]       = []
    t_start              = time.perf_counter()

    try:
        src_fps      = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        frame_indices = list(range(0, total_frames, max(1, int(src_fps))))
        if total_frames > 5:
            frame_indices.extend(
                random.sample(range(0, total_frames), min(50, total_frames // 5))
            )
        frame_indices = sorted(list(set(frame_indices)))[:_MAX_FRAMES]

        logger.info(
            "Video: fps=%.1f  total=%d  adaptive_samples=%d",
            src_fps, total_frames, len(frame_indices),
        )

        # Phase 1: Read frames into buffer
        for frame_idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame_bgr = cap.read()
            if not ret:
                continue
            blur = _blur_score(frame_bgr)
            if blur >= BLUR_SKIP_THRESHOLD:
                frame_buffer.append(frame_bgr.copy())
                frame_metadata.append({"frame_idx": frame_idx, "blur": blur})
            else:
                logger.debug("Frame %d skipped — blur=%.1f", frame_idx, blur)

        cap.release()

        skipped_blur = len(frame_indices) - len(frame_buffer)
        t_start      = time.perf_counter()

        # Phase 2: Inference + filmstrip
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            for i, frame_bgr in enumerate(frame_buffer):
                blur      = frame_metadata[i]["blur"]
                frame_idx = frame_metadata[i]["frame_idx"]
                enh_frame = _preprocess_video_frame(frame_bgr)

                pothole_future = executor.submit(
                    _infer_frame, _pothole_model, enh_frame, "pothole",
                    _IMGSZ_VIDEO, _adaptive_threshold("pothole", blur, True),
                )
                crack_future = executor.submit(
                    _infer_frame, _crack_model, enh_frame, "crack",
                    _IMGSZ_VIDEO, _adaptive_threshold("crack", blur, True),
                )

                pothole_boxes = pothole_future.result()
                crack_boxes   = crack_future.result()

                tracker.update("pothole", pothole_boxes, blur)
                tracker.update("crack",   crack_boxes,   blur)

                for det_label, det_boxes in [
                    ("pothole", pothole_boxes),
                    ("crack",   crack_boxes),
                ]:
                    if det_boxes and len(detection_snapshots) < _MAX_SNAPSHOTS:
                        try:
                            b64 = _annotate_frame(frame_bgr, det_boxes, det_label)
                            detection_snapshots.append({
                                "frame":      frame_idx,
                                "label":      det_label,
                                "confidence": round(
                                    max(b["confidence"] for b in det_boxes), 4
                                ),
                                "image_b64":  b64,
                            })
                        except Exception:
                            logger.warning(
                                "Snapshot failed frame=%d label=%s",
                                frame_idx, det_label, exc_info=True,
                            )

                frame_stats.append({"frame": frame_idx, "blur": round(blur, 1)})
                processed += 1

    finally:
        del frame_buffer
        frame_buffer = []
        cap.release()

    elapsed_s = time.perf_counter() - t_start
    logger.info(
        "Video done: processed=%d  skipped_blur=%d  snapshots=%d  elapsed=%.1fs",
        processed, skipped_blur, len(detection_snapshots), elapsed_s,
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
            detection_snapshots=detection_snapshots,
        )

    raw  = best["raw_box"]
    bbox = best["norm_bbox"]
    return {
        "detected": True,
        "prediction": {
            "label":             best["label"],
            "confidence":        best["avg_confidence"],
            "severity":          _severity_from_bbox_norm(bbox),
            "frames_seen":       best["frames_seen"],
            "boxes":             [raw],
            "norm_bbox":         bbox,
            "distance":          _distance_feedback(bbox),
            "inference_time_ms": round(elapsed_s * 1000, 1),
        },
        "analytics": {
            "frames_processed":    processed,
            "frames_skipped_blur": skipped_blur,
            "total_frames_read":   len(frame_indices),
            "elapsed_seconds":     round(elapsed_s, 2),
            "frame_stats":         frame_stats[-50:],
            "detection_snapshots": detection_snapshots,
        },
    }


def _no_detection_result(
    frame_stats: list | None = None,
    processed: int = 0,
    skipped_blur: int = 0,
    elapsed_s: float = 0.0,
    detection_snapshots: list | None = None,
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
            "detection_snapshots": detection_snapshots or [],
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public async: video pipeline
# ─────────────────────────────────────────────────────────────────────────────

async def process_video_pipeline(file_path: str) -> dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _process_video_sync, file_path)


# ─────────────────────────────────────────────────────────────────────────────
# HuggingFace AI-generated detection
# ─────────────────────────────────────────────────────────────────────────────

_HF_MODEL   = "dima806/deepfake_vs_real_image_detection"

# FIX-2: Reduced from 30s → 12s.  HF cold-start can take 10-15s.
# If it hasn't responded in 12s it's unlikely to respond faster than YOLO.
# We fail-fast and return "skipped" so YOLO results aren't held hostage.
_HF_TIMEOUT = 12


async def _check_ai_generated(image_bytes: bytes) -> dict[str, Any]:
    """
    Detect AI-generated images via HuggingFace Inference API.

    FIX-2: Timeout reduced 30s→12s; 503 retry sleep reduced 15s→5s.
    FIX-3: Any failure path returns status="skipped" (not "error") so
           process_media_pipeline never rejects real road images due to
           HF being temporarily unavailable.
    """
    _SKIPPED = {"is_ai_generated": False, "confidence": 0.0, "status": "skipped", "raw_scores": {}}

    if not settings.AI_FAKE_DETECTION_ENABLED:
        return _SKIPPED

    token = (settings.HF_API_TOKEN or "").strip()
    if not token or len(token) < 20:
        logger.warning("HF_API_TOKEN missing or too short — skipping AI detection.")
        return _SKIPPED

    url     = f"https://router.huggingface.co/hf-inference/models/{_HF_MODEL}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/octet-stream",
    }

    try:
        async with httpx.AsyncClient(timeout=_HF_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, content=image_bytes)

            # FIX-2: 503 = model is loading. Wait 5s (was 15s) then retry once.
            if resp.status_code == 503:
                logger.warning("HF model loading (503) — waiting 5s then retrying once.")
                await asyncio.sleep(5)
                resp = await client.post(url, headers=headers, content=image_bytes)

            # FIX-3: Any non-200 → skip, don't block YOLO pipeline.
            if resp.status_code != 200:
                logger.warning(
                    "HF returned %s — skipping AI check, proceeding to YOLO.",
                    resp.status_code,
                )
                return _SKIPPED

        data = resp.json()
        if not isinstance(data, list) or not data:
            return _SKIPPED

        scores: dict[str, float] = {item["label"].lower(): item["score"] for item in data}
        artificial_score = (
            scores.get("artificial", 0.0)
            or scores.get("ai-generated", 0.0)
            or scores.get("fake", 0.0)
            or scores.get("label_0", 0.0)
        )
        real_score = (
            scores.get("real", 0.0)
            or scores.get("human", 0.0)
            or scores.get("label_1", 0.0)
        )

        THRESHOLD  = 0.40
        is_ai      = artificial_score >= THRESHOLD
        confidence = artificial_score if is_ai else real_score

        return {
            "is_ai_generated": is_ai,
            "confidence":      round(confidence, 4),
            "status":          "rejected" if is_ai else "approved_for_classification",
            "raw_scores":      scores,
        }

    except httpx.TimeoutException:
        # FIX-2: HF timed out — skip it, YOLO still runs.
        logger.warning(
            "HF request timed out after %ss — skipping, proceeding to YOLO.", _HF_TIMEOUT
        )
        return _SKIPPED

    except Exception as exc:
        logger.error("HF request failed: %s — skipping AI check.", exc)
        return _SKIPPED


# ─────────────────────────────────────────────────────────────────────────────
# Full pipeline — images  (THE MAIN FIX)
# ─────────────────────────────────────────────────────────────────────────────

async def process_media_pipeline(image_bytes: bytes) -> dict[str, Any]:
    """
    Full two-stage pipeline: HF AI-check + dual YOLO.

    FIX-1: HF check and both YOLO models now run CONCURRENTLY via asyncio.gather().
    Previous version was sequential: await HF → await YOLO → return.
    Total time was HF_time + YOLO_time (e.g. 15s + 8s = 23s).
    Now total time = max(HF_time, YOLO_time) (e.g. max(15s, 8s) = 15s).
    When HF times out (12s) and YOLO finishes in 8s, result returns in 12s not 23s.
    """
    if not settings.AI_ENABLED:
        raise RuntimeError("AI_ENABLED=False in settings")

    if _pothole_model is None or _crack_model is None:
        load_models()

    loop = asyncio.get_event_loop()

    # FIX-1: All three tasks run concurrently — HF check does NOT block YOLO.
    ai_task      = _check_ai_generated(image_bytes)
    pothole_task = loop.run_in_executor(
        None, _run_yolo_sync, _pothole_model, image_bytes, "pothole", 640
    )
    crack_task   = loop.run_in_executor(
        None, _run_yolo_sync, _crack_model, image_bytes, "crack", 640
    )

    ai_validation, pothole_result, crack_result = await asyncio.gather(
        ai_task, pothole_task, crack_task
    )

    # Only reject if HF explicitly flagged as AI-generated (not on skipped/error).
    if (
        ai_validation.get("is_ai_generated")
        and ai_validation.get("status") == "rejected"
    ):
        return {"ai_validation": ai_validation, "prediction": None}

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
# Realtime lightweight inference
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
# Sync wrapper for background task workers
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
        pred            = result["prediction"]
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

    pothole    = _run_yolo_sync(_pothole_model, image_bytes, "pothole", 640)
    crack      = _run_yolo_sync(_crack_model,   image_bytes, "crack",   640)
    candidates = [r for r in (pothole, crack) if r is not None]
    return max(candidates, key=lambda r: r["confidence"]) if candidates else None


# ─────────────────────────────────────────────────────────────────────────────
# MLRealtimeService — singleton-guarded
# ─────────────────────────────────────────────────────────────────────────────

_realtime_instance: "MLRealtimeService | None" = None


class MLRealtimeService:
    def __new__(cls, *args, **kwargs):
        global _realtime_instance
        if _realtime_instance is None:
            _realtime_instance = super().__new__(cls)
        return _realtime_instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        self.tracker = Sort(max_age=5, min_hits=2)

    async def process_frame_overlay(self, frame_bytes: bytes) -> np.ndarray:
        if _pothole_model is None or _crack_model is None:
            load_models()

        frame = cv2.imdecode(np.frombuffer(frame_bytes, np.uint8), cv2.IMREAD_COLOR)
        enh   = _preprocess_video_frame(frame)

        loop         = asyncio.get_event_loop()
        pothole_task = loop.run_in_executor(
            None, _infer_frame, _pothole_model, enh, "pothole", 320, 0.35
        )
        crack_task   = loop.run_in_executor(
            None, _infer_frame, _crack_model, enh, "crack", 320, 0.35
        )

        pothole, crack = await asyncio.gather(pothole_task, crack_task)

        dets = []
        for boxes in [pothole, crack]:
            for b in boxes:
                if b["confidence"] > 0.35:
                    dets.append([
                        b["x"], b["y"],
                        b["x"] + b["width"], b["y"] + b["height"],
                        b["confidence"],
                    ])

        dets    = np.array(dets) if dets else np.empty((0, 5))
        tracked = self.tracker.update(dets)
        return self._draw_overlay(frame, tracked)

    def _draw_overlay(self, frame: np.ndarray, tracked: np.ndarray) -> np.ndarray:
        for t in tracked:
            x1, y1, x2, y2, conf = map(int, t[:5])
            label = "Pothole" if (x2 - x1) > 60 else "Crack"
            color = (0, 255, 0) if conf > 0.6 else (0, 165, 255)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                frame, f"{label} {conf:.0%}",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1,
            )
        return frame

    async def stream_video_overlay(self, video_path: str) -> AsyncIterator[bytes]:
        cap = cv2.VideoCapture(video_path)
        try:
            fps          = int(cap.get(cv2.CAP_PROP_FPS)) or 30
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            for i in range(0, total_frames, max(1, fps // 8)):
                cap.set(cv2.CAP_PROP_POS_FRAMES, i)
                ret, frame = cap.read()
                if not ret:
                    break

                frame_bytes = cv2.imencode(
                    ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85]
                )[1].tobytes()
                annotated = await self.process_frame_overlay(frame_bytes)
                _, jpeg   = cv2.imencode(
                    ".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85]
                )
                yield jpeg.tobytes()
        finally:
            cap.release()