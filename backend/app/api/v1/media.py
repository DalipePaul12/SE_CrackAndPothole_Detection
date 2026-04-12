"""
Media router — query AI analysis results for uploaded media.

GET    /media/{id}           — get media attachment + detection results
POST   /media/{id}/reanalyze — re-run YOLO on an existing attachment (admin)
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.config import settings
from app.middleware.auth_middleware import get_current_user, require_admin
from app.models.media_attachment import MediaAttachment
from app.models.enums import MediaType
from app.models.user import User

router = APIRouter(prefix="/media", tags=["Media"])


@router.get("/{media_id}")
async def get_media(
    media_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return a media attachment and all its AI detection results."""
    result = await db.execute(
        select(MediaAttachment)
        .options(selectinload(MediaAttachment.ai_detections))
        .where(MediaAttachment.id == media_id)
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")
    return {
        "id": media.id,
        "report_id": media.report_id,
        "file_url": media.file_url,
        "file_name": media.file_name,
        "file_size_bytes": media.file_size_bytes,
        "media_type": media.media_type.value,
        "is_processed": media.is_processed,
        "is_ai_generated": media.is_ai_generated,
        "ai_generated_confidence": media.ai_generated_confidence,
        "ai_generated_model_used": media.ai_generated_model_used,
        "detections": [
            {
                "id": d.id,
                "detected_class": d.detected_class.value,
                "severity": d.severity.value if d.severity else None,
                "confidence": d.confidence,
                "bounding_boxes": d.bounding_boxes,
                "model_version": d.model_version,
                "inference_time_ms": d.inference_time_ms,
                "created_at": d.created_at,
            }
            for d in media.ai_detections
        ],
        "created_at": media.created_at,
    }


@router.post("/{media_id}/reanalyze", status_code=status.HTTP_202_ACCEPTED)
async def reanalyze_media(
    media_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin only — re-run YOLO inference on an existing image attachment."""
    result = await db.execute(
        select(MediaAttachment).where(MediaAttachment.id == media_id)
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found.")

    if media.media_type != MediaType.image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Re-analysis is only supported for images.",
        )

    if not settings.AI_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI is disabled on this server.",
        )

    # Read the file from disk and re-run detection
    import os
    from pathlib import Path

    filename = media.file_url.split("/uploads/")[-1]
    file_path = Path(settings.UPLOAD_DIR) / filename

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Original file not found on disk.",
        )

    image_bytes = file_path.read_bytes()
    report_result = await db.execute(
        select(MediaAttachment.report_id).where(MediaAttachment.id == media_id)
    )
    report_id = report_result.scalar_one()

    from app.models.report import Report
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Associated report not found.")

    media.is_processed = False
    await db.commit()

    from app.services.ml_service import run_detection
    background_tasks.add_task(run_detection, db, report, media, image_bytes)

    return {"message": "Re-analysis queued.", "media_id": media_id}