"""
backend/app/api/v1/reports.py
Fully refactored with defensive error handling, proper status normalization,
explicit assignment handling, and service-layer compatibility fixes.

CRITICAL FIXES:
1. data.status is mutated to normalized_status before passing to report_service
   (prevents service from seeing None when auto-assigning)
2. assigned_to is explicitly committed before service call to avoid session conflicts
3. Added comprehensive logging for debugging assignment issues
4. Added POST /{report_id}/summary — Gemini-generated plain-language report
   summary, owner/admin-only, cached on first successful generation.
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

import aiofiles
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
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
    check_maintenance_mode,
)
from app.middleware.rate_limiter import limiter
from app.models.admin_settings import AdminSettings
from app.models.audit_log import AuditLog
from app.models.cctv import CCTV
from app.models.comment import Comment
from app.models.enums import (
    DamageType,
    MediaType,
    NotificationType,
    ReportStatus,
    SeverityLevel,
    UserRole,
)
from app.models.report import Report
from app.models.report_upvote import ReportUpvote
from app.models.user import User
from app.schemas.report import (
    DeclineRequest,
    ReportCreate,
    ReportListResponse,
    ReportResponse,
    ReportUpdate,
)
from app.services import report_service, summary_service
from app.services.notification_service import notify_background
from app.services.location_service import is_inside_malabon
from app.utils.geo import calculate_distance

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/reports",
    tags=["Reports"],
    dependencies=[Depends(check_maintenance_mode)],
)


# ═════════════════════════════════════════════════════════════════════════════
# Pydantic helpers
# ═════════════════════════════════════════════════════════════════════════════

class CommentCreate(BaseModel):
    content: str


# ═════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═════════════════════════════════════════════════════════════════════════════

def _enum_val(field):
    if field is None:
        return None
    return field.value if hasattr(field, "value") else field


async def _fetch_report_or_404(db: AsyncSession, report_id: int) -> Report:
    result = await db.execute(
        select(Report)
        .options(
            selectinload(Report.media_attachments),
            selectinload(Report.owner),
            selectinload(Report.ai_detections),
            selectinload(Report.frame_detections),
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


# ── SLA helpers ───────────────────────────────────────────────────────────────

_SLA_TERMINAL_STATUSES = {
    ReportStatus.RESOLVED,
    ReportStatus.DECLINED,
    ReportStatus.COMPLETED,
    ReportStatus.REJECTED,
    ReportStatus.CANCELLED,
}


def _compute_sla(
    created_at,
    report_status: ReportStatus,
    response_time_hours: int,
    escalate_after_hours: int,
) -> tuple[str | None, float | None]:
    """
    Return (sla_status, sla_hours_elapsed) for a single report.

    Terminal reports (resolved / declined / completed / rejected / cancelled)
    return (None, None) — SLA no longer applies.
    Active reports are classified as 'on_track', 'overdue', or 'escalated'.
    """
    if report_status in _SLA_TERMINAL_STATUSES or created_at is None:
        return None, None

    from datetime import datetime, timezone
    now = datetime.now(tz=timezone.utc)
    ca = created_at
    if ca.tzinfo is None:
        ca = ca.replace(tzinfo=timezone.utc)
    elapsed = (now - ca).total_seconds() / 3600.0

    if elapsed >= escalate_after_hours:
        sla_status = "escalated"
    elif elapsed >= response_time_hours:
        sla_status = "overdue"
    else:
        sla_status = "on_track"

    return sla_status, round(elapsed, 1)


async def _fetch_sla_settings(db: AsyncSession) -> tuple[int, int]:
    """Return (response_time_hours, escalate_after_hours) from AdminSettings row 1."""
    row = (
        await db.execute(select(AdminSettings).where(AdminSettings.id == 1))
    ).scalar_one_or_none()
    if row:
        return row.response_time_hours, row.escalate_after_hours
    return 24, 72  # safe defaults if row absent


async def _build_report_list(
    db: AsyncSession,
    reports: Sequence[Report],
) -> list[ReportResponse]:
    report_ids = [r.id for r in reports]
    upvote_map = await _bulk_upvote_counts(db, report_ids)
    response_time_h, escalate_after_h = await _fetch_sla_settings(db)
    items: list[ReportResponse] = []
    for r in reports:
        item = ReportResponse.model_validate(r)
        item.upvote_count = upvote_map.get(r.id, 0)
        item.sla_status, item.sla_hours_elapsed = _compute_sla(
            r.created_at, r.status, response_time_h, escalate_after_h
        )
        items.append(item)
    return items


async def _save_detection_snapshots(
    db: AsyncSession,
    report_id: int,
    snapshots: list,
) -> None:
    """
    Upload each already-annotated (masked/boxed) filmstrip snapshot to
    Supabase Storage and persist it as a FrameDetection row. Best-effort
    per snapshot — one bad/undecodable snapshot never blocks the others
    or fails the whole report submission (the report itself is already
    committed by the time this runs).
    """
    import base64 as _b64

    from app.core.supabase_storage import upload_report_file
    from app.models.frame_detection import FrameDetection

    for snap in snapshots:
        try:
            raw_bytes = _b64.b64decode(snap.image_b64)
        except Exception:
            logger.warning(
                "Skipping undecodable detection snapshot frame=%s for report %d",
                getattr(snap, "frame", "?"), report_id,
            )
            continue

        storage_subpath = f"{report_id}/frames/{snap.frame}_{snap.label}.jpg"
        try:
            frame_url = upload_report_file(
                file_bytes=raw_bytes,
                storage_path=storage_subpath,
                content_type="image/jpeg",
            )
        except Exception as exc:
            logger.error(
                "Frame snapshot upload failed report=%d frame=%s: %s",
                report_id, snap.frame, exc,
            )
            continue

        db.add(FrameDetection(
            report_id=report_id,
            frame_index=snap.frame,
            damage_type=snap.label,
            confidence=snap.confidence,
            image_url=frame_url,
            timestamp_seconds=snap.timestamp_seconds,
        ))

    await db.commit()


def _normalize_status(status_input: ReportStatus | str | None) -> ReportStatus | None:
    """
    Normalize status input to ReportStatus enum.
    Handles both enum objects and string values (case-insensitive).
    """
    if status_input is None:
        return None

    if isinstance(status_input, ReportStatus):
        return status_input

    if isinstance(status_input, str):
        status_str = status_input.lower().strip()
        try:
            return ReportStatus(status_str)
        except ValueError:
            valid_values = [s.value for s in ReportStatus]
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status '{status_input}'. Valid values: {valid_values}",
            )

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Status must be a string or ReportStatus enum, got {type(status_input)}",
    )


# ═════════════════════════════════════════════════════════════════════════════
# Magic-byte detection
# ═════════════════════════════════════════════════════════════════════════════

def _detect_mime_from_bytes(data: bytes) -> str | None:
    """Detect actual MIME type from magic bytes regardless of filename/Content-Type."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"GIF8":
        return "image/gif"
    if data[:4] == b"RIFF":
        if data[8:12] == b"WEBP":
            return "image/webp"
        if data[8:12] == b"WEBM":
            return "video/webm"
    if data[:4] in (b"\x00\x00\x00\x18", b"\x00\x00\x00\x20") or data[4:8] == b"ftyp":
        return "video/mp4"
    return None


def _mime_to_extension(mime: str) -> str:
    """Map MIME type to file extension."""
    return {
        "image/jpeg": ".jpg",
        "image/png":  ".png",
        "image/gif":  ".gif",
        "image/webp": ".webp",
        "video/mp4":  ".mp4",
        "video/webm": ".webm",
    }.get(mime, "")


def _sanitize_filename(filename: str, fallback_ext: str = "") -> str:
    """
    Truncate long filenames, strip unsafe characters, ensure extension exists.
    """
    if not filename:
        return f"upload{fallback_ext}"

    path = Path(filename)
    stem = path.stem
    ext  = path.suffix.lower() or fallback_ext

    # Truncate stem to 60 chars
    stem = stem[:60].strip("-_ ")

    # Remove unsafe characters
    stem = re.sub(r"[^\w\-]", "_", stem)

    return f"{stem}{ext}" if stem else f"upload{ext}"


# ═════════════════════════════════════════════════════════════════════════════
# Routes
# ═════════════════════════════════════════════════════════════════════════════

@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    data: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings_result = await db.execute(select(AdminSettings).where(AdminSettings.id == 1))
    admin_settings = settings_result.scalar_one_or_none()
    if admin_settings and admin_settings.restrict_location:
        if not is_inside_malabon(data.latitude, data.longitude):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "stage": "location",
                    "status": "fail",
                    "reason": "out_of_bounds",
                    "message": "This location is outside the supported service area.",
                },
            )

    report = await report_service.create_report(db, data, current_user.id)

    if data.detection_snapshots:
        await _save_detection_snapshots(db, report.id, data.detection_snapshots)

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
    damage_type: DamageType | None = Query(None),
    severity: SeverityLevel | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reports, total = await report_service.list_reports(
        db,
        status=status,
        barangay=barangay,
        damage_type=damage_type,
        severity=severity,
        page=page,
        page_size=page_size,
    )
    results = await _build_report_list(db, reports)
    return ReportListResponse(total=total, page=page, page_size=page_size, results=results)


@router.get("/mine", response_model=ReportListResponse)
@limiter.limit("60/minute")
async def get_my_reports(
    request: Request,
    status: ReportStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reports, total = await report_service.list_reports(
        db, owner_id=current_user.id, status=status, page=page, page_size=page_size,
    )
    results = await _build_report_list(db, reports)
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
    if comment.user_id != current_user.id and current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized.")
    await db.delete(comment)
    await db.commit()


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)
    response = ReportResponse.model_validate(report)
    response.upvote_count = await report_service.get_upvote_count(db, report.id)
    response_time_h, escalate_after_h = await _fetch_sla_settings(db)
    response.sla_status, response.sla_hours_elapsed = _compute_sla(
        report.created_at, report.status, response_time_h, escalate_after_h
    )
    return response


# Fields a report owner (non-admin/contractor) is allowed to touch when
# editing their own PENDING/DECLINED report. Anything else (status,
# assigned_to, decline_reason, rejection_reason, requires_admin_review,
# review_reason) stays admin/contractor-only — no exceptions.
_OWNER_EDITABLE_FIELDS = {"barangay", "street_name", "description"}

# ── report-scoped RBAC dependency ─────────────────────────────────────────────

_STAFF_ROLES = (UserRole.admin, UserRole.superadmin, UserRole.contractor)


async def _require_admin_or_owner(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Defense-in-depth gate for PATCH /{report_id}.

    Passes when the caller is admin / superadmin / contractor (privileged staff)
    OR is the original submitter of this specific report.  Raises 403 before any
    route body logic runs if neither condition holds.

    The route body still checks ``is_privileged`` to decide which edit code path
    to follow (full admin edit vs. tightly-scoped owner self-edit); that
    branching logic is not a security check and belongs in the handler.
    """
    report = await _fetch_report_or_404(db, report_id)
    if current_user.role not in _STAFF_ROLES and current_user.id != report.owner_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action.",
        )
    return current_user


@router.patch("/{report_id}", response_model=ReportResponse)
@limiter.limit("30/minute")
async def update_report(
    request: Request,
    report_id: int,
    data: ReportUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_admin_or_owner),
):
    """
    Update report status and/or assignment (admin/contractor), OR let the
    report owner edit their own barangay/street_name/description while the
    report is still PENDING or DECLINED (citizen self-edit — status and all
    admin-only fields remain untouchable for owners).

    CRITICAL FIXES:
    1. Normalizes status input (handles both enum and string, case-insensitive)
    2. Explicitly handles assigned_to field with immediate DB flush
    3. Mutates data.status so report_service sees the resolved enum (not None)
    4. Defensive error handling with detailed logging
    5. Proper notification mapping for all status values including ASSIGNED
    """
    report = await _fetch_report_or_404(db, report_id)
    owner_id = report.owner_id

    is_privileged = current_user.role in _STAFF_ROLES

    if not is_privileged:
        # ── Owner self-edit path: tightly scoped, no status changes ──────
        # _require_admin_or_owner already enforced that this user is the owner;
        # no need to re-check identity here.
        if report.status not in (ReportStatus.PENDING, ReportStatus.DECLINED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Report #{report_id} cannot be edited because its status is "
                    f"'{report.status.value}'. You can only edit a report while it "
                    f"is pending or declined."
                ),
            )

        provided = data.model_dump(exclude_unset=True)
        disallowed = set(provided) - _OWNER_EDITABLE_FIELDS
        if disallowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"You are not allowed to modify: {sorted(disallowed)}. "
                    f"Citizens may only edit barangay, street_name, and description."
                ),
            )

        if "barangay" in provided:
            report.barangay = provided["barangay"]
        if "street_name" in provided:
            report.street_name = provided["street_name"]
        if "description" in provided:
            report.description = provided["description"]
        report.updated_at = datetime.now(timezone.utc)

        # ── Audit log: citizen self-edit ──────────────────────────────────────
        db.add(AuditLog(
            user_id=current_user.id,
            performed_by_role=current_user.role.value,
            action="REPORT_OWNER_EDITED",
            target_resource="reports",
            target_id=report_id,
            details={"edited_fields": sorted(provided.keys())},
        ))

        await db.commit()
        await db.refresh(report)

        updated = await _fetch_report_or_404(db, report_id)
        response = ReportResponse.model_validate(updated)
        response.upvote_count = await report_service.get_upvote_count(db, report_id)
        logger.info("Owner self-edit: report=%d user=%d fields=%s", report_id, current_user.id, sorted(provided.keys()))
        return response

    logger.info(
        "PATCH report_id=%d | user_id=%d | raw_status=%s | assigned_to=%s",
        report_id, current_user.id, data.status, data.assigned_to
    )

    # ── Normalize status input ───────────────────────────────────────────
    normalized_status = _normalize_status(data.status)

    # ── Handle assignment (if assigned_to provided) ──────────────────────
    if data.assigned_to is not None:
        report.assigned_to = data.assigned_to
        logger.info(
            "Report %d assigned to '%s' by user %d",
            report_id, data.assigned_to, current_user.id
        )
        # Auto-set status to assigned if not explicitly provided
        if normalized_status is None:
            normalized_status = ReportStatus.ASSIGNED
            logger.info("Auto-setting status to ASSIGNED for report %d", report_id)

    # ── Handle decline reason ────────────────────────────────────────────
    if data.decline_reason is not None:
        report.decline_reason = data.decline_reason

    # ── Handle rejection reason ──────────────────────────────────────────
    if hasattr(data, 'rejection_reason') and data.rejection_reason is not None:
        report.rejection_reason = data.rejection_reason

    # ── CRITICAL FIX: Mutate data.status so service sees resolved enum ──
    # This prevents report_service.update_report_status() from receiving None
    # when we auto-set status to ASSIGNED due to assignment
    if normalized_status is not None:
        data.status = normalized_status

    # ── Handle status update ─────────────────────────────────────────────
    _side_effect_warnings: list[str] = []
    if normalized_status:
        report.status = normalized_status
        report.updated_at = datetime.now(timezone.utc)

        # Call service for additional side effects (e.g., audit logging, ML triggers)
        # We catch errors here so a service bug doesn't crash the whole request
        try:
            await report_service.update_report_status(db, report, data, current_user)
            logger.info("Service side-effects completed for report %d", report_id)
        except Exception as e:
            logger.error(
                "Service side-effect failed for report %d: %s",
                report_id, str(e), exc_info=True,
            )
            _side_effect_warnings.append(
                "Status updated successfully, but a background side effect "
                "(audit log or analytics cache) failed. Please verify manually."
            )

    # ── Commit changes ───────────────────────────────────────────────────
    try:
        await db.commit()
        await db.refresh(report)
        logger.info("Successfully committed update for report %d", report_id)
    except Exception as e:
        logger.error(
            "Database commit failed for report %d: %s", report_id, str(e), exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while updating the report.",
        )

    # ── Send notification to report owner ──────────────────────────────────
    if owner_id and normalized_status:
        status_val = normalized_status.value.upper()
        notif_map = {
            "VERIFIED":    (NotificationType.success, "Report Verified",     f"Your report #{report_id} has been verified by an administrator."),
            "IN_PROGRESS": (NotificationType.info,    "Report In Progress",  f"Your report #{report_id} is now being worked on."),
            "RESOLVED":    (NotificationType.success, "Report Resolved",     f"Your report #{report_id} has been resolved. Thank you!"),
            "DECLINED":    (NotificationType.warning, "Report Declined",     f"Your report #{report_id} was declined."),
            "ASSIGNED":    (NotificationType.info,    "Report Assigned",     f"Your report #{report_id} has been assigned to {report.assigned_to or 'a repair team'}."),
            "PENDING":     (NotificationType.info,    "Report Updated",      f"Your report #{report_id} has been updated."),
        }
        notif_type, title, message = notif_map.get(
            status_val,
            (NotificationType.info, "Report Status Updated", f"Your report #{report_id} status is now {status_val}."),
        )
        background_tasks.add_task(
            notify_background,
            user_id=owner_id, title=title, message=message,
            type=notif_type, report_id=report_id,
        )
        logger.info("Queued notification for report %d owner %d: %s", report_id, owner_id, status_val)

    # ── Return updated report ─────────────────────────────────────────────
    updated = await _fetch_report_or_404(db, report_id)
    response = ReportResponse.model_validate(updated)
    response.upvote_count = await report_service.get_upvote_count(db, report_id)
    if _side_effect_warnings:
        response.warnings = _side_effect_warnings

    logger.info("PATCH report_id=%d completed successfully", report_id)
    return response


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
async def delete_report(
    request: Request,
    report_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)

    is_privileged = current_user.role in (
        UserRole.admin, UserRole.superadmin, UserRole.contractor,
    )
    if not is_privileged:
        # ── Owner self-withdraw path ──────────────────────────────────────────
        if current_user.id != report.owner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        if report.status not in (ReportStatus.PENDING, ReportStatus.DECLINED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Report #{report_id} cannot be withdrawn because its status is "
                    f"'{report.status.value}'. You can only withdraw a report while it "
                    f"is pending or declined."
                ),
            )

    # ── Fetch admin IDs + emails before the row is deleted ───────────────────
    # Only relevant for citizen withdrawals; admin deletes don't notify peers.
    # Emails are fetched here in a single batched query so that each
    # notify_background() call below can skip its own per-call SELECT (N+1
    # avoided by passing email= to the background task).
    admin_ids: list[int] = []
    admin_email_map: dict[int, str] = {}
    if not is_privileged:
        admin_result = await db.execute(
            select(User.id, User.email).where(
                User.role.in_([UserRole.admin, UserRole.superadmin]),
                User.is_active.is_(True),
            )
        )
        for row in admin_result.all():
            admin_ids.append(row[0])
            if row[1]:
                admin_email_map[row[0]] = row[1]

        # ── Audit log: citizen self-withdraw ──────────────────────────────────
        db.add(AuditLog(
            user_id=current_user.id,
            performed_by_role=current_user.role.value,
            action="REPORT_OWNER_WITHDRAWN",
            target_resource="reports",
            target_id=report_id,
            details={
                "status_at_withdrawal": report.status.value,
                "barangay": report.barangay,
                "street_name": report.street_name,
            },
        ))

    await db.delete(report)
    await db.commit()

    # ── Notify all admins of the citizen withdrawal ───────────────────────────
    # Done after commit so the notification never blocks or rolls back the delete.
    if admin_ids:
        # Emails were batch-loaded above (select User.id, User.email) so each
        # background task receives the address directly and skips its own
        # per-call SELECT — avoids an N+1 across all notified admins.
        for admin_id in admin_ids:
            background_tasks.add_task(
                notify_background,
                user_id=admin_id,
                title="Report Withdrawn by Citizen",
                message=(
                    f"Report #{report_id} has been withdrawn by its owner "
                    f"(user #{current_user.id})."
                ),
                type=NotificationType.warning,
                report_id=None,   # row is gone; don't link a dead FK
                email=admin_email_map.get(admin_id),  # pre-fetched; no extra SELECT
            )
        logger.info(
            "Citizen withdrawal: report=%d user=%d notified %d admin(s)",
            report_id, current_user.id, len(admin_ids),
        )


# ── UPLOAD MEDIA ──────────────────────────────────────────────────────────────

# ── UPLOAD MEDIA ──────────────────────────────────────────────────────────────

@router.post("/{report_id}/media", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def upload_media(
    request: Request,
    report_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)

    if report.owner_id != current_user.id and current_user.role not in _STAFF_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    # Read file
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    # Detect MIME
    detected_mime = _detect_mime_from_bytes(contents)
    declared_mime = (file.content_type or "").lower()
    if detected_mime is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Could not determine file type from content. "
                "Ensure the file is a valid image (JPEG, PNG, WEBP) or video (MP4)."
            ),
        )
    actual_mime = detected_mime

    logger.info(
        "Upload | report_id=%d | filename=%s | declared=%s | detected=%s",
        report_id, file.filename, declared_mime, detected_mime,
    )

    # Validate type
    allowed_image = list(settings.ALLOWED_IMAGE_TYPES) + ["image/gif"]
    allowed_video = list(settings.ALLOWED_VIDEO_TYPES)

    if actual_mime in allowed_image:
        media_type = MediaType.image
    elif actual_mime in allowed_video:
        media_type = MediaType.video
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type. Detected: {actual_mime}. Allowed: {allowed_image + allowed_video}",
        )

    # Size guard
    size_limit_mb = settings.MAX_IMAGE_SIZE_MB if media_type == MediaType.image else settings.MAX_VIDEO_SIZE_MB
    if len(contents) > size_limit_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {size_limit_mb} MB limit.",
        )

    # Sanitize filename
    fallback_ext  = _mime_to_extension(actual_mime)
    clean_name    = _sanitize_filename(file.filename or "", fallback_ext)
    safe_name     = f"{uuid.uuid4().hex}_{clean_name}"

    # ── UPLOAD TO SUPABASE STORAGE (was: local disk write) ──────────────
    from app.core.supabase_storage import upload_report_file

    storage_subpath = f"{report_id}/{safe_name}"
    try:
        file_url = upload_report_file(
            file_bytes=contents,
            storage_path=storage_subpath,
            content_type=actual_mime,
        )
    except Exception as e:
        logger.error(f"Supabase upload failed for report {report_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to upload file to storage: {e}",
        )

    # ── Local temp copy — ONLY so run_yolo() below has a real file path.
    #    Deleted right after ML inference finishes, in the finally block.
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / safe_name

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    # Persist DB record — file_url now points to Supabase, not local disk
    from app.models.media_attachment import MediaAttachment

    attachment = MediaAttachment(
        report_id=report_id,
        file_url=file_url,
        file_name=clean_name,
        file_size_bytes=len(contents),
        media_type=media_type,
        is_processed=False,
        is_ai_generated=report.is_flagged_fake,
        ai_generated_confidence=None,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

        # ── RUN ML CLASSIFICATION INLINE ─────────────────────────────────
    import asyncio
    from app.services.ml_service import run_yolo
    from app.models.enums import DamageType, SeverityLevel
    from app.models.ai_detection_result import AIDetectionResult

    try:
        prediction = await asyncio.to_thread(run_yolo, str(file_path))
        logger.info(f"YOLO raw prediction for report {report_id}: {prediction}")

        if prediction:
            raw_label = prediction.get("label", "uncertain")
            try:
                detected_class = DamageType(raw_label)
            except ValueError:
                detected_class = DamageType.uncertain

            raw_severity = prediction.get("severity")
            severity = None
            if raw_severity:
                normalized_sev = str(raw_severity).lower().strip().replace("-", "_").replace(" ", "_")
                try:
                    severity = SeverityLevel(normalized_sev)
                except ValueError:
                    logger.warning(
                        f"ML returned unknown severity '{raw_severity}' "
                        f"(normalized: '{normalized_sev}') for report {report_id}. "
                        f"Valid values: {[s.value for s in SeverityLevel]}"
                    )

            detection = AIDetectionResult(
                report_id=report_id,
                media_attachment_id=attachment.id,
                detected_class=detected_class,
                severity=severity,
                confidence=prediction.get("confidence", 0),
                bounding_boxes=prediction.get("boxes"),
                model_version="yolo",
                inference_time_ms=prediction.get("inference_time_ms", 0),
            )
            db.add(detection)

            report.ai_damage_type = detected_class
            report.ai_severity = severity
            report.ai_confidence = prediction.get("confidence")
            attachment.is_processed = True

            await db.commit()
            logger.info(
                f"ML inline complete: report={report_id} | "
                f"damage={detected_class.value} | "
                f"severity={severity.value if severity else 'none'}"
            )
            task_id = "inline"
        else:
            logger.warning(f"No ML prediction for report {report_id}")
            attachment.is_processed = True
            await db.commit()
            task_id = "inline_no_detection"
    except Exception as ml_err:
        logger.error(f"ML inline failed for report {report_id}: {ml_err}")
        attachment.is_processed = True
        await db.commit()
        task_id = "inline_failed"
    finally:
        # Local temp copy served its purpose (ML inference) — clean it up.
        # File already lives in Supabase Storage as the source of truth.
        if file_path.exists():
            os.remove(file_path)

    logger.info(
        "Media saved | report_id=%d | media_id=%d | mime=%s | size=%d bytes | url=%s | ml_task=%s",
        report_id, attachment.id, actual_mime, len(contents), file_url, task_id,
    )

    return {
        "success": True,
        "data": {
            "media_id":    attachment.id,
            "file_url":    attachment.file_url,
            "task_id":     task_id,
            "ai_validation": {
                "is_ai_generated": report.is_flagged_fake,
                "status": "flagged" if report.is_flagged_fake else "approved",
            },
            "classification": {
                "damage_type": _enum_val(report.ai_damage_type),
                "severity":    _enum_val(report.ai_severity),
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
    report.status = ReportStatus.VERIFIED
    report.updated_at = datetime.now(timezone.utc)
    await db.commit()
    if report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Verified",
            message=f"Your report #{report_id} has been verified by an administrator.",
            type=NotificationType.success,
            report_id=report_id,
        )
    logger.info("Report %d verified by user %d", report_id, current_user.id)
    return {"message": "Report verified successfully."}


@router.put("/{report_id}/decline", status_code=status.HTTP_200_OK)
async def decline_report(
    report_id: int,
    data: DeclineRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    report.status = ReportStatus.DECLINED
    report.decline_reason = data.reason
    report.updated_at = datetime.now(timezone.utc)
    await db.commit()
    if report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Declined",
            message=f"Your report #{report_id} was declined. Reason: {data.reason}",
            type=NotificationType.warning,
            report_id=report_id,
        )
    logger.info("Report %d declined by user %d | reason=%s", report_id, current_user.id, data.reason)
    return {"message": "Report declined."}


def _assert_can_access_report_comments(report: "Report", current_user: User) -> None:
    """Only the report owner or admin/contractor/superadmin staff may read or
    post comments on a report — prevents any authenticated citizen from
    reading/posting on someone else's report by guessing its id (IDOR)."""
    is_privileged = current_user.role in (
        UserRole.admin, UserRole.superadmin, UserRole.contractor,
    )
    if not is_privileged and report.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view or comment on this report.",
        )


@router.get("/{report_id}/comments")
async def get_comments(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)
    _assert_can_access_report_comments(report, current_user)
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
    report = await _fetch_report_or_404(db, report_id)
    _assert_can_access_report_comments(report, current_user)

    content = data.content.strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comment cannot be empty.",
        )

    comment = Comment(
        report_id=report_id,
        user_id=current_user.id,
        content=content,
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
    import math
    report = await _fetch_report_or_404(db, report_id)

    lat_deg = radius_meters / 111_320
    lng_deg = radius_meters / (111_320 * math.cos(math.radians(report.latitude)))

    cam_result = await db.execute(
        select(CCTV).where(
            CCTV.is_active == True,  # noqa: E712
            CCTV.latitude.between(report.latitude - lat_deg, report.latitude + lat_deg),
            CCTV.longitude.between(report.longitude - lng_deg, report.longitude + lng_deg),
        )
    )
    cameras = cam_result.scalars().all()

    nearby = [
        {
            "id": cam.id, "name": cam.location_name,
            "lat": cam.latitude, "lng": cam.longitude,
            "distance_meters": round(dist, 2),
            "stream_url": cam.stream_url,
        }
        for cam in cameras
        if (dist := calculate_distance(report.latitude, report.longitude, cam.latitude, cam.longitude)) <= radius_meters
    ]
    nearby.sort(key=lambda c: c["distance_meters"])
    return nearby


# ── AI SUMMARY ────────────────────────────────────────────────────────────────

_SUMMARY_DAILY_LIMIT = 5
# In-process fallback counter when Redis is unavailable (resets on restart).
_summary_mem_counts: dict[str, int] = {}


async def _check_summary_daily_quota(user_id: int) -> None:
    """
    Increment per-user daily summary counter and raise HTTP 429 once the
    limit is exceeded.  Uses Redis (INCR + 24-h TTL) when available;
    falls back to an in-process dict so the endpoint never crashes on a
    Redis outage (fail-open, not fail-closed).
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    redis_url = os.getenv("REDIS_URL")
    count: int

    if redis_url:
        try:
            import redis.asyncio as aioredis
            async with aioredis.from_url(redis_url, decode_responses=True) as r:
                key = f"summary_daily:{user_id}:{today}"
                count = await r.incr(key)
                if count == 1:
                    await r.expire(key, 86400)  # 24-hour TTL
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(
                "Redis daily-quota check failed for user %d: %s — failing open",
                user_id, exc,
            )
            return  # fail open: don't block the user on a Redis error
    else:
        mem_key = f"{user_id}:{today}"
        _summary_mem_counts[mem_key] = _summary_mem_counts.get(mem_key, 0) + 1
        count = _summary_mem_counts[mem_key]

    if count > _SUMMARY_DAILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Daily AI summary limit reached ({_SUMMARY_DAILY_LIMIT} summaries/day per user). "
                "Try again tomorrow."
            ),
        )


@router.post("/{report_id}/summary", response_model=ReportResponse)
@limiter.limit("10/minute")
async def generate_summary(
    request: Request,
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate (or return cached) plain-language AI summary of a report using
    Gemini. Owner or admin only, since this hits a billed external API.

    Idempotent: if report.ai_summary is already set, returns it without
    calling Gemini again. There is no force-refresh flag yet — add one later
    if reports need re-summarizing after status/severity changes.
    """
    report = await _fetch_report_or_404(db, report_id)

    if report.owner_id != current_user.id and current_user.role not in _STAFF_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to generate a summary for this report.",
        )

    # Per-user daily cap — checked before the cached-result short-circuit so
    # the counter only increments when we would actually call the external API.
    if not report.ai_summary:
        await _check_summary_daily_quota(current_user.id)

    if report.ai_summary:
        response = ReportResponse.model_validate(report)
        response.upvote_count = await report_service.get_upvote_count(db, report.id)
        return response

    location = ", ".join(filter(None, [report.street_name, report.barangay])) or "Unknown location"

    summary = await summary_service.generate_report_summary(
        damage_type=_enum_val(report.ai_damage_type) or "unclassified",
        severity=_enum_val(report.ai_severity) or "unknown",
        location=location,
        ai_confidence=report.ai_confidence or 0.0,
        description=report.description,
    )

    if summary:
        report.ai_summary = summary
        report.ai_summary_generated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(report)
        logger.info("Generated AI summary for report %d", report_id)
    else:
        logger.warning("Summary generation returned no result for report %d", report_id)

    response = ReportResponse.model_validate(report)
    response.upvote_count = await report_service.get_upvote_count(db, report.id)
    return response

@router.get("/{report_id}/project")
async def get_project_for_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the project associated with a report.
    Accessible by: the report owner, the assigned contractor, or any admin/superadmin.
    """
    from app.models.project import Project

    report = await _fetch_report_or_404(db, report_id)

    is_admin = current_user.role in (UserRole.admin, UserRole.superadmin)
    is_owner = report.owner_id == current_user.id

    proj_result = await db.execute(
        select(Project)
        .where(Project.report_id == report_id)
        .options(selectinload(Project.contractor))
    )
    project = proj_result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="No project found for this report")

    is_contractor = (
        current_user.role == UserRole.contractor
        and project.contractor_id == current_user.id
    )

    if not (is_admin or is_owner or is_contractor):
        raise HTTPException(status_code=403, detail="Not authorized")

    return {
        "id": project.id,
        "status": project.status,
        "report_id": project.report_id,
        "contractor_id": project.contractor_id,
        "contractor_name": (
            project.contractor.full_name or project.contractor.email
            if project.contractor else None
        ),
        "scheduled_date": project.scheduled_date,
        "estimated_cost": project.estimated_cost,
        "completion_percentage": project.completion_percentage,
        "actual_completion_date": project.actual_completion_date,
    }
