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
_crack_model = None


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


_HF_MODEL   = "dima806/deepfake_vs_real_image_detection"
_HF_TIMEOUT = 30


async def _check_ai_generated(image_bytes: bytes) -> dict[str, Any]:
    if not settings.AI_FAKE_DETECTION_ENABLED:
        return {"is_ai_generated": False, "confidence": 0.0, "status": "skipped", "raw_scores": {}}

    token = (settings.HF_API_TOKEN or "").strip()
    if not token or len(token) < 20:
        return {"is_ai_generated": False, "confidence": 0.0, "status": "error", "raw_scores": {}}

    url = f"https://router.huggingface.co/hf-inference/models/{_HF_MODEL}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream",
    }

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

        THRESHOLD = 0.40
        is_ai = artificial_score >= THRESHOLD
        confidence = artificial_score if is_ai else real_score

        return {
            "is_ai_generated": is_ai,
            "confidence": round(confidence, 4),
            "status": "rejected" if is_ai else "approved_for_classification",
            "raw_scores": scores,
        }

    except Exception as e:
        logger.error("HF Request Failed: %s", e)
        return {"is_ai_generated": False, "confidence": 0.0, "status": "error", "raw_scores": {}}


def _compute_severity(boxes: list[dict], image_w: int, image_h: int) -> str:
    if not boxes:
        return "low"
    image_area = image_w * image_h
    if image_area == 0:
        return "low"
    max_ratio = max((b.get("width", 0) * b.get("height", 0)) / image_area for b in boxes)
    return "critical" if max_ratio >= 0.10 else "low"


def _run_yolo_sync(model, image_bytes: bytes, label: str) -> dict[str, Any] | None:
    CONF_THRESHOLD = 0.40

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img.size
        img_np = np.array(img)

        t0 = time.perf_counter()
        results = model(img_np, verbose=False)
        inference_ms = (time.perf_counter() - t0) * 1000

        if not results or len(results) == 0:
            return None

        boxes_raw = results[0].boxes
        if boxes_raw is None or len(boxes_raw) == 0:
            return None

        best_conf = 0.0
        all_boxes = []

        for box in boxes_raw:
            conf = float(box.conf[0])
            if conf < CONF_THRESHOLD:
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            box_dict = {
                "x": round(x1, 2),
                "y": round(y1, 2),
                "width":  round(x2 - x1, 2),
                "height": round(y2 - y1, 2),
                "confidence": round(conf, 4),
            }
            all_boxes.append(box_dict)
            if conf > best_conf:
                best_conf = conf

        if not all_boxes:
            return None

        return {
            "label":             label,
            "confidence":        round(best_conf, 4),
            "severity":          _compute_severity(all_boxes, img_w, img_h),
            "boxes":             all_boxes,
            "inference_time_ms": round(inference_ms, 2),
        }

    except Exception:
        logger.exception("_run_yolo_sync failed for label=%s", label)
        return None


def run_yolo(file_path: str) -> dict[str, Any] | None:
    """
    Public synchronous wrapper used by ml_task_service.
    Reads file from disk, runs both models, returns highest-confidence result.
    """
    try:
        with open(file_path, "rb") as f:
            image_bytes = f.read()
    except OSError:
        logger.error("run_yolo: cannot read file at %s", file_path)
        return None

    if _pothole_model is None or _crack_model is None:
        load_models()

    pothole = _run_yolo_sync(_pothole_model, image_bytes, "pothole")
    crack   = _run_yolo_sync(_crack_model,   image_bytes, "crack")

    candidates = [r for r in (pothole, crack) if r is not None]
    if not candidates:
        return None
    return max(candidates, key=lambda r: r["confidence"])


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
        loop.run_in_executor(None, _run_yolo_sync, _pothole_model, image_bytes, "pothole"),
        loop.run_in_executor(None, _run_yolo_sync, _crack_model,   image_bytes, "crack"),
    )

    candidates = [r for r in (pothole_result, crack_result) if r is not None]

    if not candidates:
        prediction = {"label": "none", "confidence": 0.0, "severity": None, "boxes": [], "inference_time_ms": 0.0}
    else:
        prediction = max(candidates, key=lambda r: r["confidence"])

    return {"ai_validation": ai_validation, "prediction": prediction}