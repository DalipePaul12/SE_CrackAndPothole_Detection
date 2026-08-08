"""
Upload service — validates, stores, and registers media attachments.
Streams to a temp buffer, enforces size limits, then uploads to Supabase Storage.
"""
import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.supabase_storage import upload_report_file
from app.models.enums import MediaType
from app.models.media_attachment import MediaAttachment, ProcessingStatus
from app.models.report import Report

# Local temp dir only — used briefly so the ML pipeline (which needs a file path)
# still works. Files here are deleted right after upload to Supabase.
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
    background_tasks=None,   # optional, for ML trigger
) -> tuple[MediaAttachment, str]:
    """
    Validates the file, streams it into memory in chunks (size-limited),
    uploads it to Supabase Storage, and creates a MediaAttachment.

    Returns (MediaAttachment, local_temp_path). The local temp path still
    exists briefly on disk so the ML pipeline can run against a real file —
    it is the caller's responsibility to clean it up after ML processing,
    OR this function deletes it immediately if background_tasks is None.
    """
    # 1. Validate MIME type and get the maximum allowed size
    max_bytes = _validate_file_type(file, media_type)

    # 2. Sanitize filename and generate unique storage path
    ext = Path(file.filename or "upload").suffix.lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"

    # 3. Read the file into memory in chunks, enforcing the size limit as we go
    chunks = []
    actual_size = 0
    while chunk := await file.read(1024 * 1024):  # 1MB chunks
        actual_size += len(chunk)
        if actual_size > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File size exceeds allowed limit.",
            )
        chunks.append(chunk)
    file_bytes = b"".join(chunks)

    # 4. Upload to Supabase Storage — this is now the source of truth
    storage_subpath = f"{report.id}/{safe_name}"
    try:
        file_url = upload_report_file(
            file_bytes=file_bytes,
            storage_path=storage_subpath,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to upload file to storage: {e}",
        )

    # 5. Also write a local temp copy ONLY if the ML pipeline needs a real file path.
    #    Delete it right after ML has read it — see cleanup note at bottom.
    dest_dir = UPLOAD_ROOT / str(report.id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / safe_name
    with open(dest_path, "wb") as out_file:
        out_file.write(file_bytes)

    # 6. Save to Database — file_url now points to Supabase, not local disk
    attachment = MediaAttachment(
        report_id=report.id,
        file_url=file_url,
        file_name=safe_name,
        file_size_bytes=actual_size,
        media_type=media_type,
        is_processed=False,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    # Set report primary image if first upload
    if not report.image_url and media_type == MediaType.image:
        report.image_url = file_url
        await db.commit()

    # ── TRIGGER ML CLASSIFICATION ─────────────────────────────────────
    if background_tasks:
        from app.services.queue_service import enqueue_ml_task
        await enqueue_ml_task(
            background_tasks=background_tasks,
            media_id=attachment.id,
            file_path=str(dest_path),
            ai_result={"is_ai_generated": False, "confidence": 0.0},
        )
    else:
        # No ML step queued — the local temp copy served no purpose, remove it.
        if dest_path.exists():
            os.remove(dest_path)

    return attachment, str(dest_path)