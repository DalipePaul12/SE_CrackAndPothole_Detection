from __future__ import annotations

import io
import logging
import tempfile
from pathlib import Path

import cv2
from PIL import Image

logger = logging.getLogger(__name__)

MAX_IMAGE_DIMENSION = 4096
MIN_IMAGE_DIMENSION = 32

_VIDEO_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
}

_IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
}


def validate_image_bytes(data: bytes) -> tuple[bool, str]:
    if not data:
        return False, "Empty file."

    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception as e:
        return False, f"Invalid image file: {e}"

    try:
        img = Image.open(io.BytesIO(data))
        width, height = img.size
    except Exception as e:
        return False, f"Cannot read image dimensions: {e}"

    if width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION:
        return (
            False,
            f"Image too small ({width}x{height}). Minimum size is {MIN_IMAGE_DIMENSION}px.",
        )

    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        return (
            False,
            f"Image too large ({width}x{height}). Maximum size is {MAX_IMAGE_DIMENSION}px.",
        )

    if img.mode not in ("RGB", "RGBA", "L", "P"):
        return False, f"Unsupported image mode: {img.mode}"

    return True, "OK"


def prepare_for_inference(data: bytes) -> bytes:
    img = Image.open(io.BytesIO(data)).convert("RGB")

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=92)

    return buffer.getvalue()


def validate_video_bytes(
    data: bytes,
    filename: str = "",
) -> tuple[bool, str]:
    if not data:
        return False, "Empty file."

    if len(data) < 32:
        return False, "Video file is too small."

    ext = Path(filename).suffix.lower()

    if ext and ext not in _VIDEO_EXTENSIONS:
        return False, f"Unsupported video extension: {ext}"

    try:
        with tempfile.NamedTemporaryFile(
            suffix=ext or ".mp4",
            delete=True,
        ) as temp_video:
            temp_video.write(data)
            temp_video.flush()

            cap = cv2.VideoCapture(temp_video.name)

            if not cap.isOpened():
                return False, "OpenCV failed to open video."

            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)

            ret, _ = cap.read()

            cap.release()

            if not ret:
                return False, "Cannot decode video frames."

            if frame_count <= 0:
                return False, "Video contains no frames."

            if fps <= 0:
                return False, "Invalid video FPS."

        return True, "OK"

    except Exception as e:
        logger.exception("Video validation failed")
        return False, f"Invalid video file: {e}"


def validate_media_bytes(
    data: bytes,
    content_type: str | None,
    filename: str = "",
) -> tuple[bool, str]:
    if not data:
        return False, "Empty file."

    content_type = (content_type or "").lower().strip()
    ext = Path(filename).suffix.lower()

    if content_type.startswith("video/"):
        return validate_video_bytes(data, filename)

    if content_type.startswith("image/"):
        return validate_image_bytes(data)

    if ext in _VIDEO_EXTENSIONS:
        return validate_video_bytes(data, filename)

    if ext in _IMAGE_EXTENSIONS:
        return validate_image_bytes(data)

    if len(data) > 12:
        if data[4:8] == b"ftyp":
            return validate_video_bytes(data, filename)

        if data[:4] == b"RIFF":
            return validate_video_bytes(data, filename)

        if data[:4] == b"\x1a\x45\xdf\xa3":
            return validate_video_bytes(data, filename)

    try:
        return validate_image_bytes(data)
    except Exception:
        pass

    return False, "Unsupported file format."