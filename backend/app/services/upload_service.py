"""
Upload service — validates, stores, and registers media attachments.
Enforces file type and size limits from config before anything is written.
"""
import mimetypes
import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.models.enums import MediaType
from app.models.media_attachment import MediaAttachment
from app.models.report import Report
from sqlalchemy.ext.asyncio import AsyncSession


UPLOAD_ROOT = Path(settings.UPLOAD_DIR)


def _validate_file(file: UploadFile, media_type: MediaType) -> None:
    """Raises HTTPException for invalid file type or size."""
    content_type = file.content_type or ""

    if media_type == MediaType.image:
        allowed = settings.ALLOWED_IMAGE_TYPES
        max_bytes = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    else:
        allowed = settings.ALLOWED_VIDEO_TYPES
        max_bytes = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024

    if content_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{content_type}' is not allowed. Allowed: {allowed}",
        )

    # File size check — UploadFile.size is set by FastAPI from Content-Length
    if file.size and file.size > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {limit_mb}MB limit.",
        )


async def save_upload(
    db: AsyncSession,
    report: Report,
    file: UploadFile,
    media_type: MediaType,
) -> tuple[MediaAttachment, bytes]:
    """
    Validates, saves the file to disk, and creates a MediaAttachment record.
    Returns (MediaAttachment, raw_bytes) — raw bytes passed to ML tasks.
    """
    _validate_file(file, media_type)

    contents = await file.read()
    actual_size = len(contents)

    # Double-check size after reading (Content-Length can be spoofed)
    max_bytes = (
        settings.MAX_IMAGE_SIZE_MB if media_type == MediaType.image
        else settings.MAX_VIDEO_SIZE_MB
    ) * 1024 * 1024

    if actual_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds allowed limit.",
        )

    # Sanitize filename and generate unique path
    ext = Path(file.filename or "upload").suffix.lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest_dir = UPLOAD_ROOT / str(report.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / safe_name

    with open(dest_path, "wb") as f:
        f.write(contents)

    # Public URL (adjust for your storage — S3, Supabase Storage, etc.)
    file_url = f"/uploads/{report.id}/{safe_name}"

    attachment = MediaAttachment(
        report_id=report.id,
        file_url=file_url,
        file_name=safe_name,
        file_size_bytes=actual_size,
        media_type=media_type,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    # Set report primary image if first upload
    if not report.image_url and media_type == MediaType.image:
        report.image_url = file_url
        await db.commit()

    return attachment, contents