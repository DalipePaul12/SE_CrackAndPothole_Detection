"""
ML Router — /api/v1/ml
======================
Exposes a single synchronous endpoint:

  POST /ml/analyze
    - Accepts a raw file upload (image or short video)
    - Runs HuggingFace AI-generated detection
    - If real: runs dual YOLO (pothole + crack)
    - Returns structured JSON consumed directly by CreateReport.jsx

This endpoint intentionally does NOT write to the database.
Database persistence happens in POST /reports  +  POST /reports/{id}/media
after the user reviews the results and clicks "Submit Final Record".

Security:
  - Requires authenticated user (get_current_user)
  - Rate limited to 30/minute (analysis is GPU-bound)
  - File type + size validated before any ML work runs
  - Timeout of 90 s matches the frontend AbortController
"""

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.core.config import settings
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.enums import MediaType
from app.models.user import User
from app.services.ml_service import process_media_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ML / AI Analysis"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALLOWED_IMAGE_TYPES: set[str] = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}

_ALLOWED_VIDEO_TYPES: set[str] = {
    "video/mp4",
}


def _resolve_media_type(content_type: str) -> MediaType:
    if content_type in _ALLOWED_IMAGE_TYPES:
        return MediaType.image
    if content_type in _ALLOWED_VIDEO_TYPES:
        return MediaType.video
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail=f"Unsupported file type: '{content_type}'. Allowed: JPEG, PNG, WEBP, MP4.",
    )


def _validate_size(contents: bytes, media_type: MediaType) -> None:
    if media_type == MediaType.image:
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


# ---------------------------------------------------------------------------
# POST /ml/analyze
# ---------------------------------------------------------------------------

@router.post("/analyze", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def analyze_media(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Synchronous AI pipeline: HuggingFace detection → YOLO classification.

    Response shape (mirrors what CreateReport.jsx destructures):

      {
        "success": true,
        "data": {
          "ai_validation": {
            "is_ai_generated": false,
            "confidence": 0.12,
            "status": "approved_for_classification"   // or "rejected" | "skipped" | "error"
          },
          "prediction": {                              // null when is_ai_generated=true
            "label": "pothole",                        // "pothole" | "crack" | "uncertain" | "none"
            "confidence": 0.87,
            "severity": "critical",                   // "critical" | "low" | null
            "boxes": [...],
            "inference_time_ms": 124.5
          }
        }
      }

    On AI-generated media the response still returns HTTP 200 with
    is_ai_generated=true — the FRONTEND decides how to display it
    (flagged badge). We do NOT raise 400 here because the user should
    still be able to submit the report for admin review.

    HTTP error codes:
      400  — empty file
      413  — file too large
      415  — unsupported MIME type
      422  — ML models not loaded / AI disabled
      429  — rate limit exceeded
      500  — unexpected server error
    """

    # ── 1. Basic file validation ─────────────────────────────────────────────
    content_type = (file.content_type or "").lower()
    media_type = _resolve_media_type(content_type)

    contents: bytes = await file.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    _validate_size(contents, media_type)

    # ── 2. Run the full pipeline (HF → YOLO) ─────────────────────────────────
    try:
        result = await process_media_pipeline(contents)
    except FileNotFoundError as exc:
        # Model weights missing — surface clearly for ops team
        logger.error("Model file missing: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ML model weights not found. Contact system administrator.",
        )
    except RuntimeError as exc:
        # AI_ENABLED=False in settings
        logger.warning("ML pipeline disabled: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="AI classification is currently disabled.",
        )
    except Exception as exc:
        logger.exception("Unexpected error in ML pipeline for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Analysis failed due to an internal error. Please try again.",
        )

    # ── 3. Return structured response ────────────────────────────────────────
    ai_validation = result.get("ai_validation", {})
    prediction = result.get("prediction")  # None when is_ai_generated=True

    return {
        "success": True,
        "data": {
            "ai_validation": {
                "is_ai_generated": ai_validation.get("is_ai_generated", False),
                "confidence": ai_validation.get("confidence", 0.0),
                # "approved_for_classification" | "rejected" | "skipped" | "error"
                "status": ai_validation.get("status", "unknown"),
            },
            # Prediction is null when media is AI-generated (YOLO was skipped)
            "prediction": (
                {
                    "label": prediction.get("label", "uncertain"),
                    "confidence": prediction.get("confidence", 0.0),
                    "severity": prediction.get("severity"),     # "critical" | "low" | null
                    "boxes": prediction.get("boxes", []),
                    "inference_time_ms": prediction.get("inference_time_ms"),
                }
                if prediction is not None
                else None
            ),
        },
    }