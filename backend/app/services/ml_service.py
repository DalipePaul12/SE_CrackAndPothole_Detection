from __future__ import annotations

import asyncio
import base64
import io
import logging
import math
import random
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import cv2
import httpx
import numpy as np
from PIL import Image

from app.core.config import settings
from app.services.ai_image_detector import detect_ai_generated  # ← HYBRID DETECTOR

logger = logging.getLogger(__name__)

_pothole_model = None
_crack_model = None

# ── Constants ────────────────────────────────────────────────────────────────

_HF_MODEL = "umm-maybe/AI-image-detector"
_HF_TIMEOUT = 12

REALTIME_CONF_THRESHOLD = 0.40  # Live 320px threshold; compare with _BASE_THRESHOLDS for 640px stills.
DAMAGE_PRESENCE_THRESHOLD = 0.15  # Preserve the existing crack detection floor for image presence.
CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.40

_BASE_THRESHOLDS: dict[str, float] = {
    "pothole": 0.40,
    "crack": 0.15,  # Still-image threshold; realtime crack uses REALTIME_CONF_THRESHOLD.
}

BLUR_SKIP_THRESHOLD = 15.0
BLUR_PENALTY_THRESHOLD = 100.0


# ── Model loading ────────────────────────────────────────────────────────────

def load_models() -> None:
    """Load both YOLO models into module-level globals. Idempotent.
    Downloads weight files from *_MODEL_URL if not already on disk."""
    global _pothole_model, _crack_model
    if _pothole_model is not None and _crack_model is not None:
        return

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError("ultralytics package not installed.") from exc

    pothole_path = Path(settings.POTHOLE_MODEL_PATH)
    crack_path = Path(settings.CRACK_MODEL_PATH)

    _ensure_model_downloaded(pothole_path, settings.POTHOLE_MODEL_URL, "Pothole")
    _ensure_model_downloaded(crack_path, settings.CRACK_MODEL_URL, "Crack")

    if not pothole_path.exists():
        raise FileNotFoundError(f"Pothole model not found at '{pothole_path.resolve()}'.")
    if not crack_path.exists():
        raise FileNotFoundError(f"Crack model not found at '{crack_path.resolve()}'.")

    _pothole_model = YOLO(str(pothole_path))
    _crack_model = YOLO(str(crack_path))
    logger.info("YOLO models loaded: pothole=%s  crack=%s", pothole_path, crack_path)


def _ensure_model_downloaded(path: Path, url: str, label: str) -> None:
    """Download a .pt weight file from `url` to `path` if it doesn't exist."""
    if path.exists() or not url:
        return

    logger.info("%s model missing at %s — downloading from %s", label, path, url)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".part")

    try:
        with httpx.stream("GET", url, follow_redirects=True, timeout=120) as resp:
            resp.raise_for_status()
            with open(tmp_path, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=1024 * 1024):
                    f.write(chunk)
        tmp_path.rename(path)
        logger.info("%s model downloaded: %s (%.1f MB)", label, path, path.stat().st_size / 1e6)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        logger.exception("Failed to download %s model from %s", label, url)
        raise


# ── Image pre-processing ─────────────────────────────────────────────────────

def _preprocess_frame(img_bgr: np.ndarray) -> np.ndarray:
    """FULL preprocessing for single images (CLAHE + sharpening)."""
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge([l, a, b])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)
    kernel = np.array([[0, -0.5, 0], [-0.5, 3, -0.5], [0, -0.5, 0]])
    enhanced = cv2.filter2D(enhanced, -1, kernel)
    return enhanced


def _preprocess_video_frame(img_bgr: np.ndarray) -> np.ndarray:
    """LIGHTWEIGHT preprocessing for video frames (gamma correction only)."""
    gamma = 1.1
    inv_gamma = 1.0 / gamma
    table = np.array(
        [((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]
    ).astype("uint8")
    return cv2.LUT(img_bgr, table)


# ── Blur detection ───────────────────────────────────────────────────────────

def _blur_score(img_bgr: np.ndarray) -> float:
    """Laplacian variance. Lower = more blurred."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _blur_conf_weight(blur: float) -> float:
    """Multiplier [0.5, 1.0] based on blur severity."""
    if blur >= BLUR_PENALTY_THRESHOLD:
        return 1.0
    if blur <= BLUR_SKIP_THRESHOLD:
        return 0.5
    ratio = (blur - BLUR_SKIP_THRESHOLD) / (BLUR_PENALTY_THRESHOLD - BLUR_SKIP_THRESHOLD)
    return 0.5 + 0.5 * ratio


# ── Severity classification (BINARY: critical / non_critical) ────────────────

def _compute_severity(boxes: list[dict], image_w: int, image_h: int) -> str:
    if not boxes or image_w * image_h == 0:
        return "non_critical"
    max_ratio = max(
        (b.get("width", 0) * b.get("height", 0)) / (image_w * image_h) for b in boxes
    )
    return "critical" if max_ratio >= 0.15 else "non_critical"


def _severity_from_bbox_norm(bbox: list[float], confidence: float = 0.5) -> str:
    """Confidence-only severity: >= 70% = critical, below = non_critical."""
    if not bbox or len(bbox) < 4:
        return "non_critical"
    return "critical" if confidence >= 0.70 else "non_critical"


# ── Distance feedback (calibrated for ~1.5 m) ────────────────────────────────

def _distance_feedback(bbox_norm: list[float] | None) -> dict[str, Any]:
    """
    Capture-distance guidance calibrated for ~1.5 m phone-to-subject distance.
    Reference: area ~= 0.12 at 1.5 m.
    """
    if not bbox_norm or len(bbox_norm) < 4:
        return {"ok": False, "text": "No object in frame"}

    x1, y1, x2, y2 = bbox_norm
    area = max(0.0, (x2 - x1) * (y2 - y1))

    if area < 0.03:
        return {"ok": False, "text": "Too far — move closer (~1.5 m)"}
    if area > 0.35:
        return {"ok": False, "text": "Too close — step back (~1.5 m)"}

    estimated_m = round(1.5 / math.sqrt(area / 0.12)) if area > 0 else 999
    return {"ok": True, "text": f"~{estimated_m} m — good framing"}


# ── Adaptive confidence thresholds ───────────────────────────────────────────

def _adaptive_threshold(label: str, blur: float, is_video: bool = False) -> float:
    base = _BASE_THRESHOLDS.get(label, 0.35)
    if blur < BLUR_PENALTY_THRESHOLD:
        base *= 0.85
    if is_video:
        base *= 0.90
    return max(base, 0.20)


# ── Filmstrip snapshot helper ────────────────────────────────────────────────

def _annotate_frame(frame_bgr: np.ndarray, boxes: list[dict], label: str) -> str:
    """Draw bounding boxes and return base64 JPEG."""
    annotated = frame_bgr.copy()
    color = (0, 60, 220) if label == "pothole" else (0, 140, 255)

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

        conf_pct = int(b["confidence"] * 100)
        text = f"{label.upper()} {conf_pct}%"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        pill_y1 = max(y1 - th - 8, 0)
        pill_y2 = max(y1, th + 8)
        cv2.rectangle(annotated, (x1, pill_y1), (x1 + tw + 10, pill_y2), color, -1)
        cv2.putText(
            annotated, text,
            (x1 + 5, pill_y2 - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1,
            cv2.LINE_AA,
        )

    _, jpeg = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 78])
    return base64.b64encode(jpeg.tobytes()).decode("utf-8")


# ── Core YOLO inference — LEGACY (video / realtime) ─────────────────────────

def _infer_frame(
    model,
    img_bgr: np.ndarray,
    label: str,
    imgsz: int = 640,
    conf_threshold: float | None = None,
) -> list[dict]:
    """Returns boxes in legacy format for video/realtime tracking."""
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w = img_bgr.shape[:2]
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
            "label": label,
            "x": round(x1, 2),
            "y": round(y1, 2),
            "width": round(x2 - x1, 2),
            "height": round(y2 - y1, 2),
            "confidence": round(conf, 4),
            "x_norm": round(x1 / w, 4),
            "y_norm": round(y1 / h, 4),
            "w_norm": round((x2 - x1) / w, 4),
            "h_norm": round((y2 - y1) / h, 4),
        })

    return boxes


# ── Core YOLO inference — MULTI-DETECTION + SEGMENTATION (images) ──────────

def _polygon_area(points: list[tuple[float, float]]) -> float:
    """Shoelace formula. Returns 0.0 for degenerate polygons (<3 points)."""
    if len(points) < 3:
        return 0.0
    area = 0.0
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def _infer_frame_all(
    model,
    img_bgr: np.ndarray,
    label: str,
    imgsz: int = 640,
    conf_threshold: float | None = None,
) -> list[dict]:
    """
    Run YOLO inference and return ALL detections above threshold.
    Each detection includes full box + segmentation data.
    """
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h, w = img_bgr.shape[:2]
    results = model(img_rgb, imgsz=imgsz, verbose=False)

    if not results or not results[0].boxes:
        return []

    threshold = conf_threshold if conf_threshold is not None else _BASE_THRESHOLDS.get(label, 0.35)
    detections: list[dict] = []

    result = results[0]
    has_segments = hasattr(result, 'masks') and result.masks is not None

    for i, box in enumerate(result.boxes):
        conf = float(box.conf[0])
        if conf < threshold:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()

        # Reject degenerate boxes outright — zero/negative width or height
        # can't be real damage evidence regardless of confidence.
        if (x2 - x1) <= 0 or (y2 - y1) <= 0:
            continue

        det = {
            "class": label,
            "label": label,
            "confidence": round(conf, 4),
            "severity": _severity_from_bbox_norm(
                [round(x1 / w, 4), round(y1 / h, 4),
                 round(x2 / w, 4), round(y2 / h, 4)],
                confidence=conf
            ),
            "box": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
            "norm_bbox": [
                round(x1 / w, 4), round(y1 / h, 4),
                round(x2 / w, 4), round(y2 / h, 4)
            ],
            "x_norm": round(x1 / w, 4),
            "y_norm": round(y1 / h, 4),
            "w_norm": round((x2 - x1) / w, 4),
            "h_norm": round((y2 - y1) / h, 4),
        }

        # Real segmentation mask required — no synthetic box-shaped fallback.
        # Box validity controls whether this is a detection at all (already
        # checked above). Mask validity is a SEPARATE concern: if the mask
        # extraction fails or is degenerate, we still keep the box-only
        # detection and mark the mask as unavailable, instead of dropping
        # a legitimate detection or faking a mask from the box.
        det["has_mask"] = False
        masks = result.masks if has_segments else None
        if masks is not None and i < len(masks.xy):
            segments = masks.xy[i]  # numpy array of [x, y] points
            if len(segments) >= 3:
                points = [(float(x), float(y)) for x, y in segments]
                if _polygon_area(points) > 0:
                    det["segments"] = [points]
                    det["segments_norm"] = [
                        [round(px / w, 4), round(py / h, 4)] for px, py in points
                    ]
                    det["has_mask"] = True

        detections.append(det)

    return detections

# ── Single-image YOLO wrapper — MULTI-DETECTION ───────────────────────────────

def _run_yolo_all_sync(
    model,
    image_bytes: bytes,
    label: str,
    imgsz: int = 640,
    conf_threshold: float | None = None,
) -> list[dict]:
    """
    Run YOLO on image bytes and return ALL detections above threshold.
    Handles thumbnail resizing and scales coordinates back to original size.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        orig_w, orig_h = img.size  # save BEFORE any thumbnail resize

        # Resize for inference if needed (keeps aspect ratio)
        if max(img.size) > 1280:
            img.thumbnail((1280, 1280), Image.Resampling.LANCZOS)

        inf_w, inf_h = img.size
        img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

        blur = _blur_score(img_bgr)
        img_enh = _preprocess_frame(img_bgr)

        effective_threshold = (
            conf_threshold
            if conf_threshold is not None
            else _adaptive_threshold(label, blur, is_video=False)
        )

        detections = _infer_frame_all(
            model, img_enh, label,
            imgsz=imgsz,
            conf_threshold=effective_threshold,
        )

        # Scale absolute coords back to original image dimensions if resized
        if orig_w != inf_w or orig_h != inf_h:
            scale_x = orig_w / inf_w
            scale_y = orig_h / inf_h
            for det in detections:
                if det.get("box"):
                    det["box"] = [
                        round(det["box"][0] * scale_x, 2),
                        round(det["box"][1] * scale_y, 2),
                        round(det["box"][2] * scale_x, 2),
                        round(det["box"][3] * scale_y, 2),
                    ]
                if det.get("segments"):
                    det["segments"] = [
                        [round(x * scale_x, 2), round(y * scale_y, 2)]
                        for x, y in det["segments"]
                    ]
                # norm_bbox and segments_norm are already correct
                # (computed from inference-size image, which maps 1:1 to norm)
                det["image_width"]  = orig_w
                det["image_height"] = orig_h
        else:
            for det in detections:
                det["image_width"]  = orig_w
                det["image_height"] = orig_h

        return detections

    except Exception:
        logger.exception(
            "_run_yolo_all_sync failed for label=%s imgsz=%d", label, imgsz
        )
        return []


# ── Temporal detection tracker ───────────────────────────────────────────────

class _TemporalTracker:
    MIN_FRAMES_TO_CONFIRM = 3
    CONFIRM_CONFIDENCE = 0.32
    LOW_CONF_FRAMES_WINDOW = 8
    IOU_THRESHOLD = 0.20

    def __init__(self):
        self._candidates: dict[str, list[dict]] = defaultdict(list)
        self._confirmed: list[dict] = []
        self._frame_idx: int = 0

    @staticmethod
    def _iou(a: list[float], b: list[float]) -> float:
        ix1 = max(a[0], b[0])
        iy1 = max(a[1], b[1])
        ix2 = min(a[2], b[2])
        iy2 = min(a[3], b[3])
        inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
        if inter == 0:
            return 0.0
        area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
        area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
        union = area_a + area_b - inter
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
                    candidate["last_seen"] = self._frame_idx
                    candidate["norm_bbox"] = norm_box
                    candidate["raw_box"] = box
                    matched = True
                    break

            if not matched:
                self._candidates[label].append({
                    "label": label,
                    "norm_bbox": norm_box,
                    "conf_history": [conf],
                    "bbox_history": [norm_box],
                    "frames_seen": 1,
                    "last_seen": self._frame_idx,
                    "raw_box": box,
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


# ── Video pipeline ───────────────────────────────────────────────────────────

_TARGET_FPS = 5
_MAX_FRAMES = 300
_IMGSZ_VIDEO = 480
_MAX_SNAPSHOTS = 12


def _video_ai_validation_placeholder() -> dict[str, Any]:
    return {
        "is_ai_generated": False,
        "confidence": 0.0,
        "status": "skipped",
        "method": "heuristic_fallback",
        "model": _HF_MODEL,
        "raw_scores": {},
        "flagged_frames": [],
        "total_frames_sampled": 0,
    }


def _sample_video_frames(file_path: str, max_samples: int = 10) -> list[tuple[int, bytes]]:
    """Sample one frame per second, capped for authenticity cost control."""
    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        return []
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        step = max(1, int(round(fps)))
        indices = list(range(0, total_frames, step))[:max_samples]
        sampled: list[tuple[int, bytes]] = []
        for frame_idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ok, frame = cap.read()
            if not ok:
                continue
            encoded_ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
            if encoded_ok:
                sampled.append((frame_idx, encoded.tobytes()))
        return sampled
    finally:
        cap.release()


async def _video_ai_validation(file_path: str) -> dict[str, Any]:
    """Authenticate sampled video frames before video damage inference.

    A video is flagged when more than half of its sampled frames are flagged.
    This majority rule avoids rejecting a video because of one compressed or
    otherwise ambiguous frame.
    """
    sampled_frames = await asyncio.to_thread(_sample_video_frames, file_path)
    frame_results: list[dict[str, Any]] = []
    flagged_frames: list[int] = []
    for frame_idx, frame_bytes in sampled_frames:
        result = await authenticity_service(frame_bytes)
        frame_results.append(result)
        if result["data"]["flagged"]:
            flagged_frames.append(frame_idx)

    total = len(frame_results)
    flagged_count = len(flagged_frames)
    is_flagged = total > 0 and flagged_count > total / 2
    confidence = round(
        sum(result.get("confidence", 0.0) for result in frame_results) / total,
        4,
    ) if total else 0.0
    return {
        "is_ai_generated": is_flagged,
        "confidence": confidence,
        "status": "flagged_for_review" if is_flagged else "approved_for_classification",
        "reason": "ai_generated" if is_flagged else None,
        "method": "model" if any(
            result["data"]["method"] == "model" for result in frame_results
        ) else "heuristic_fallback",
        "model": _HF_MODEL,
        "raw_scores": {},
        "flagged_frames": flagged_frames,
        "total_frames_sampled": total,
    }


def _process_video_sync(
    file_path: str,
    ai_validation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Temporal video analysis with filmstrip snapshots.
    Phase 1: Read + blur-filter frames into buffer.
    Phase 2: Parallel YOLO inference with ThreadPoolExecutor(max_workers=2).
    """
    if _pothole_model is None or _crack_model is None:
        load_models()

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        logger.error("Cannot open video: %s", file_path)
        return {
            **_no_detection_result(),
            "ai_validation": ai_validation or _video_ai_validation_placeholder(),
        }

    frame_buffer: list[np.ndarray] = []
    frame_metadata: list[dict] = []
    tracker = _TemporalTracker()
    processed = 0
    skipped_blur = 0
    frame_stats: list[dict] = []
    detection_snapshots: list[dict] = []
    t_start = time.perf_counter()

    try:
        src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        frame_indices = list(range(0, total_frames, max(1, int(src_fps))))
        if total_frames > 5:
            frame_indices.extend(
                random.sample(range(0, total_frames), min(50, total_frames // 5))
            )
        frame_indices = sorted(set(frame_indices))[:_MAX_FRAMES]

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

        skipped_blur = len(frame_indices) - len(frame_buffer)
        t_start = time.perf_counter()

        # Phase 2: Inference + filmstrip
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            for i, frame_bgr in enumerate(frame_buffer):
                blur = frame_metadata[i]["blur"]
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
                crack_boxes = crack_future.result()

                tracker.update("pothole", pothole_boxes, blur)
                tracker.update("crack", crack_boxes, blur)

                for det_label, det_boxes in [
                    ("pothole", pothole_boxes),
                    ("crack", crack_boxes),
                ]:
                    if det_boxes and len(detection_snapshots) < _MAX_SNAPSHOTS:
                        try:
                            b64 = _annotate_frame(frame_bgr, det_boxes, det_label)
                            detection_snapshots.append({
                                "frame": frame_idx,
                                "label": det_label,
                                "confidence": round(
                                    max(b["confidence"] for b in det_boxes), 4
                                ),
                                "image_b64": b64,
                            })
                        except Exception:
                            logger.warning(
                                "Snapshot failed frame=%d label=%s",
                                frame_idx, det_label, exc_info=True,
                            )

                frame_stats.append({"frame": frame_idx, "blur": round(blur, 1)})
                processed += 1

    finally:
        cap.release()
        del frame_buffer
        frame_buffer = []

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

    # Build all_detections from confirmed tracks for multi-mask support
    all_detections: list[dict] = []
    for c in tracker._confirmed:
        raw = c.get("raw_box", {})
        bbox = c.get("norm_bbox", [])
        det = {
            "class": c.get("label", "damage"),
            "label": c.get("label", "damage"),
            "confidence": c.get("avg_confidence", 0),
            "severity": _severity_from_bbox_norm(bbox, confidence=c.get("avg_confidence", 0)) if bbox else "non_critical",
            "box": [
                raw.get("x", 0),
                raw.get("y", 0),
                raw.get("x", 0) + raw.get("width", 0),
                raw.get("y", 0) + raw.get("height", 0),
            ] if raw else None,
            "norm_bbox": bbox,
            "frames_seen": c.get("frames_seen", 0),
        }
        all_detections.append(det)
    all_detections.sort(key=lambda d: d.get("confidence", 0), reverse=True)

    if best is None:
        return {
            **_no_detection_result(
                frame_stats=frame_stats,
                processed=processed,
                skipped_blur=skipped_blur,
                elapsed_s=elapsed_s,
                detection_snapshots=detection_snapshots,
            ),
            "stage": "presence",
            "status": "fail",
            "reason": "no_damage",
            "confidence": 0.0,
            "ai_validation": ai_validation or _video_ai_validation_placeholder(),
            "all_detections": all_detections,
        }

    raw = best["raw_box"]
    bbox = best["norm_bbox"]
    return {
        "detected": True,
        "stage": "passed",
        "status": "flagged_for_review" if (ai_validation or {}).get("status") == "flagged_for_review" else "pass",
        "reason": "ai_generated" if (ai_validation or {}).get("status") == "flagged_for_review" else None,
        "confidence": best["avg_confidence"],
        "ai_validation": ai_validation or _video_ai_validation_placeholder(),
        "prediction": {
            "label": best["label"],
            "confidence": best["avg_confidence"],
            "severity": _severity_from_bbox_norm(bbox, confidence=best["avg_confidence"]) if bbox else "non_critical",
            "frames_seen": best["frames_seen"],
            "boxes": [raw],
            "norm_bbox": bbox,
            "distance": _distance_feedback(bbox),
            "inference_time_ms": round(elapsed_s * 1000, 1),
        },
        "all_detections": all_detections,
        "analytics": {
            "frames_processed": processed,
            "frames_skipped_blur": skipped_blur,
            "total_frames_read": len(frame_indices),
            "elapsed_seconds": round(elapsed_s, 2),
            "frame_stats": frame_stats[-50:],
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
            "label": "none",
            "confidence": 0.0,
            "severity": None,
            "boxes": [],
            "distance": None,
        },
        "analytics": {
            "frames_processed": processed,
            "frames_skipped_blur": skipped_blur,
            "elapsed_seconds": round(elapsed_s, 2),
            "frame_stats": frame_stats or [],
            "detection_snapshots": detection_snapshots or [],
        },
    }


# ── Public async: video pipeline ─────────────────────────────────────────────

async def process_video_pipeline(file_path: str) -> dict[str, Any]:
    ai_validation = await _video_ai_validation(file_path)
    return await asyncio.to_thread(_process_video_sync, file_path, ai_validation)


# ── AI-generated detection (delegated to hybrid detector) ───────────────────

async def _check_ai_generated(image_bytes: bytes) -> dict[str, Any]:
    """
    Delegates to the hybrid detector in ai_image_detector.py.
    HF first → 8-signal hardcoded fallback → never silently passes.
    """
    return await detect_ai_generated(image_bytes)


async def authenticity_service(media_bytes: bytes) -> dict[str, Any]:
    """Run authenticity validation and expose a stable stage result."""
    result = await _check_ai_generated(media_bytes)
    is_ai_generated = bool(result.get("is_ai_generated", False))
    confidence = float(result.get("confidence", 0.0) or 0.0)
    status = "flagged_for_review" if is_ai_generated else "pass"
    logger.info(
        f"Authenticity check: method={result.get('method', 'heuristic_fallback')}, "
        f"flagged={is_ai_generated}, confidence={confidence}"
    )
    return {
        "stage": "authenticity",
        "status": status,
        "reason": "ai_generated" if is_ai_generated else None,
        "confidence": confidence,
        "data": {
            "authentic": not is_ai_generated,
            "flagged": is_ai_generated,
            "method": result.get("method", "heuristic_fallback"),
            "ai_validation": result,
        },
    }


def damage_presence_service(inference_result: dict[str, Any]) -> dict[str, Any]:
    """Determine whether model inference contains meaningful damage."""
    detections = [
        detection for detection in inference_result.get("all_detections", [])
        if float(detection.get("confidence", 0.0) or 0.0) >= DAMAGE_PRESENCE_THRESHOLD
    ]
    best_confidence = max(
        (float(detection.get("confidence", 0.0) or 0.0) for detection in detections),
        default=0.0,
    )
    passed = bool(detections)
    return {
        "stage": "presence",
        "status": "pass" if passed else "fail",
        "reason": None if passed else "no_damage",
        "confidence": best_confidence,
        "data": {"detections": detections, "detected": passed},
    }


def classification_service(inference_result: dict[str, Any]) -> dict[str, Any]:
    """Build the existing prediction/severity result from detections."""
    all_detections = sorted(
        inference_result.get("all_detections", []),
        key=lambda detection: detection.get("confidence", 0),
        reverse=True,
    )
    if not all_detections:
        return {
            "stage": "classification",
            "status": "uncertain",
            "reason": "no_damage",
            "confidence": 0.0,
            "data": {"prediction": None, "all_detections": []},
        }

    best = all_detections[0]
    best_confidence = float(best.get("confidence", 0.0) or 0.0)
    crit_dets = [d for d in all_detections if d.get("severity") == "critical"]
    if any(d.get("confidence", 0) >= 0.85 for d in crit_dets):
        overall_severity = "critical"
    elif len(crit_dets) >= 2:
        overall_severity = "critical"
    elif len(crit_dets) == 1 and crit_dets[0].get("confidence", 0) >= 0.70:
        overall_severity = "critical"
    else:
        overall_severity = "non_critical"

    prediction = {
        "label": best["class"],
        "confidence": best_confidence,
        "severity": overall_severity,
        "boxes": [best] if "box" in best else [],
        "norm_bbox": best.get("norm_bbox"),
        "distance": _distance_feedback(best.get("norm_bbox")),
        "inference_time_ms": 0.0,
    }
    is_uncertain = best_confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD
    return {
        "stage": "classification",
        "status": "uncertain" if is_uncertain else "pass",
        "reason": "low_confidence" if is_uncertain else None,
        "confidence": best_confidence,
        "data": {"prediction": prediction, "all_detections": all_detections},
    }


# ── Full pipeline — images (MULTI-DETECTION) ─────────────────────────────────

async def process_media_pipeline(image_bytes: bytes) -> dict[str, Any]:
    """
    Sequential pipeline: authenticity -> presence -> classification.
    """
    if not settings.AI_ENABLED:
        raise RuntimeError("AI_ENABLED=False in settings")

    authenticity = await authenticity_service(image_bytes)
    ai_validation = authenticity["data"]["ai_validation"]

    load_models()
    loop = asyncio.get_event_loop()
    pothole_dets, crack_dets = await asyncio.gather(
        loop.run_in_executor(None, _run_yolo_all_sync, _pothole_model, image_bytes, "pothole", 640),
        loop.run_in_executor(None, _run_yolo_all_sync, _crack_model, image_bytes, "crack", 640),
    )
    inference_result = {"all_detections": (pothole_dets or []) + (crack_dets or [])}
    presence = damage_presence_service(inference_result)
    if presence["status"] == "fail":
        return {
            **presence,
            "ai_validation": ai_validation,
            "authenticity": authenticity,
            "prediction": None,
            "all_detections": [],
        }

    classification = classification_service(inference_result)
    flagged_for_review = authenticity["status"] == "flagged_for_review"
    return {
        **classification,
        "stage": "passed" if classification["status"] == "pass" else classification["stage"],
        "status": "flagged_for_review" if flagged_for_review and classification["status"] == "pass" else classification["status"],
        "reason": "ai_generated" if flagged_for_review and classification["status"] == "pass" else classification.get("reason"),
        "ai_validation": ai_validation,
        "authenticity": authenticity,
        "prediction": classification["data"]["prediction"],
        "all_detections": classification["data"]["all_detections"],
    }


# ── Realtime lightweight inference — MULTI-DETECTION ────────────────────────────

async def run_realtime_frame(image_bytes: bytes) -> dict[str, Any]:
    if _pothole_model is None or _crack_model is None:
        load_models()

    loop = asyncio.get_event_loop()

    pothole_dets, crack_dets = await asyncio.gather(
        loop.run_in_executor(
            None, _run_yolo_all_sync, _pothole_model, image_bytes, "pothole", 320,
            REALTIME_CONF_THRESHOLD,
        ),
        loop.run_in_executor(
            None, _run_yolo_all_sync, _crack_model, image_bytes, "crack", 320,
            REALTIME_CONF_THRESHOLD,
        ),
    )

    all_detections = (pothole_dets or []) + (crack_dets or [])
    all_detections.sort(key=lambda d: d.get("confidence", 0), reverse=True)

    best = None
    if all_detections:
        crit_dets = [d for d in all_detections if d.get("severity") == "critical"]
        if any(d.get("confidence", 0) >= 0.85 for d in crit_dets):
            overall_sev = "critical"
        elif len(crit_dets) >= 2:
            overall_sev = "critical"
        elif len(crit_dets) == 1 and crit_dets[0].get("confidence", 0) >= 0.70:
            overall_sev = "critical"
        else:
            overall_sev = "non_critical"
            
        best = {
            "label": all_detections[0]["class"],
            "confidence": all_detections[0]["confidence"],
            "severity": overall_sev,
            "boxes": all_detections,
            "norm_bbox": all_detections[0].get("norm_bbox"),
            "distance": _distance_feedback(all_detections[0].get("norm_bbox")),
        }

    return {
        "detected": len(all_detections) > 0,
        "prediction": best,
        "all_detections": all_detections,
    }


# ── Sync wrapper for background task workers ──────────────────────────────────

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
        pred["all_detections"] = result.get("all_detections", [])
        return pred

    try:
        with open(file_path, "rb") as f:
            image_bytes = f.read()
    except OSError:
        logger.error("run_yolo: cannot read file at %s", file_path)
        return None

    if _pothole_model is None or _crack_model is None:
        load_models()

    pothole_dets = _run_yolo_all_sync(_pothole_model, image_bytes, "pothole", 640)
    crack_dets   = _run_yolo_all_sync(_crack_model, image_bytes, "crack", 640)
    all_detections = (pothole_dets or []) + (crack_dets or [])
    all_detections.sort(key=lambda d: d.get("confidence", 0), reverse=True)

    if not all_detections:
        return None

    best = all_detections[0]
    crit_dets = [d for d in all_detections if d.get("severity") == "critical"]
    if any(d.get("confidence", 0) >= 0.85 for d in crit_dets):
        overall_sev = "critical"
    elif len(crit_dets) >= 2:
        overall_sev = "critical"
    elif len(crit_dets) == 1 and crit_dets[0].get("confidence", 0) >= 0.70:
        overall_sev = "critical"
    else:
        overall_sev = "non_critical"
    
    return {
        "label": best["class"],
        "confidence": best["confidence"],
        "severity": overall_sev,
        "boxes": all_detections,
        "norm_bbox": best.get("norm_bbox"),
        "distance": _distance_feedback(best.get("norm_bbox")),
        "all_detections": all_detections,
    }

