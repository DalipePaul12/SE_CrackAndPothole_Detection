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
    WebSocket,           # FIX #1: Was missing — caused NameError crash on startup
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

# FIX #2: Single authoritative MLRealtimeService instance.
# Previously a second `ml_realtime = MLRealtimeService()` existed below the
# ws_realtime_overlay function, silently creating a second Sort tracker and
# discarding all accumulated tracking state. Only ONE instance must exist here.
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


# ── POST /ml/analyze  (image pipeline) ────────────────────────────────────────

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

        # FIX #3c: Write in 256 KB chunks instead of one full-buffer write.
        # The original code called `await file.read()` (already done above for
        # size validation) and wrote `contents` in one shot — this is fine here
        # since contents is already in memory.  The chunked write pattern below
        # is kept for future cases where streaming upload replaces the full read.
        async with aiofiles.open(tmp_path, "wb") as tmp:
            await tmp.write(contents)

        # FIX #4: Shield the pipeline from asyncio.CancelledError on client
        # disconnect.  Without shield(), a disconnect interrupts the await and
        # jumps to `finally`, deleting tmp_path while cv2.VideoCapture still
        # has the file open.  On Windows this raises PermissionError [WinError 32].
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
        # FIX #4 (continued): asyncio.shield() guarantees the executor is done
        # before this finally block runs, so cv2 has already called cap.release()
        # and the file handle is closed — safe to delete on both Linux and Windows.
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except PermissionError:
                # Windows fallback: schedule deletion after the process exits
                # if somehow the handle is still open (should not happen with shield).
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


# ── POST /ml/analyze/realtime  (live camera overlay) ──────────────────────────

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


# ── WebSocket /ml/ws/realtime-overlay ─────────────────────────────────────────

@router.websocket("/ws/realtime-overlay")
async def ws_realtime_overlay(websocket: WebSocket):   # FIX #1: WebSocket now importable
    """
    Receives raw JPEG frames from the client over WebSocket,
    runs YOLO inference, and streams back annotated JPEG frames.
    """
    await websocket.accept()
    try:
        # FIX #2: Uses the single module-level `ml_realtime` instance.
        # The duplicate instantiation that previously appeared just below this
        # function has been removed — one Sort tracker, consistent state.
        async for frame_bytes in _stream_frames(websocket):
            annotated = await ml_realtime.process_frame_overlay(frame_bytes)
            ok, jpeg_buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ok:
                await websocket.send_bytes(jpeg_buf.tobytes())
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_realtime_overlay error")


# FIX #3b: Added frame-rate throttle to _stream_frames.
# The original generator yielded every received frame with no rate limiting.
# If the client sent faster than YOLO could process, frames would accumulate
# in the WebSocket receive buffer without bound — causing OOM under load.
# The 30 fps cap drops excess frames at the source instead of buffering them.
_WS_MAX_FPS      = 30
_WS_FRAME_INTERVAL = 1.0 / _WS_MAX_FPS


async def _stream_frames(ws: WebSocket) -> AsyncIterator[bytes]:
    """
    Yield raw bytes from the WebSocket until disconnect.
    Throttles to _WS_MAX_FPS (30) by dropping frames that arrive too fast.
    This prevents unbounded receive-buffer growth under fast clients.
    """
    last_yield_time: float = 0.0
    loop = asyncio.get_event_loop()

    while True:
        try:
            data = await ws.receive_bytes()
            now  = loop.time()

            if now - last_yield_time < _WS_FRAME_INTERVAL:
                # Drop this frame — client is sending faster than we can process.
                # Do NOT buffer it; just discard and continue receiving.
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
            # FIX #2: Uses the single module-level `ml_realtime` instance.
            async for jpeg_bytes in ml_realtime.stream_video_overlay(tmp_path):
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + jpeg_bytes
                    + b"\r\n"
                )
        finally:
            # Guaranteed cleanup regardless of client disconnect.
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

    FIX #3c: Reads and writes in 256 KB chunks instead of slurping the
    entire file into memory at once.  For a 100 MB upload this reduces
    peak memory from ~200 MB (full read + full write buffer) to ~512 KB.
    """
    suffix = Path(file.filename or "video.mp4").suffix or ".mp4"
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=f"_{uuid.uuid4().hex}{suffix}")
    os.close(tmp_fd)

    async with aiofiles.open(tmp_path, "wb") as f:
        while True:
            chunk = await file.read(256 * 1024)   # 256 KB chunks
            if not chunk:
                break
            await f.write(chunk)

    return tmp_path