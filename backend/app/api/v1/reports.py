"""
Reports router.
POST   /reports                    — create report (citizen)
GET    /reports                    — list reports (all authenticated)
GET    /reports/my-reports         — list own reports (citizen)
GET    /reports/{id}               — get single report
PATCH  /reports/{id}               — update status (admin/contractor)
DELETE /reports/{id}               — delete report (admin)
POST   /reports/{id}/media         — upload image/video
POST   /reports/{id}/upvote        — toggle upvote
PUT    /reports/{id}/validate      — admin: mark verified
PUT    /reports/{id}/decline       — admin: decline with reason
GET    /reports/{id}/comments      — list comments on a report
POST   /reports/{id}/comments      — add comment
DELETE /reports/comments/{id}      — delete comment (owner or admin)
GET    /reports/{id}/nearby-cctv   — find CCTV cameras near a report
"""
from fastapi import (
    APIRouter, BackgroundTasks, Depends, File,
    HTTPException, Query, Request, UploadFile, Form, status,
)
from pydantic import BaseModel
from sqlalchemy import select
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
from app.models.enums import MediaType, NotificationType, ReportStatus, UserRole
from app.models.notification import Notification
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportCreate, ReportListResponse, ReportResponse, ReportUpdate
from app.services import ml_service, report_service, upload_service
from app.services.notification_service import notify_background
from app.utils.geo import calculate_distance

router = APIRouter(prefix="/reports", tags=["Reports"])


# ── Schemas (inline — small enough not to need a separate file) ────────────────

class CommentCreate(BaseModel):
    content: str


# ── Core CRUD ──────────────────────────────────────────────────────────────────

@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    data: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new damage report. Upload image separately via /reports/{id}/media."""
    report = await report_service.create_report(db, data, current_user.id)
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
        item = ReportResponse.model_validate(r)
        item.upvote_count = await report_service.get_upvote_count(db, r.id)
        results.append(item)

    return ReportListResponse(
        total=total, page=page, page_size=page_size, results=results
    )


# NOTE: /my-reports must be declared BEFORE /{report_id} to avoid routing conflict
@router.get("/my-reports", response_model=ReportListResponse)
@limiter.limit("60/minute")
async def get_my_reports(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return only reports submitted by the authenticated citizen."""
    reports, total = await report_service.list_reports(
        db, owner_id=current_user.id, page=page, page_size=page_size
    )
    results = []
    for r in reports:
        item = ReportResponse.model_validate(r)
        item.upvote_count = await report_service.get_upvote_count(db, r.id)
        results.append(item)
    return ReportListResponse(total=total, page=page, page_size=page_size, results=results)


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await report_service.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
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
    """Admin/contractor only — update report status."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    updated = await report_service.update_report_status(db, report, data, current_user)

    if report.owner_id and data.status:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Status Updated",
            message=f"Your report #{report_id} is now {data.status.value}.",
            type=NotificationType.info,
            report_id=report_id,
        )

    response = ReportResponse.model_validate(updated)
    response.upvote_count = await report_service.get_upvote_count(db, report_id)
    return response


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    await db.delete(report)
    await db.commit()


# ── Media upload ───────────────────────────────────────────────────────────────

@router.post("/{report_id}/media", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def upload_media(
    request: Request,
    report_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload image or video for a report.
    Returns 202 immediately — AI analysis runs in background.
    """
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    if report.owner_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    content_type = file.content_type or ""
    if content_type in settings.ALLOWED_IMAGE_TYPES:
        media_type = MediaType.image
    elif content_type in settings.ALLOWED_VIDEO_TYPES:
        media_type = MediaType.video
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {content_type}",
        )

    attachment, raw_bytes = await upload_service.save_upload(db, report, file, media_type)

    if settings.AI_FAKE_DETECTION_ENABLED:
        hive_key = getattr(settings, "HIVE_API_KEY", None)
        if hive_key:
            background_tasks.add_task(
                ml_service.detect_ai_generated, db, attachment, raw_bytes, hive_key
            )

    if settings.AI_ENABLED and media_type == MediaType.image:
        background_tasks.add_task(
            ml_service.run_detection, db, report, attachment, raw_bytes
        )

    return {"message": "Media uploaded. AI analysis running in background.", "media_id": attachment.id}


# ── Upvote ─────────────────────────────────────────────────────────────────────

@router.post("/{report_id}/upvote")
async def toggle_upvote(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    added = await report_service.toggle_upvote(db, report_id, current_user.id)
    count = await report_service.get_upvote_count(db, report_id)
    return {"upvoted": added, "upvote_count": count}


# ── Admin actions (from legacy — these were missing in production) ─────────────

@router.put("/{report_id}/validate", status_code=status.HTTP_200_OK)
async def validate_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin: Quickly mark a report as VERIFIED."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    report.status = ReportStatus.VERIFIED
    await db.commit()

    if report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Verified",
            message=f"Your report #{report_id} has been verified.",
            type=NotificationType.success,
            report_id=report_id,
        )

    return {"message": "Report verified successfully."}


@router.put("/{report_id}/decline", status_code=status.HTTP_200_OK)
async def decline_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    reason: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin: Decline a report with a reason."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    report.status = ReportStatus.DECLINED
    report.decline_reason = reason
    await db.commit()

    if report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Declined",
            message=f"Your report #{report_id} was declined. Reason: {reason}",
            type=NotificationType.warning,
            report_id=report_id,
        )

    return {"message": "Report declined."}


# ── Comments (from legacy — missing in production) ─────────────────────────────

# NOTE: /comments/{id} must come BEFORE /{report_id} to avoid routing conflict
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
    result = await db.execute(select(Report).where(Report.id == report_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    comment = Comment(
        report_id=report_id,
        user_id=current_user.id,
        content=data.content,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


# ── Nearby CCTV (from legacy — missing in production) ─────────────────────────

@router.get("/{report_id}/nearby-cctv")
async def get_nearby_cctv(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return active CCTV cameras within 100m of the report location."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    cam_result = await db.execute(select(CCTV).where(CCTV.is_active == True))
    cameras = cam_result.scalars().all()

    nearby = []
    for cam in cameras:
        dist = calculate_distance(report.latitude, report.longitude, cam.latitude, cam.longitude)
        if dist <= 100:
            nearby.append({
                "id": cam.id,
                "name": cam.location_name,
                "lat": cam.latitude,
                "lng": cam.longitude,
                "distance_meters": round(dist, 2),
                "stream_url": cam.stream_url,
            })
    return nearby