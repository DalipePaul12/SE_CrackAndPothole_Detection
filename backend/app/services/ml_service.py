"""
ML Service — AI pipeline for pothole/crack detection.

Two public entry points:
  process_media_pipeline  — full HF + dual-YOLO pipeline (post-capture)
  run_realtime_frame      — lightweight single-frame inference for live camera overlay
  run_yolo                — synchronous wrapper used by background task workers
"""

from __future__ import annotations

import asyncio
import io
import logging
import time
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

_pothole_model = None
_crack_model   = None

# ── Model loading ─────────────────────────────────────────────────────────────

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

# ── HuggingFace AI-generated detection ───────────────────────────────────────

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

# ── Severity from bounding-box area ratio ─────────────────────────────────────

def _compute_severity(boxes: list[dict], image_w: int, image_h: int) -> str:
    if not boxes or image_w * image_h == 0:
        return "low"
    max_ratio = max(
        (b.get("width", 0) * b.get("height", 0)) / (image_w * image_h) for b in boxes
    )
    return "critical" if max_ratio >= 0.10 else "low"

# ── Distance feedback from normalised bounding box ────────────────────────────

def _distance_feedback(bbox_norm: list[float] | None) -> dict[str, Any]:
    """
    Returns distance estimate based on bbox area fraction (normalised 0-1 coords).
    Optimal area ~0.05–0.35 corresponds to roughly 5–15 m framing.
    """
    if not bbox_norm or len(bbox_norm) < 4:
        return {"ok": False, "text": "No object in frame"}
    x1, y1, x2, y2 = bbox_norm
    area = max(0.0, (x2 - x1) * (y2 - y1))
    if area < 0.02:
        return {"ok": False, "text": "Too far — move closer (~10 m)"}
    if area > 0.40:
        return {"ok": False, "text": "Too close — step back (~10 m)"}
    # Rough inverse-square estimate: ~10 m at area=0.10
    estimated_m = round(10 / (area ** 0.5)) if area > 0 else 999
    return {"ok": True, "text": f"~{estimated_m} m — good framing"}

# ── Core YOLO inference (sync, runs in executor) ──────────────────────────────

def _run_yolo_sync(
    model,
    image_bytes: bytes,
    label: str,
    imgsz: int = 640,
) -> dict[str, Any] | None:
    """Run a single YOLO model on image bytes. Returns None if no detection above threshold."""
    CONF_THRESHOLD = 0.40

    try:
        img    = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img.size
        img_np = np.array(img)

        t0      = time.perf_counter()
        results = model(img_np, imgsz=imgsz, verbose=False)
        elapsed = (time.perf_counter() - t0) * 1000

        if not results or not results[0].boxes:
            return None

        all_boxes: list[dict] = []
        best_conf = 0.0

        for box in results[0].boxes:
            conf = float(box.conf[0])
            if conf < CONF_THRESHOLD:
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            entry = {
                "x":          round(x1, 2),
                "y":          round(y1, 2),
                "width":      round(x2 - x1, 2),
                "height":     round(y2 - y1, 2),
                "confidence": round(conf, 4),
                # Normalised coords for frontend overlay
                "x_norm": round(x1 / img_w, 4),
                "y_norm": round(y1 / img_h, 4),
                "w_norm": round((x2 - x1) / img_w, 4),
                "h_norm": round((y2 - y1) / img_h, 4),
            }
            all_boxes.append(entry)
            if conf > best_conf:
                best_conf = conf

        if not all_boxes:
            return None

        best_box    = max(all_boxes, key=lambda b: b["confidence"])
        norm_bbox   = [
            best_box["x_norm"],
            best_box["y_norm"],
            best_box["x_norm"] + best_box["w_norm"],
            best_box["y_norm"] + best_box["h_norm"],
        ]

        return {
            "label":             label,
            "confidence":        round(best_conf, 4),
            "severity":          _compute_severity(all_boxes, img_w, img_h),
            "boxes":             all_boxes,
            "norm_bbox":         norm_bbox,
            "distance":          _distance_feedback(norm_bbox),
            "inference_time_ms": round(elapsed, 2),
        }

    except Exception:
        logger.exception("_run_yolo_sync failed for label=%s", label)
        return None

# ── Realtime lightweight inference (live camera frame) ───────────────────────

async def run_realtime_frame(image_bytes: bytes) -> dict[str, Any]:
    """
    Fast single-frame detection for live camera overlay.
    Runs at reduced resolution (320 px) for speed — skips HF authenticity check.
    """
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
            "detected": False,
            "prediction": {"label": "none", "confidence": 0.0, "severity": None, "boxes": [], "distance": None},
        }

    best = max(candidates, key=lambda r: r["confidence"])
    return {
        "detected":   True,
        "prediction": best,
    }

# ── Full pipeline (post-capture) ──────────────────────────────────────────────

async def process_media_pipeline(image_bytes: bytes) -> dict[str, Any]:
    """
    Full two-stage pipeline:
      1. HuggingFace AI-generated detection
      2. Dual YOLO (pothole + crack) — skipped if image is flagged as AI-generated
    """
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
        else {"label": "none", "confidence": 0.0, "severity": None, "boxes": [], "distance": None, "inference_time_ms": 0.0}
    )

    return {"ai_validation": ai_validation, "prediction": prediction}

# ── Synchronous wrapper for background task workers ───────────────────────────

def run_yolo(file_path: str) -> dict[str, Any] | None:
    """Read image from disk and run both models. Used by Celery/background workers."""
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