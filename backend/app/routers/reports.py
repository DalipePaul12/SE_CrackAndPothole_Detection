"""
Reports router.
POST   /reports                    — create report (citizen)
GET    /reports                    — list reports (all authenticated)
GET    /reports/{id}               — get single report
PATCH  /reports/{id}               — update status (admin)
DELETE /reports/{id}               — delete report (admin)
POST   /reports/{id}/media         — upload image/video
POST   /reports/{id}/upvote        — toggle upvote
"""
from fastapi import (
    APIRouter, BackgroundTasks, Depends, File,
    HTTPException, Query, Request, UploadFile, status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.middleware.auth_middleware import (
    get_current_user, require_admin, require_admin_or_contractor,
)
from app.middleware.rate_limiter import limiter
from app.models.enums import MediaType, NotificationType, ReportStatus
from app.models.user import User
from app.schemas.report import ReportCreate, ReportListResponse, ReportResponse, ReportUpdate
from app.services import ml_service, report_service, upload_service
from app.services.notification_service import notify_background  # FIX: use session-owning variant

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    data: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new damage report. Media uploaded separately via /reports/{id}/media."""
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
    from sqlalchemy import select
    from app.models.report import Report

    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    updated = await report_service.update_report_status(db, report, data, current_user)

    # FIX: notify_background opens its own session — the request session will be
    # closed before a BackgroundTask runs, causing "session is closed" errors.
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
    from sqlalchemy import select
    from app.models.report import Report

    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    await db.delete(report)
    await db.commit()


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
    - Validates file type and size
    - Runs fake media detection (BackgroundTask)
    - Runs YOLO pothole detection (BackgroundTask)
    Returns 202 immediately — results written async.
    """
    from sqlalchemy import select
    from app.models.report import Report

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


@router.post("/{report_id}/upvote")
async def toggle_upvote(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    added = await report_service.toggle_upvote(db, report_id, current_user.id)
    count = await report_service.get_upvote_count(db, report_id)
    return {"upvoted": added, "upvote_count": count}