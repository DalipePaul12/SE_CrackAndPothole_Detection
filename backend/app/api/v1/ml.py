"""
ML Router — /api/v1/ml

Endpoints:
  POST /ml/analyze          — Full HF + dual-YOLO pipeline (post-capture / upload)
  POST /ml/analyze/realtime — Lightweight frame detection for live camera overlay
"""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.core.config import settings
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.enums import MediaType
from app.models.user import User
from app.services.ml_service import process_media_pipeline, run_realtime_frame

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ML / AI Analysis"])

# ── Allowed MIME types ─────────────────────────────────────────────────────────

_ALLOWED_IMAGE_TYPES: set[str] = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_ALLOWED_VIDEO_TYPES: set[str] = {"video/mp4"}


def _resolve_media_type(content_type: str) -> MediaType:
    if content_type in _ALLOWED_IMAGE_TYPES:
        return MediaType.image
    if content_type in _ALLOWED_VIDEO_TYPES:
        return MediaType.video
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail=f"Unsupported file type: '{content_type}'. Allowed: JPEG, PNG, WEBP, MP4.",
    )


def _validate_size(contents: bytes, media_type: MediaType, realtime: bool = False) -> None:
    if realtime:
        # Frames capped at 2 MB for speed
        max_bytes = 2 * 1024 * 1024
        label = "2 MB"
    elif media_type == MediaType.image:
        max_bytes = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
        label = f"{settings.MAX_IMAGE_SIZE_MB} MB"
    else:
        max_bytes = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024
        label = f"{settings.MAX_VIDEO_SIZE_MB} MB"

    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum allowed size is {label}.",
        )

# ── POST /ml/analyze  (full pipeline) ────────────────────────────────────────

@router.post("/analyze", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def analyze_media(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Full two-stage pipeline: HuggingFace AI detection → dual YOLO classification.

    Returns HTTP 200 even when is_ai_generated=True so the frontend can
    display the flagged badge and still allow report submission for admin review.

    Response shape:
      {
        "success": true,
        "data": {
          "ai_validation": { "is_ai_generated", "confidence", "status" },
          "prediction": {
            "label", "confidence", "severity",
            "boxes", "norm_bbox", "distance", "inference_time_ms"
          } | null
        }
      }
    """
    content_type = (file.content_type or "").lower()
    media_type   = _resolve_media_type(content_type)

    contents: bytes = await file.read()
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")

    _validate_size(contents, media_type)

    try:
        result = await process_media_pipeline(contents)
    except FileNotFoundError as exc:
        logger.error("Model file missing: %s", exc)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "ML model weights not found. Contact system administrator.",
        )
    except RuntimeError as exc:
        logger.warning("ML pipeline disabled: %s", exc)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "AI classification is currently disabled.",
        )
    except Exception:
        logger.exception("Unexpected ML pipeline error for user %s", current_user.id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Analysis failed due to an internal error. Please try again.",
        )

    ai_validation = result.get("ai_validation", {})
    prediction    = result.get("prediction")

    return {
        "success": True,
        "data": {
            "ai_validation": {
                "is_ai_generated": ai_validation.get("is_ai_generated", False),
                "confidence":      ai_validation.get("confidence", 0.0),
                "status":          ai_validation.get("status", "unknown"),
            },
            "prediction": (
                {
                    "label":             prediction.get("label", "uncertain"),
                    "confidence":        prediction.get("confidence", 0.0),
                    "severity":          prediction.get("severity"),
                    "boxes":             prediction.get("boxes", []),
                    "norm_bbox":         prediction.get("norm_bbox"),
                    "distance":          prediction.get("distance"),
                    "inference_time_ms": prediction.get("inference_time_ms"),
                }
                if prediction is not None
                else None
            ),
        },
    }


# ── POST /ml/analyze/realtime  (live camera overlay) ─────────────────────────

@router.post("/analyze/realtime", status_code=status.HTTP_200_OK)
@limiter.limit("120/minute")   # Higher limit — called every 600 ms per active camera
async def analyze_realtime(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Lightweight single-frame detection for live camera overlay.

    Skips HuggingFace AI-generated check and runs both YOLO models at
    320 px resolution for fast turnaround (~50–150 ms on GPU).

    Returns distance feedback alongside bbox so the frontend can render
    the green/red framing indicator without extra computation.

    Response shape:
      {
        "success": true,
        "data": {
          "detected": bool,
          "prediction": {
            "label", "confidence", "severity",
            "boxes", "norm_bbox", "distance": { "ok", "text" },
            "inference_time_ms"
          }
        }
      }
    """
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Realtime frames must be JPEG, PNG, or WEBP.",
        )

    contents: bytes = await file.read()
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Frame is empty.")

    _validate_size(contents, MediaType.image, realtime=True)

    try:
        result = await run_realtime_frame(contents)
    except FileNotFoundError as exc:
        logger.error("Model file missing (realtime): %s", exc)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "ML model weights not found.",
        )
    except Exception:
        logger.exception("Realtime frame analysis error for user %s", current_user.id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Frame analysis failed. Please try again.",
        )

    return {
        "success": True,
        "data": result,
    }