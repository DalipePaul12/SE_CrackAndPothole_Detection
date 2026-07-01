"""
Upload service — validates, stores, and registers media attachments.
Enforces file type and size limits using chunked streaming to prevent OOM crashes.
"""
import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.enums import MediaType
from app.models.media_attachment import MediaAttachment, ProcessingStatus
from app.models.report import Report

UPLOAD_ROOT = Path(settings.UPLOAD_DIR)


def _validate_file_type(file: UploadFile, media_type: MediaType) -> int:
    """Validates file type and returns the max allowed size in bytes."""
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
    
    return max_bytes


async def save_upload(
    db: AsyncSession,
    report: Report,
    file: UploadFile,
    media_type: MediaType,
    background_tasks = None,   # ← ADDED: optional, for ML trigger
) -> tuple[MediaAttachment, str]:
    """
    Validates, streams the file to disk in chunks, and creates a MediaAttachment.
    Returns (MediaAttachment, file_path) to prevent RAM overload during ML processing.
    """
    # 1. Validate MIME type and get the maximum allowed size
    max_bytes = _validate_file_type(file, media_type)

    # 2. Sanitize filename and generate unique path
    ext = Path(file.filename or "upload").suffix.lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest_dir = UPLOAD_ROOT / str(report.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / safe_name

    # 3. STREAM TO DISK (Chunked writing prevents RAM crashes)
    actual_size = 0
    try:
        async with aiofiles.open(dest_path, 'wb') as out_file:
            while chunk := await file.read(1024 * 1024):  # Read in 1MB chunks
                actual_size += len(chunk)
                
                # Enforce size limit DURING the stream
                if actual_size > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File size exceeds allowed limit."
                    )
                
                await out_file.write(chunk)
                
    except HTTPException:
        # Clean up the partial file if it exceeded the size limit
        if dest_path.exists():
            os.remove(dest_path)
        raise

    # 4. Public URL (adjust for your storage — S3, Supabase Storage, etc.)
    file_url = f"/uploads/{report.id}/{safe_name}"

    # 5. Save to Database
    attachment = MediaAttachment(
        report_id=report.id,
        file_url=file_url,
        file_name=safe_name,
        file_size_bytes=actual_size,
        media_type=media_type,
        is_processed=False,   # ← FIX: False until ML runs
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    # Set report primary image if first upload
    # Set report primary image if first upload
    if not report.image_url and media_type == MediaType.image:
        report.image_url = file_url
        await db.commit()

    # ── TRIGGER ML CLASSIFICATION ─────────────────────────────────────
    # FIX: upload_service previously never ran YOLO, so ai_severity stayed NULL.
    if background_tasks:
        from app.services.queue_service import enqueue_ml_task
        await enqueue_ml_task(
            background_tasks=background_tasks,
            media_id=attachment.id,
            file_path=str(dest_path),
            ai_result={"is_ai_generated": False, "confidence": 0.0},
        )

    # CRITICAL: We return the file path (str) instead of the raw bytes
    # so the ML service can process it without duplicating it in memory.
    return attachment, str(dest_path)