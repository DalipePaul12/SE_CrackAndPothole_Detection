"""
Image validator — sanity checks on uploaded image bytes before inference.
Prevents corrupt files, oversized dimensions, and non-image data from
reaching the YOLO model.
"""
import io
import logging
from PIL import Image

logger = logging.getLogger(__name__)

MAX_IMAGE_DIMENSION = 4096   # pixels — reject anything larger
MIN_IMAGE_DIMENSION = 32     # pixels — reject tiny/blank images


def validate_image_bytes(data: bytes) -> tuple[bool, str]:
    """
    Validate raw image bytes.
    Returns (is_valid: bool, reason: str).
    """
    if not data:
        return False, "Empty file."

    try:
        img = Image.open(io.BytesIO(data))
        img.verify()  # Detects truncated / corrupt files
    except Exception as e:
        return False, f"File is not a valid image: {e}"

    # Re-open after verify() (PIL closes the file pointer after verify)
    try:
        img = Image.open(io.BytesIO(data))
        width, height = img.size
    except Exception as e:
        return False, f"Cannot read image dimensions: {e}"

    if width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION:
        return False, f"Image too small ({width}×{height}). Minimum is {MIN_IMAGE_DIMENSION}px."

    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        return False, (
            f"Image too large ({width}×{height}). "
            f"Maximum dimension is {MAX_IMAGE_DIMENSION}px."
        )

    # Check mode — YOLO needs RGB-compatible input
    if img.mode not in ("RGB", "RGBA", "L", "P"):
        return False, f"Unsupported colour mode: {img.mode}."

    return True, "OK"


def prepare_for_inference(data: bytes) -> bytes:
    """
    Normalise image to RGB JPEG before passing to YOLO.
    Strips EXIF data, converts palette/alpha modes, standardises format.
    Returns JPEG bytes.
    """
    img = Image.open(io.BytesIO(data)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()