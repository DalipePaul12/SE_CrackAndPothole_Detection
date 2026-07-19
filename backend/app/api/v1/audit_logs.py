"""
audit_logs.py — GET /audit-logs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Superadmin-only endpoint that exposes the audit_logs table with filtering
and pagination. All query parameters are optional; omitting them returns all
rows ordered newest-first.

Pagination shape mirrors ReportListResponse:
    { total, page, page_size, results: [...] }
"""

from __future__ import annotations

import logging
from datetime import date, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import require_superadmin
from app.middleware.rate_limiter import limiter
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogListResponse, AuditLogResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=AuditLogListResponse)
@limiter.limit("30/minute")
async def list_audit_logs(
    request: Request,
    # ── Filters ───────────────────────────────────────────────────────────────
    user_id:           Optional[int] = Query(None, description="Filter by the user whose action was logged."),
    action:            Optional[str] = Query(None, max_length=128, description="Exact action string, e.g. 'bootstrap_superadmin'."),
    target_resource:   Optional[str] = Query(None, max_length=64,  description="Resource type, e.g. 'users' or 'reports'."),
    performed_by_role: Optional[str] = Query(None, max_length=32,  description="Role of the acting user, e.g. 'superadmin' or 'system_cli'."),
    date_from:         Optional[date] = Query(None, description="Inclusive start date (UTC). Format: YYYY-MM-DD."),
    date_to:           Optional[date] = Query(None, description="Inclusive end date (UTC). Format: YYYY-MM-DD."),
    # ── Pagination ────────────────────────────────────────────────────────────
    page:      int = Query(1,  ge=1,          description="1-based page number."),
    page_size: int = Query(20, ge=1, le=200,  description="Rows per page (max 200)."),
    # ── Auth / DB ─────────────────────────────────────────────────────────────
    _current_user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    """
    Return a paginated, filtered list of audit log entries.

    All filters are optional and ANDed together.
    Results are ordered by timestamp descending (newest first).

    Filter SQL generated per combination:

    • action=bootstrap_superadmin
        WHERE action = 'bootstrap_superadmin'
        → ix_audit_logs_action

    • user_id=5 & date_from=2026-01-01 & date_to=2026-07-01
        WHERE user_id = 5 AND timestamp >= '2026-01-01T00:00:00Z'
          AND timestamp <  '2026-07-02T00:00:00Z'
        → ix_audit_logs_user_id / ix_audit_logs_timestamp

    • performed_by_role=system_cli & target_resource=users & page=2
        WHERE performed_by_role = 'system_cli' AND target_resource = 'users'
        ORDER BY timestamp DESC LIMIT 20 OFFSET 20
        → ix_audit_logs_performed_by_role + ix_audit_logs_target_resource
    """
    # ── Build base query ──────────────────────────────────────────────────────
    base_q = select(AuditLog)

    if user_id is not None:
        base_q = base_q.where(AuditLog.user_id == user_id)

    if action is not None:
        base_q = base_q.where(AuditLog.action == action)

    if target_resource is not None:
        base_q = base_q.where(AuditLog.target_resource == target_resource)

    if performed_by_role is not None:
        base_q = base_q.where(AuditLog.performed_by_role == performed_by_role)

    if date_from is not None:
        # Convert date → UTC-aware datetime at midnight
        from datetime import datetime
        dt_from = datetime(date_from.year, date_from.month, date_from.day,
                           tzinfo=timezone.utc)
        base_q = base_q.where(AuditLog.timestamp >= dt_from)

    if date_to is not None:
        # Inclusive end date: everything before start-of-day AFTER date_to
        from datetime import datetime
        dt_to_exclusive = datetime(date_to.year, date_to.month, date_to.day,
                                   tzinfo=timezone.utc) + timedelta(days=1)
        base_q = base_q.where(AuditLog.timestamp < dt_to_exclusive)

    # ── Total count — runs on the filtered base query, no limit/offset ────────
    count_q = select(func.count()).select_from(base_q.subquery())
    total: int = (await db.execute(count_q)).scalar_one()

    # ── Fetch page ────────────────────────────────────────────────────────────
    rows_q = (
        base_q
        .order_by(AuditLog.timestamp.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    result = await db.execute(rows_q)
    rows = result.scalars().all()

    return AuditLogListResponse(
        total=total,
        page=page,
        page_size=page_size,
        results=[AuditLogResponse.model_validate(r) for r in rows],
    )
