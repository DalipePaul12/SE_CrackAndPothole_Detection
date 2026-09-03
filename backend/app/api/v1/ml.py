import asyncio
import cv2
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import AsyncIterator

import aiofiles
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.enums import MediaType
from app.models.user import User
from app.services.ml_service import (
    MLRealtimeService,
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


# ── POST /ml/analyze  (image pipeline — MULTI-DETECTION) ─────────────────────

@router.post("/analyze", status_code=status.HTTP_200_OK)
@limiter.limit("30/minute")
async def analyze_media(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Full two-stage pipeline: HuggingFace AI detection → dual YOLO (images only).
    Returns ALL detections for multi-mask segmentation support.
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
    all_detections = result.get("all_detections", [])

    return {
        "success": True,
        "data": {
            "ai_validation": {
                "is_ai_generated": ai_validation.get("is_ai_generated", False),
                "confidence":      ai_validation.get("confidence", 0.0),
                "status":          ai_validation.get("status", "unknown"),
                "raw_scores":      ai_validation.get("raw_scores", {}),
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
            "all_detections": [
                {
                    "class":          d.get("class", "damage"),
                    "label":          d.get("label", d.get("class", "damage")),
                    "confidence":     d.get("confidence", 0),
                    "severity":       d.get("severity"),
                    "box":            d.get("box"),
                    "norm_bbox":      d.get("norm_bbox"),
                    "segments":       d.get("segments"),
                    "segments_norm":  d.get("segments_norm"),
                    "image_width":    d.get("image_width"),
                    "image_height":   d.get("image_height"),
                    "x_norm":         d.get("x_norm"),
                    "y_norm":         d.get("y_norm"),
                    "w_norm":         d.get("w_norm"),
                    "h_norm":         d.get("h_norm"),
                }
                for d in all_detections
            ],
        },
    }


# ── POST /ml/analyze/video  (temporal video pipeline) ─────────────────────────

@router.post("/analyze/video", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def analyze_video(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Temporal multi-frame video analysis.
    """
    content_type = (file.content_type or "").lower()

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

    suffix   = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"
    tmp_path: str | None = None

    try:
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=f"_{uuid.uuid4().hex}{suffix}")
        os.close(tmp_fd)

        async with aiofiles.open(tmp_path, "wb") as tmp:
            await tmp.write(contents)

        result = await asyncio.shield(process_video_pipeline(tmp_path))

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
            try:
                os.unlink(tmp_path)
            except PermissionError:
                import atexit
                _path = tmp_path
                atexit.register(
                    lambda p=_path: os.path.exists(p) and os.unlink(p)
                )
                logger.warning("PermissionError deleting temp file (deferred): %s", tmp_path)
            except OSError:
                logger.warning("Could not delete temp file: %s", tmp_path)

    prediction = result.get("prediction") if result.get("detected") else None
    analytics  = result.get("analytics", {})
    all_detections = result.get("all_detections", [])

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
            "all_detections": [
                {
                    "class": d.get("class", "damage"),
                    "confidence": d.get("confidence", 0),
                    "severity": d.get("severity"),
                    "box": d.get("box"),
                    "norm_bbox": d.get("norm_bbox"),
                    "frames_seen": d.get("frames_seen"),
                }
                for d in all_detections
            ],
            "analytics": {
                "frames_processed":    analytics.get("frames_processed", 0),
                "frames_skipped_blur": analytics.get("frames_skipped_blur", 0),
                "elapsed_seconds":     analytics.get("elapsed_seconds", 0.0),
                "frame_stats":         analytics.get("frame_stats", []),
            },
        },
    }


# ── POST /ml/analyze/realtime  (live camera overlay — MULTI-DETECTION) ────────

@router.post("/analyze/realtime", status_code=status.HTTP_200_OK)
@limiter.limit("300/minute")
async def analyze_realtime(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Lightweight single-frame detection for live camera overlay.
    Skips HuggingFace check, runs at 320 px for speed (~50–150 ms).

    NOTE: limit raised from 120/minute to 300/minute — the frontend
    self-pacing loop in CreateReport.jsx sends a frame roughly every
    350ms (~171 req/min max), which was blowing past the old 120/minute
    cap after ~20s of continuous camera use. Once rate-limited, frames
    silently stopped updating the overlay with no visible error, which
    looked identical to "detection never worked at all."
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

    return {
        "success": True,
        "data": {
            "detected": result.get("detected", False),
            "prediction": result.get("prediction"),
            "all_detections": result.get("all_detections", []),
        },
    }


# ── WebSocket /ml/ws/realtime-overlay ─────────────────────────────────────────

@router.websocket("/ws/realtime-overlay")
async def ws_realtime_overlay(websocket: WebSocket):
    """
    Receives raw JPEG frames from the client over WebSocket,
    runs YOLO inference, and streams back annotated JPEG frames.
    """
    await websocket.accept()
    try:
        async for frame_bytes in _stream_frames(websocket):
            annotated = await ml_realtime.process_frame_overlay(frame_bytes)
            ok, jpeg_buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ok:
                await websocket.send_bytes(jpeg_buf.tobytes())
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_realtime_overlay error")


_WS_MAX_FPS      = 30
_WS_FRAME_INTERVAL = 1.0 / _WS_MAX_FPS


async def _stream_frames(ws: WebSocket) -> AsyncIterator[bytes]:
    """
    Yield raw bytes from the WebSocket until disconnect.
    Throttles to _WS_MAX_FPS (30) by dropping frames that arrive too fast.
    """
    last_yield_time: float = 0.0
    loop = asyncio.get_event_loop()

    while True:
        try:
            data = await ws.receive_bytes()
            now  = loop.time()

            if now - last_yield_time < _WS_FRAME_INTERVAL:
                continue

            last_yield_time = now
            yield data

        except WebSocketDisconnect:
            break


# ── POST /ml/video-overlay-stream (MJPEG streaming response) ──────────────────

@router.post("/video-overlay-stream")
async def video_overlay_stream(file: UploadFile):
    """
    Accepts a video upload and streams back annotated MJPEG frames.
    Media type: multipart/x-mixed-replace; boundary=frame
    """
    tmp_path = await _save_tmp_video(file)

    async def _frame_generator():
        try:
            async for jpeg_bytes in ml_realtime.stream_video_overlay(tmp_path):
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + jpeg_bytes
                    + b"\r\n"
                )
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except PermissionError:
                    import atexit
                    _path = tmp_path
                    atexit.register(
                        lambda p=_path: os.path.exists(p) and os.unlink(p)
                    )
                    logger.warning("PermissionError deleting stream temp file (deferred): %s", tmp_path)
                except OSError:
                    logger.warning("Could not delete stream temp file: %s", tmp_path)

    return StreamingResponse(
        _frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


async def _save_tmp_video(file: UploadFile) -> str:
    """
    Write uploaded video to a uniquely named temp file using async I/O.
    """
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=f"_{uuid.uuid4().hex}{suffix}")
    os.close(tmp_fd)

    async with aiofiles.open(tmp_path, "wb") as f:
        while True:
            chunk = await file.read(256 * 1024)
            if not chunk:
                break
            await f.write(chunk)

    return tmp_path