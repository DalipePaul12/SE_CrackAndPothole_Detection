"""
ML Service — two responsibilities:
  1. YOLOv8/v11 crack & pothole detection on uploaded images
  2. AI-generated media detection via Hive Moderation API (open-source free tier)

Both run as FastAPI BackgroundTasks so the upload endpoint returns immediately
and results are written asynchronously.

Install: pip install ultralytics pillow httpx
"""
import io
import logging
import time
from pathlib import Path
from typing import Optional

import httpx
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession
from ultralytics import YOLO

from app.core.config import settings
from app.models.ai_detection_result import AIDetectionResult
from app.models.enums import DamageType, SeverityLevel
from app.models.media_attachment import MediaAttachment
from app.models.report import Report

logger = logging.getLogger(__name__)

# ── Model singleton — loaded once at startup ───────────────────────────────────

_yolo_model: Optional[YOLO] = None


def load_model() -> YOLO:
    global _yolo_model
    if _yolo_model is None:
        if not settings.AI_ENABLED:
            raise RuntimeError("AI is disabled in config.")
        if not Path(settings.YOLO_MODEL_PATH).exists():
            raise FileNotFoundError(
                f"YOLO model not found at '{settings.YOLO_MODEL_PATH}'. "
                "Download your trained model or set AI_ENABLED=False."
            )
        logger.info(f"Loading YOLO model from {settings.YOLO_MODEL_PATH}")
        _yolo_model = YOLO(settings.YOLO_MODEL_PATH)
        logger.info("YOLO model loaded successfully.")
    return _yolo_model


# ── Class / severity mapping ───────────────────────────────────────────────────

# Maps YOLO class names (from your custom crack/pothole dataset) to DamageType enum.
# Update these keys to match your dataset's class names exactly.
YOLO_CLASS_MAP: dict[str, DamageType] = {
    "pothole": DamageType.pothole,
    "crack": DamageType.crack,
    "background": DamageType.none,
}


def _confidence_to_severity(confidence: float) -> SeverityLevel:
    """
    Map detection confidence to a 4-level severity.
    Calibrate these thresholds against your validation dataset.
    """
    return SeverityLevel.critical if confidence >= 0.70 else SeverityLevel.low


# ── YOLOv8/v11 inference ───────────────────────────────────────────────────────

async def run_detection(
    db: AsyncSession,
    report: Report,
    media: MediaAttachment,
    image_bytes: bytes,
) -> None:
    """
    Runs YOLO inference on image bytes.
    Writes AIDetectionResult and updates Report summary fields.
    Designed to run as a BackgroundTask — never raises to the caller.
    """
    if not settings.AI_ENABLED:
        logger.warning("AI disabled — skipping detection.")
        return

    try:
        model = load_model()
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        start = time.perf_counter()
        results = model(img, verbose=False)
        elapsed_ms = (time.perf_counter() - start) * 1000

        # ── No detections ──────────────────────────────────────────────────────
        if not results or not results[0].boxes or len(results[0].boxes) == 0:
            detection = AIDetectionResult(
                report_id=report.id,
                media_attachment_id=media.id,
                detected_class=DamageType.none,
                severity=None,
                confidence=0.0,
                raw_output={"num_detections": 0},
                model_version=settings.YOLO_MODEL_PATH,
                inference_time_ms=elapsed_ms,
            )
            db.add(detection)
            await db.commit()
            logger.info(f"No damage detected — report={report.id}")
            return

        # ── Take highest-confidence detection ─────────────────────────────────
        boxes = results[0].boxes
        best_idx = int(boxes.conf.argmax())
        confidence = float(boxes.conf[best_idx])
        class_id = int(boxes.cls[best_idx])
        class_name = model.names[class_id].lower()

        # Reject if below threshold
        if confidence < settings.AI_CONFIDENCE_THRESHOLD:
            detected_class = DamageType.uncertain
            severity = None
        else:
            detected_class = YOLO_CLASS_MAP.get(class_name, DamageType.uncertain)
            severity = (
                _confidence_to_severity(confidence)
                if detected_class not in (DamageType.none, DamageType.uncertain)
                else None
            )

        # Build full bounding box list for the response
        bounding_boxes = []
        for i, box in enumerate(boxes.xyxy):
            bounding_boxes.append({
                "x1": float(box[0]), "y1": float(box[1]),
                "x2": float(box[2]), "y2": float(box[3]),
                "confidence": float(boxes.conf[i]),
                "class": model.names[int(boxes.cls[i])],
            })

        detection = AIDetectionResult(
            report_id=report.id,
            media_attachment_id=media.id,
            detected_class=detected_class,
            severity=severity,
            confidence=confidence,
            bounding_boxes=bounding_boxes,
            raw_output={"num_detections": len(boxes)},
            model_version=settings.YOLO_MODEL_PATH,
            inference_time_ms=elapsed_ms,
        )
        db.add(detection)

        # Update report summary (denormalized for fast list queries)
        if confidence > (report.ai_confidence or 0.0):
            report.ai_damage_type = detected_class
            report.ai_severity = severity
            report.ai_confidence = confidence

        media.is_processed = True
        await db.commit()

        logger.info(
            f"Detection complete — report={report.id} "
            f"class={detected_class.value} confidence={confidence:.3f} "
            f"severity={severity.value if severity else 'none'} "
            f"time={elapsed_ms:.1f}ms"
        )

    except Exception as e:
        logger.error(f"Detection failed for report {report.id}: {e}", exc_info=True)
        media.is_processed = True  # Prevent infinite retry loop
        try:
            await db.commit()
        except Exception:
            pass


# ── AI-generated / fake media detection (Hive Moderation) ─────────────────────

HIVE_API_URL = "https://api.thehive.ai/api/v2/task/sync"


async def detect_ai_generated(
    db: AsyncSession,
    media: MediaAttachment,
    image_bytes: bytes,
) -> None:
    """
    Calls Hive Moderation API (free-tier open-source) to detect AI-generated images.
    Updates MediaAttachment.is_ai_generated and flags the report if detected.

    Docs: https://docs.thehive.ai/docs/visual-moderation
    Set AI_FAKE_DETECTION_ENABLED=true and HIVE_API_KEY in your .env to activate.
    """
    if not settings.AI_FAKE_DETECTION_ENABLED:
        return

    hive_key = settings.HIVE_API_KEY
    if not hive_key:
        logger.warning("HIVE_API_KEY not set — skipping fake detection.")
        return

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                HIVE_API_URL,
                headers={"Authorization": f"Token {hive_key}"},
                files={"media": ("image.jpg", image_bytes, "image/jpeg")},
            )
            response.raise_for_status()
            data = response.json()

        # Parse Hive response structure
        classes = (
            data.get("status", [{}])[0]
            .get("response", {})
            .get("output", [{}])[0]
            .get("classes", [])
        )
        ai_score = next(
            (c["score"] for c in classes if c["class"] == "ai_generated"),
            0.0,
        )

        media.is_ai_generated = ai_score >= 0.5
        media.ai_generated_confidence = round(ai_score, 4)
        media.ai_generated_model_used = "hive-moderation"

        if media.is_ai_generated:
            report = await db.get(Report, media.report_id)
            if report:
                report.is_flagged_fake = True
                report.fake_confidence = round(ai_score, 4)
                logger.warning(
                    f"AI-generated media flagged — report={report.id} score={ai_score:.3f}"
                )

        await db.commit()
        logger.info(
            f"Fake detection complete — media={media.id} "
            f"ai_score={ai_score:.3f} flagged={media.is_ai_generated}"
        )

    except httpx.HTTPStatusError as e:
        logger.error(
            f"Hive API HTTP error: {e.response.status_code} — {e.response.text[:200]}"
        )
    except Exception as e:
        logger.error(f"Fake detection failed for media {media.id}: {e}", exc_info=True)