import uuid
import logging
from pathlib import Path

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File,
    Form, HTTPException, Query, Request, UploadFile, status,
)
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db
from app.middleware.auth_middleware import (
    get_current_user, require_admin, require_admin_or_contractor,
)
from app.middleware.rate_limiter import limiter
from app.models.cctv import CCTV
from app.models.comment import Comment
from app.models.enums import (
    MediaType, NotificationType, ReportStatus, SeverityLevel, UserRole,
)
from app.models.media_attachment import MediaAttachment
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportCreate, ReportListResponse, ReportResponse, ReportUpdate
from app.services import report_service
from app.services.notification_service import notify_background
from app.utils.geo import calculate_distance

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["Reports"])


class CommentCreate(BaseModel):
    content: str


async def _fetch_report_or_404(db: AsyncSession, report_id: int) -> Report:
    result = await db.execute(
        select(Report)
        .options(
            selectinload(Report.media_attachments),
        )
        .where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return report


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    data: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await report_service.create_report(db, data, current_user.id)
    report = await _fetch_report_or_404(db, report.id)
    upvote_count = await report_service.get_upvote_count(db, report.id)
    response = ReportResponse.model_validate(report)
    response.upvote_count = upvote_count
    return response


@router.get("", response_model=ReportListResponse)
@limiter.limit("60/minute")
async def list_reports(
    request: Request,
    status: ReportStatus | None = Query(None),
    barangay: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reports, total = await report_service.list_reports(
        db, status=status, barangay=barangay, page=page, page_size=page_size
    )
    results = []
    for r in reports:
        r = await _fetch_report_or_404(db, r.id)
        item = ReportResponse.model_validate(r)
        item.upvote_count = await report_service.get_upvote_count(db, r.id)
        results.append(item)
    return ReportListResponse(total=total, page=page, page_size=page_size, results=results)


@router.get("/mine", response_model=ReportListResponse)
@limiter.limit("60/minute")
async def get_my_reports(
    request: Request,
    status: ReportStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reports, total = await report_service.list_reports(
        db, owner_id=current_user.id, status=status, page=page, page_size=page_size
    )
    results = []
    for r in reports:
        r = await _fetch_report_or_404(db, r.id)
        item = ReportResponse.model_validate(r)
        item.upvote_count = await report_service.get_upvote_count(db, r.id)
        results.append(item)
    return ReportListResponse(total=total, page=page, page_size=page_size, results=results)


@router.get("/mine/stats")
@limiter.limit("60/minute")
async def get_my_report_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns per-status counts for the current user's reports via a single
    aggregate query. Used by the MySubmissions stat cards so they reflect
    the true total across all pages, not just the current page.
    """
    row = (await db.execute(
        select(
            func.count().label("total"),
            func.count(1).filter(Report.status == ReportStatus.PENDING.value).label("pending"),
            func.count(1).filter(Report.status == ReportStatus.VERIFIED.value).label("verified"),
            func.count(1).filter(Report.status == ReportStatus.IN_PROGRESS.value).label("in_progress"),
            func.count(1).filter(Report.status == ReportStatus.RESOLVED.value).label("resolved"),
            func.count(1).filter(Report.status == ReportStatus.DECLINED.value).label("declined"),
            func.count(1).filter(Report.ai_severity == SeverityLevel.critical.value).label("critical"),
        ).where(Report.owner_id == current_user.id)
    )).one()

    total    = row.total    or 0
    resolved = row.resolved or 0
    rep_score = round((resolved / total) * 100) if total > 0 else 0

    return {
        "total":       total,
        "pending":     row.pending     or 0,
        "verified":    row.verified    or 0,
        "in_progress": row.in_progress or 0,
        "resolved":    resolved,
        "declined":    row.declined    or 0,
        "critical":    row.critical    or 0,
        "rep_score":   rep_score,
    }


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)
    response = ReportResponse.model_validate(report)
    response.upvote_count = await report_service.get_upvote_count(db, report.id)
    return response


@router.patch("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: int,
    data: ReportUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_contractor),
):
    report = await _fetch_report_or_404(db, report_id)
    owner_id = report.owner_id
    await report_service.update_report_status(db, report, data, current_user)

    # ── Direct notify — bypass background task entirely ──
    if owner_id and data.status:
        from app.services.notification_service import notify
        try:
            await notify(
                db,
                user_id=owner_id,
                title="Report Status Updated",
                message=f"Your report #{report_id} is now {data.status.value}.",
                type=NotificationType.info,
                report_id=report_id,
            )
        except Exception as e:
            logger.error(f"Notify failed: {e}")

    updated = await _fetch_report_or_404(db, report_id)
    response = ReportResponse.model_validate(updated)
    response.upvote_count = await report_service.get_upvote_count(db, report_id)
    return response


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    await db.delete(report)
    await db.commit()


@router.post("/{report_id}/media", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def upload_media(
    request: Request,
    report_id: int,
    background_tasks: BackgroundTasks,   # ← FIX: required for ML enqueue
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)

    if report.owner_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    content_type = (file.content_type or "").lower()

    if content_type in settings.ALLOWED_IMAGE_TYPES:
        media_type = MediaType.image
    elif content_type in settings.ALLOWED_VIDEO_TYPES:
        media_type = MediaType.video
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {content_type}",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file.")

    max_bytes = (
        settings.MAX_IMAGE_SIZE_MB if media_type == MediaType.image
        else settings.MAX_VIDEO_SIZE_MB
    ) * 1024 * 1024
    if len(contents) > max_bytes:
        mb = settings.MAX_IMAGE_SIZE_MB if media_type == MediaType.image else settings.MAX_VIDEO_SIZE_MB
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the maximum allowed size of {mb} MB.",
        )

    safe_name = f"{uuid.uuid4().hex}_{Path(file.filename or 'upload').name}"
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / safe_name
    file_path.write_bytes(contents)

    attachment = MediaAttachment(
        report_id=report_id,
        file_url=f"/uploads/{safe_name}",
        file_name=file.filename or safe_name,
        file_size_bytes=len(contents),
        media_type=media_type,
        is_processed=False,   # ← FIX: False until ML runs
        is_ai_generated=report.is_flagged_fake,
        ai_generated_confidence=None,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    # ── TRIGGER ML CLASSIFICATION ─────────────────────────────────────
    # FIX: This endpoint previously never ran YOLO, so ai_severity stayed NULL.
    from app.services.queue_service import enqueue_ml_task
    task_id = await enqueue_ml_task(
        background_tasks=background_tasks,
        media_id=attachment.id,
        file_path=str(file_path),
        ai_result={"is_ai_generated": report.is_flagged_fake, "confidence": 0.0},
    )

    logger.info(
        "Media attached — report_id=%d  media_id=%d  type=%s  size=%d bytes | ml_task=%s",
        report_id, attachment.id, media_type.value, len(contents), task_id,
    )

    return {
        "success": True,
        "data": {
            "media_id": attachment.id,
            "file_url": attachment.file_url,
            "task_id": task_id,
            "ai_validation": {
                "is_ai_generated": report.is_flagged_fake,
                "status": "flagged" if report.is_flagged_fake else "approved",
            },
            "classification": {
                "damage_type": report.ai_damage_type.value if report.ai_damage_type else None,
                "severity":    report.ai_severity.value    if report.ai_severity    else None,
            },
        },
    }

@router.post("/{report_id}/upvote")
async def toggle_upvote(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    added = await report_service.toggle_upvote(db, report_id, current_user.id)
    count = await report_service.get_upvote_count(db, report_id)
    return {"upvoted": added, "upvote_count": count}


@router.put("/{report_id}/validate", status_code=status.HTTP_200_OK)
async def validate_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    owner_id = report.owner_id
    report.status = ReportStatus.VERIFIED
    await db.commit()

    if owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=owner_id,
            title="Report Verified",
            message=f"Your report #{report_id} has been verified by an administrator.",
            type=NotificationType.success,
            report_id=report_id,
        )
    return {"message": "Report verified successfully."}


@router.put("/{report_id}/decline", status_code=status.HTTP_200_OK)
async def decline_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    reason: str = Form(..., min_length=5, max_length=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    owner_id = report.owner_id
    report.status = ReportStatus.DECLINED
    report.decline_reason = reason
    await db.commit()

    if owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=owner_id,
            title="Report Declined",
            message=f"Your report #{report_id} was declined. Reason: {reason}",
            type=NotificationType.warning,
            report_id=report_id,
        )
    return {"message": "Report declined."}


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")
    if comment.user_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized.")
    await db.delete(comment)
    await db.commit()


@router.get("/{report_id}/comments")
async def get_comments(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _fetch_report_or_404(db, report_id)
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.user))
        .where(Comment.report_id == report_id)
        .order_by(Comment.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{report_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    report_id: int,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _fetch_report_or_404(db, report_id)
    comment = Comment(
        report_id=report_id,
        user_id=current_user.id,
        content=data.content.strip(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


@router.get("/{report_id}/nearby-cctv")
async def get_nearby_cctv(
    report_id: int,
    radius_meters: float = Query(100.0, ge=10, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)
    cam_result = await db.execute(select(CCTV).where(CCTV.is_active == True))  # noqa: E712
    cameras = cam_result.scalars().all()

    nearby = []
    for cam in cameras:
        dist = calculate_distance(
            report.latitude, report.longitude,
            cam.latitude, cam.longitude,
        )
        if dist <= radius_meters:
            nearby.append({
                "id": cam.id,
                "name": cam.location_name,
                "lat": cam.latitude,
                "lng": cam.longitude,
                "distance_meters": round(dist, 2),
                "stream_url": cam.stream_url,
            })

    nearby.sort(key=lambda c: c["distance_meters"])
    return nearby