

import logging
from pathlib import Path
import tempfile
import os

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
import aiofiles
from app.services.ml_service import MLRealtimeService, _pothole_model, _crack_model

from app.core.config import settings
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.enums import MediaType
from app.models.user import User
from app.services.ml_service import (
    process_media_pipeline,
    process_video_pipeline,
    run_realtime_frame,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ML / AI Analysis"])

# ── Allowed MIME types ─────────────────────────────────────────────────────────

_ALLOWED_IMAGE_TYPES: set[str] = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_ALLOWED_VIDEO_TYPES: set[str] = {"video/mp4", "video/quicktime", "video/x-msvideo"}

ml_realtime = MLRealtimeService()
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


# ── POST /ml/analyze  (image pipeline) ───────────────────────────────────────

@router.post("/analyze", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def analyze_media(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Full two-stage pipeline: HuggingFace AI detection → dual YOLO (images only).

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

    if media_type == MediaType.video:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Use /ml/analyze/video for video files.",
        )

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


# ── POST /ml/analyze/video  (temporal video pipeline) ────────────────────────

@router.post("/analyze/video", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")   # lower limit — video is expensive
async def analyze_video(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Temporal multi-frame video analysis.

    Samples frames at ~5 FPS, applies CLAHE preprocessing + ROI masking,
    runs dual YOLO with adaptive thresholds, confirms detections through
    a temporal tracker (must appear in 3+ frames with consistent bbox).

    Response shape:
      {
        "success": true,
        "data": {
          "detected": bool,
          "prediction": {
            "label", "confidence", "severity",
            "frames_seen", "boxes", "norm_bbox", "distance",
            "inference_time_ms"
          } | null,
          "analytics": {
            "frames_processed", "frames_skipped_blur",
            "elapsed_seconds", "frame_stats"
          }
        }
      }
    """
    content_type = (file.content_type or "").lower()

    # Accept both explicit video MIME types and fall back on filename extension
    is_video = content_type in _ALLOWED_VIDEO_TYPES or (
        file.filename and Path(file.filename).suffix.lower() in {".mp4", ".mov", ".avi"}
    )

    if not is_video:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Only MP4, MOV, or AVI video files are supported.",
        )

    contents: bytes = await file.read()
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded video is empty.")

    _validate_size(contents, MediaType.video)

    # Write to a temp file — OpenCV needs a file path, not bytes
    suffix = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"
    tmp_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        result = await process_video_pipeline(tmp_path)

    except FileNotFoundError as exc:
        logger.error("Model file missing (video): %s", exc)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "ML model weights not found. Contact system administrator.",
        )
    except Exception:
        logger.exception("Video pipeline error for user %s", current_user.id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Video analysis failed due to an internal error. Please try again.",
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    prediction = result.get("prediction") if result.get("detected") else None
    analytics  = result.get("analytics", {})

    return {
        "success": True,
        "data": {
            "detected":  result.get("detected", False),
            "prediction": (
                {
                    "label":             prediction.get("label", "uncertain"),
                    "confidence":        prediction.get("confidence", 0.0),
                    "severity":          prediction.get("severity"),
                    "frames_seen":       prediction.get("frames_seen", 0),
                    "boxes":             prediction.get("boxes", []),
                    "norm_bbox":         prediction.get("norm_bbox"),
                    "distance":          prediction.get("distance"),
                    "inference_time_ms": prediction.get("inference_time_ms"),
                }
                if prediction is not None
                else None
            ),
            "analytics": {
                "frames_processed":    analytics.get("frames_processed", 0),
                "frames_skipped_blur": analytics.get("frames_skipped_blur", 0),
                "elapsed_seconds":     analytics.get("elapsed_seconds", 0.0),
                "frame_stats":         analytics.get("frame_stats", []),
            },
        },
    }


# ── POST /ml/analyze/realtime  (live camera overlay) ─────────────────────────

@router.post("/analyze/realtime", status_code=status.HTTP_200_OK)
@limiter.limit("120/minute")
async def analyze_realtime(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Lightweight single-frame detection for live camera overlay.
    Skips HuggingFace check, runs at 320 px for speed (~50–150 ms).
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
        logger.exception("Realtime frame error for user %s", current_user.id)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Frame analysis failed. Please try again.",
        )

    return {"success": True, "data": result}

from app.services.ml_service import MLRealtimeService
ml_realtime = MLRealtimeService()

@router.websocket("/ws/realtime-overlay")
async def ws_realtime_overlay(websocket: WebSocket):
    await websocket.accept()
    try:
        async for frame_bytes in _stream_frames(websocket):
            annotated = await ml_realtime.process_frame_overlay(frame_bytes)
            _, jpeg = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            await websocket.send_bytes(jpeg.tobytes())
    except WebSocketDisconnect:
        pass

async def _stream_frames(ws: WebSocket) -> AsyncIterator[bytes]:
    while True:
        data = await ws.receive_bytes()
        yield data

@router.post("/ml/video-overlay-stream")
async def video_overlay_stream(file: UploadFile):
    tmp_path = await _save_tmp_video(file)
    async for frame_bytes in ml_realtime.stream_video_overlay(tmp_path):
        yield StreamingResponse(
            iter([frame_bytes]), 
            media_type="image/jpeg"
        )
        
async def _save_tmp_video(file: UploadFile) -> str:
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        contents = await file.read()
        tmp.write(contents)
        return tmp.name