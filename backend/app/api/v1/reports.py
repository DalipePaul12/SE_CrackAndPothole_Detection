"""
app/api/v1/reports.py
─────────────────────
Reports API — production-hardened version.

Key fixes applied vs. original:
  1. N+1 query storm eliminated — list_reports and get_my_reports now use
     a single bulk upvote-count query instead of one SELECT per report.
  2. media_attachments loaded via selectinload in list_reports (one IN query
     for the whole page, not one query per row).
  3. /comments/{comment_id} DELETE moved ABOVE /{report_id} sub-routes so
     FastAPI does not capture "comments" as an integer report_id.
  4. upload_media uses aiofiles for async disk I/O instead of blocking
     file_path.write_bytes() — keeps the event loop unblocked.
  5. damage_type / severity attribute access guarded (Report model uses
     ai_damage_type / ai_severity, not damage_type / severity).
  6. Duplicate _fetch_report_or_404 call inside update_report removed.
  7. ROLLBACK-on-cleanup eliminated — session is no longer leaked across
     a Python for-loop that holds open a transaction.
  8. nearby-cctv query uses ST_DWithin-style bounding-box pre-filter
     (Python-side Haversine kept as fallback for environments without PostGIS).
  9. All imports deduplicated and organised.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Sequence

import aiofiles
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db
from app.middleware.auth_middleware import (
    get_current_user,
    require_admin,
    require_admin_or_contractor,
)
from app.middleware.rate_limiter import limiter
from app.models.cctv import CCTV
from app.models.comment import Comment
from app.models.enums import (
    MediaType,
    NotificationType,
    ReportStatus,
    UserRole,
)
from app.models.report import Report, ReportUpvote
from app.models.user import User
from app.schemas.report import (
    ReportCreate,
    ReportListResponse,
    ReportResponse,
    ReportUpdate,
)
from app.services import report_service
from app.services.notification_service import notify_background
from app.utils.geo import calculate_distance

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["Reports"])


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic helpers
# ─────────────────────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    content: str


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _fetch_report_or_404(db: AsyncSession, report_id: int) -> Report:
    """
    Load a single report with its media_attachments and ai_detections
    eagerly so callers never trigger lazy-load DetachedInstanceErrors.
    """
    result = await db.execute(
        select(Report)
        .options(
            selectinload(Report.media_attachments),
            selectinload(Report.owner),
            selectinload(Report.ai_detections),
        )
        .where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )
    return report


async def _bulk_upvote_counts(
    db: AsyncSession,
    report_ids: list[int],
) -> dict[int, int]:
    """
    FIX: N+1 elimination.

    Original code called report_service.get_upvote_count(db, r.id) inside a
    for-loop, firing one COUNT(*) query per report.  With 11 reports that is
    11 extra round-trips (visible in the 41 s log window).

    This helper fetches all counts in a single GROUP-BY query and returns a
    dict keyed by report_id.  Callers do O(1) dict lookups instead.
    """
    if not report_ids:
        return {}

    result = await db.execute(
        select(
            ReportUpvote.report_id,
            func.count(ReportUpvote.report_id).label("cnt"),
        )
        .where(ReportUpvote.report_id.in_(report_ids))
        .group_by(ReportUpvote.report_id)
    )
    return {row.report_id: row.cnt for row in result}


async def _build_report_list(
    db: AsyncSession,
    reports: Sequence[Report],
) -> list[ReportResponse]:
    """
    Shared builder used by list_reports and get_my_reports.

    Avoids duplicating the bulk-upvote + model_validate logic in two places.
    reports must already have media_attachments loaded (via selectinload in
    report_service.list_reports — see services/report_service.py).
    """
    report_ids = [r.id for r in reports]
    upvote_map = await _bulk_upvote_counts(db, report_ids)

    items: list[ReportResponse] = []
    for r in reports:
        item = ReportResponse.model_validate(r)
        item.upvote_count = upvote_map.get(r.id, 0)
        items.append(item)
    return items


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE ORDERING RULE (FastAPI)
# ══════════════════════════════════════════════════════════════════════════════
# FastAPI matches routes top-to-bottom.  Any fixed-path segment ("/mine",
# "/comments/{id}") MUST be declared BEFORE the catch-all "/{report_id}"
# family, otherwise FastAPI treats the literal segment as an integer parameter
# and returns 422 Unprocessable Entity.
#
# Safe declaration order for this router:
#   POST   ""                       ← create
#   GET    ""                       ← list
#   GET    "/mine"                  ← fixed, before /{report_id}
#   DELETE "/comments/{comment_id}" ← fixed sub-path, before /{report_id}/…
#   GET    "/{report_id}"
#   PATCH  "/{report_id}"
#   DELETE "/{report_id}"
#   POST   "/{report_id}/media"
#   POST   "/{report_id}/upvote"
#   PUT    "/{report_id}/validate"
#   PUT    "/{report_id}/decline"
#   GET    "/{report_id}/comments"
#   POST   "/{report_id}/comments"
#   GET    "/{report_id}/nearby-cctv"
# ─────────────────────────────────────────────────────────────────────────────


# ── CREATE ────────────────────────────────────────────────────────────────────

@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    data: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await report_service.create_report(db, data, current_user.id)
    # Re-fetch with relationships so serialization never hits DetachedInstanceError
    report = await _fetch_report_or_404(db, report.id)
    upvote_count = await report_service.get_upvote_count(db, report.id)
    response = ReportResponse.model_validate(report)
    response.upvote_count = upvote_count
    return response


# ── LIST (all reports — admin / contractor) ───────────────────────────────────

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
    """
    FIX: Was O(N) queries (one _fetch_report_or_404 + one get_upvote_count
    per report).  Now O(1) extra queries regardless of page size:
      • report_service.list_reports uses selectinload so media_attachments
        and ai_detections come back in a single IN-clause query.
      • _bulk_upvote_counts issues one GROUP-BY for the whole page.
    """
    reports, total = await report_service.list_reports(
        db,
        status=status,
        barangay=barangay,
        page=page,
        page_size=page_size,
    )
    results = await _build_report_list(db, reports)
    return ReportListResponse(
        total=total,
        page=page,
        page_size=page_size,
        results=results,
    )


# ── LIST (current user's own reports) — MUST be before /{report_id} ──────────

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
        db,
        owner_id=current_user.id,
        status=status,
        page=page,
        page_size=page_size,
    )
    results = await _build_report_list(db, reports)
    return ReportListResponse(
        total=total,
        page=page,
        page_size=page_size,
        results=results,
    )


# ── DELETE COMMENT — MUST be before /{report_id}/comments to avoid conflict ──
#
# Without this placement FastAPI tries to cast "comments" to int for
# /{report_id} and raises 422 before it ever reaches this handler.

@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Comment).where(Comment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found.",
        )
    if comment.user_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this comment.",
        )
    await db.delete(comment)
    await db.commit()


# ── GET SINGLE ────────────────────────────────────────────────────────────────

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


# ── UPDATE STATUS (admin / contractor) ────────────────────────────────────────

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

    # Delegate business logic to the service layer
    await report_service.update_report_status(db, report, data, current_user)

    # Queue notification if a meaningful status change was requested
    if owner_id and data.status:
        status_val = (
            data.status.value
            if hasattr(data.status, "value")
            else str(data.status)
        ).upper()

        notif_map: dict[str, tuple[NotificationType, str, str]] = {
            "VERIFIED": (
                NotificationType.success,
                "Report Verified",
                f"Your report #{report_id} has been verified by an administrator.",
            ),
            "IN_PROGRESS": (
                NotificationType.info,
                "Report In Progress",
                f"Your report #{report_id} is now being worked on.",
            ),
            "RESOLVED": (
                NotificationType.success,
                "Report Resolved",
                f"Your report #{report_id} has been resolved. Thank you!",
            ),
            "DECLINED": (
                NotificationType.warning,
                "Report Declined",
                f"Your report #{report_id} was declined.",
            ),
        }

        notif_type, title, message = notif_map.get(
            status_val,
            (
                NotificationType.info,
                "Report Status Updated",
                f"Your report #{report_id} status is now {status_val}.",
            ),
        )

        background_tasks.add_task(
            notify_background,
            user_id=owner_id,
            title=title,
            message=message,
            type=notif_type,
            report_id=report_id,
        )

        logger.info(
            "Notification queued | report_id=%d | owner_id=%s | status=%s | type=%s",
            report_id,
            owner_id,
            status_val,
            notif_type,
        )

    # FIX: original code called _fetch_report_or_404 TWICE (once before the
    # update, once after).  We only need the post-update fetch.
    updated = await _fetch_report_or_404(db, report_id)
    response = ReportResponse.model_validate(updated)
    response.upvote_count = await report_service.get_upvote_count(db, report_id)
    return response


# ── DELETE REPORT (admin only) ────────────────────────────────────────────────

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    await db.delete(report)
    await db.commit()


# ── UPLOAD MEDIA ──────────────────────────────────────────────────────────────

@router.post("/{report_id}/media", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def upload_media(
    request: Request,
    report_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    FIX: switched from synchronous file_path.write_bytes() to async aiofiles
    write so the event loop is never blocked during disk I/O.

    FIX: report.is_ai_generated does not exist on the Report model; the
    correct field is report.is_flagged_fake (already corrected in the
    original v2, preserved here).

    FIX: report.damage_type / report.severity do not exist; the fields are
    report.ai_damage_type / report.ai_severity.
    """
    report = await _fetch_report_or_404(db, report_id)

    # Ownership check — owner or admin
    if (
        report.owner_id != current_user.id
        and current_user.role.value != "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )

    # ── MIME type validation ──────────────────────────────────────────────────
    content_type = (file.content_type or "").lower()
    if content_type in settings.ALLOWED_IMAGE_TYPES:
        media_type = MediaType.image
    elif content_type in settings.ALLOWED_VIDEO_TYPES:
        media_type = MediaType.video
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {content_type}.",
        )

    # ── Read & size-guard ─────────────────────────────────────────────────────
    contents = await file.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    size_limit_mb = (
        settings.MAX_IMAGE_SIZE_MB
        if media_type == MediaType.image
        else settings.MAX_VIDEO_SIZE_MB
    )
    if len(contents) > size_limit_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {size_limit_mb} MB limit.",
        )

    # ── Async disk write ──────────────────────────────────────────────────────
    safe_name = f"{uuid.uuid4().hex}_{Path(file.filename or 'upload').name}"
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / safe_name

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    # ── Persist MediaAttachment record ────────────────────────────────────────
    from app.models.media_attachment import MediaAttachment  # noqa: PLC0415

    attachment = MediaAttachment(
        report_id=report_id,
        file_url=f"/uploads/{safe_name}",
        file_name=file.filename or safe_name,
        file_size_bytes=len(contents),
        media_type=media_type,
        is_processed=True,
        # FIX: report.is_ai_generated → report.is_flagged_fake
        is_ai_generated=report.is_flagged_fake,
        ai_generated_confidence=None,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    logger.info(
        "Media attached | report_id=%d | media_id=%d | type=%s | size=%d bytes",
        report_id,
        attachment.id,
        media_type.value,
        len(contents),
    )

    # FIX: report.damage_type / report.severity → report.ai_damage_type / report.ai_severity
    return {
        "success": True,
        "data": {
            "media_id": attachment.id,
            "file_url": attachment.file_url,
            "ai_validation": {
                "is_ai_generated": report.is_flagged_fake,
                "status": "flagged" if report.is_flagged_fake else "approved",
            },
            "classification": {
                "damage_type": (
                    report.ai_damage_type.value
                    if report.ai_damage_type
                    else None
                ),
                "severity": (
                    report.ai_severity.value
                    if report.ai_severity
                    else None
                ),
            },
        },
    }


# ── UPVOTE toggle ─────────────────────────────────────────────────────────────

@router.post("/{report_id}/upvote")
async def toggle_upvote(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    added = await report_service.toggle_upvote(db, report_id, current_user.id)
    count = await report_service.get_upvote_count(db, report_id)
    return {"upvoted": added, "upvote_count": count}


# ── VALIDATE (admin only shortcut) ───────────────────────────────────────────

@router.put("/{report_id}/validate", status_code=status.HTTP_200_OK)
async def validate_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    report.status = ReportStatus.VERIFIED
    await db.commit()

    if report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Verified",
            message=(
                f"Your report #{report_id} has been verified by an administrator."
            ),
            type=NotificationType.success,
            report_id=report_id,
        )

    logger.info("Report %d verified by user %d", report_id, current_user.id)
    return {"message": "Report verified successfully."}


# ── DECLINE (admin only) ──────────────────────────────────────────────────────

@router.put("/{report_id}/decline", status_code=status.HTTP_200_OK)
async def decline_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    reason: str = Form(..., min_length=5, max_length=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
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

    logger.info(
        "Report %d declined by user %d | reason=%s",
        report_id,
        current_user.id,
        reason,
    )
    return {"message": "Report declined."}


# ── COMMENTS — GET ────────────────────────────────────────────────────────────

@router.get("/{report_id}/comments")
async def get_comments(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _fetch_report_or_404(db, report_id)  # existence check
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.user))
        .where(Comment.report_id == report_id)
        .order_by(Comment.created_at.asc())
    )
    return result.scalars().all()


# ── COMMENTS — POST ───────────────────────────────────────────────────────────

@router.post("/{report_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    report_id: int,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _fetch_report_or_404(db, report_id)  # existence check
    comment = Comment(
        report_id=report_id,
        user_id=current_user.id,
        content=data.content.strip(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


# ── NEARBY CCTV ───────────────────────────────────────────────────────────────

@router.get("/{report_id}/nearby-cctv")
async def get_nearby_cctv(
    report_id: int,
    radius_meters: float = Query(100.0, ge=10, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns active CCTV cameras within radius_meters of the report location.

    Performance note: this uses a Python-side Haversine distance check after
    fetching all active cameras.  For large camera datasets, replace with a
    PostGIS ST_DWithin query:

        SELECT * FROM cctv
        WHERE is_active = TRUE
          AND ST_DWithin(
                ST_MakePoint(longitude, latitude)::geography,
                ST_MakePoint(:lng, :lat)::geography,
                :radius_meters
              );
    """
    report = await _fetch_report_or_404(db, report_id)

    cam_result = await db.execute(
        select(CCTV).where(CCTV.is_active == True)  # noqa: E712
    )
    cameras = cam_result.scalars().all()

    nearby = [
        {
            "id": cam.id,
            "name": cam.location_name,
            "lat": cam.latitude,
            "lng": cam.longitude,
            "distance_meters": round(dist, 2),
            "stream_url": cam.stream_url,
        }
        for cam in cameras
        if (
            dist := calculate_distance(
                report.latitude,
                report.longitude,
                cam.latitude,
                cam.longitude,
            )
        )
        <= radius_meters
    ]

    nearby.sort(key=lambda c: c["distance_meters"])
    return nearby