
import csv
import io
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import require_admin
from app.middleware.rate_limiter import limiter
from app.models.admin_settings import AdminSettings
from app.models.audit_log import AuditLog
from app.models.enums import ReportStatus
from app.models.report import Report
from app.models.user import User
from app.schemas.settings import AdminSettingsResponse, AdminSettingsUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["Settings"])

_SINGLETON_ID = 1


async def _get_or_create(db: AsyncSession) -> AdminSettings:
    """
    Return the singleton settings row (id=1).
    Creates it with model defaults if it has never been saved before.
    """
    result = await db.execute(
        select(AdminSettings).where(AdminSettings.id == _SINGLETON_ID)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = AdminSettings(id=_SINGLETON_ID)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        logger.info("Admin settings row created with defaults (first use).")
    return row


@router.get("", response_model=AdminSettingsResponse)
@limiter.limit("60/minute")
async def get_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminSettingsResponse:
    """Return the current admin settings, creating the singleton row if absent."""
    row = await _get_or_create(db)
    return row


@router.put("", response_model=AdminSettingsResponse)
@limiter.limit("30/minute")
async def update_settings(
    request: Request,
    data: AdminSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> AdminSettingsResponse:
    """
    Persist admin settings.  Only fields present in the request body are
    written — absent/null fields are left unchanged (partial update).
    """
    row = await _get_or_create(db)

    updates = data.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No fields provided to update.",
        )

    for field, value in updates.items():
        setattr(row, field, value)

    try:
        await db.commit()
        await db.refresh(row)
    except Exception:
        await db.rollback()
        logger.error("Failed to persist admin settings", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while saving settings.",
        )

    logger.info(
        "Admin settings updated | user_id=%d | fields=%s",
        current_user.id,
        list(updates.keys()),
    )
    return row


# ── Bulk reset ────────────────────────────────────────────────────────────────

@router.post("/reset-report-statuses", status_code=200)
@limiter.limit("5/minute")
async def reset_report_statuses(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    """
    Bulk-reset non-terminal report statuses back to 'pending'.
    Non-terminal statuses: verified, assigned, in_progress.
    Terminal statuses (resolved, declined, cancelled, rejected, completed) are
    never touched — history is preserved.
    An explicit AuditLog entry is written with the affected row count so a
    bulk action like this is traceable beyond the generic middleware log.
    """
    non_terminal = [
        ReportStatus.VERIFIED,
        ReportStatus.ASSIGNED,
        ReportStatus.IN_PROGRESS,
    ]

    result = await db.execute(
        sa_update(Report)
        .where(Report.status.in_(non_terminal))
        .values(status=ReportStatus.PENDING)
        .execution_options(synchronize_session=False)
    )
    affected = result.rowcount if result.rowcount is not None else 0

    ip = request.headers.get(
        "X-Forwarded-For",
        request.client.host if request.client else None,
    )
    db.add(AuditLog(
        user_id=current_user.id,
        performed_by_role=current_user.role.value,
        action="BULK_RESET_REPORT_STATUSES",
        target_resource="reports",
        target_id=None,
        details={"affected_count": affected, "reset_to": "pending"},
        ip_address=ip,
        user_agent=request.headers.get("User-Agent"),
    ))

    await db.commit()
    logger.info(
        "Admin %d bulk-reset %d report(s) to pending.", current_user.id, affected
    )
    return {"success": True, "affected_count": affected}


# ── Audit log CSV export ──────────────────────────────────────────────────────

@router.get("/audit-log/export")
@limiter.limit("10/minute")
async def export_audit_log(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> Response:
    """Stream the full audit_logs table as a UTF-8 CSV file download."""
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.timestamp.desc())
    )
    rows = result.scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id", "user_id", "action", "target_resource",
        "target_id", "ip_address", "timestamp",
    ])
    for r in rows:
        writer.writerow([
            r.id,
            r.user_id,
            r.action,
            r.target_resource,
            r.target_id,
            r.ip_address,
            r.timestamp.isoformat() if r.timestamp else "",
        ])

    filename = f"audit_log_{datetime.now(tz=timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
