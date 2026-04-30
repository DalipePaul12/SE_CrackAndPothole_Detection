"""
analytics.py — Dashboard analytics endpoints.
All routes require admin or contractor role.
In-process TTL cache (60s) to avoid hammering the DB on every poll.
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.report import Report
from app.models.user import User
from app.models.enums import DamageType, ReportStatus, SeverityLevel, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])

_CACHE_TTL = 60
_cache: dict[str, tuple[float, Any]] = {}


def _get(key: str) -> Any | None:
    e = _cache.get(key)
    return e[1] if e and (time.monotonic() - e[0]) < _CACHE_TTL else None


def _set(key: str, val: Any) -> None:
    _cache[key] = (time.monotonic(), val)


def _ok(data: Any) -> dict:
    return {"success": True, "data": data}


async def _scalar(db: AsyncSession, stmt) -> int:
    return (await db.execute(stmt)).scalar_one_or_none() or 0


def _require_staff(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (UserRole.admin, UserRole.contractor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient privileges.")
    return current_user


def invalidate_analytics_cache() -> None:
    _cache.clear()
    logger.debug("analytics cache cleared")


# ── /dashboard-summary ─────────────────────────────────────────────────────
@router.get("/dashboard-summary")
@limiter.limit("30/minute")
async def get_dashboard_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("dashboard_summary")) is not None:
        return _ok(c)

    (total, pending, verified, in_progress, resolved, declined, active_users) = await asyncio.gather(
        _scalar(db, select(func.count(Report.id))),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.PENDING)),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.VERIFIED)),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.IN_PROGRESS)),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.RESOLVED)),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.DECLINED)),
        _scalar(db, select(func.count(User.id)).where(User.is_active == True)),  # noqa: E712
    )
    data = dict(
        total_reports=total, pending=pending, verified=verified,
        in_progress=in_progress, resolved=resolved, declined=declined,
        active_users=active_users,
    )
    _set("dashboard_summary", data)
    return _ok(data)


# ── /damage-type-stats ──────────────────────────────────────────────────────
@router.get("/damage-type-stats")
@limiter.limit("30/minute")
async def get_damage_type_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("damage_type_stats")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report.ai_damage_type, func.count(Report.id)).group_by(Report.ai_damage_type)
    )).all()
    data = {(dt.value if dt else "unknown"): cnt for dt, cnt in rows}
    _set("damage_type_stats", data)
    return _ok(data)


# ── /report-status-stats ────────────────────────────────────────────────────
@router.get("/report-status-stats")
@limiter.limit("30/minute")
async def get_report_status_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("report_status_stats")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report.status, func.count(Report.id)).group_by(Report.status)
    )).all()
    data = {s.value: cnt for s, cnt in rows}
    _set("report_status_stats", data)
    return _ok(data)


# ── /monthly-reports ────────────────────────────────────────────────────────
@router.get("/monthly-reports")
@limiter.limit("30/minute")
async def get_monthly_reports(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("monthly_reports")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(
            func.to_char(Report.created_at, "YYYY-MM").label("month"),
            func.count(Report.id),
        )
        .group_by("month")
        .order_by("month")
    )).all()
    data = [{"month": m, "count": cnt} for m, cnt in rows]
    _set("monthly_reports", data)
    return _ok(data)


# ── /severity-stats ─────────────────────────────────────────────────────────
@router.get("/severity-stats")
@limiter.limit("30/minute")
async def get_severity_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("severity_stats")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report.ai_severity, func.count(Report.id)).group_by(Report.ai_severity)
    )).all()
    data = {(sev.value if sev else "unknown"): cnt for sev, cnt in rows}
    # Normalise into flat keys expected by the frontend
    result = {
        "critical": data.get("critical", 0),
        "medium":   data.get("medium", 0),
        "low":      data.get("low", 0),
    }
    _set("severity_stats", result)
    return _ok(result)


# ── /hotspots ───────────────────────────────────────────────────────────────
@router.get("/hotspots")
@limiter.limit("30/minute")
async def get_hotspots(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("hotspots")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report.barangay, func.count(Report.id).label("cnt"))
        .group_by(Report.barangay)
        .order_by(func.count(Report.id).desc())
        .limit(10)
    )).all()
    data = [{"barangay": bgy or "Unidentified", "count": cnt} for bgy, cnt in rows]
    _set("hotspots", data)
    return _ok(data)


# ── /sla-stats ──────────────────────────────────────────────────────────────
@router.get("/sla-stats")
@limiter.limit("30/minute")
async def get_sla_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("sla_stats")) is not None:
        return _ok(c)

    now = datetime.now(timezone.utc)
    sla_days = 7  # SLA threshold

    # Avg resolution days (resolved reports only)
    avg_res = (await db.execute(
        select(func.avg(
            func.extract("epoch", Report.updated_at - Report.created_at) / 86400.0
        )).where(Report.status == ReportStatus.RESOLVED)
    )).scalar_one_or_none()

    overdue_cutoff = now - timedelta(days=sla_days)

    overdue_count = await _scalar(
        db,
        select(func.count(Report.id)).where(
            Report.status.not_in([ReportStatus.RESOLVED, ReportStatus.DECLINED]),
            Report.created_at < overdue_cutoff,
        ),
    )

    pending_3d_cutoff = now - timedelta(days=3)
    pending_over_3days = await _scalar(
        db,
        select(func.count(Report.id)).where(
            Report.status == ReportStatus.PENDING,
            Report.created_at < pending_3d_cutoff,
        ),
    )

    # On-time = resolved within SLA window
    total_resolved = await _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.RESOLVED))
    on_time = await _scalar(
        db,
        select(func.count(Report.id)).where(
            Report.status == ReportStatus.RESOLVED,
            func.extract("epoch", Report.updated_at - Report.created_at) / 86400.0 <= sla_days,
        ),
    )
    on_time_rate = round((on_time / total_resolved * 100) if total_resolved else 0)

    data = dict(
        avg_resolution_days=round(float(avg_res), 1) if avg_res else None,
        overdue_count=overdue_count,
        pending_over_3days=pending_over_3days,
        on_time_rate_pct=on_time_rate,
    )
    _set("sla_stats", data)
    return _ok(data)


# ── /ai-insights ────────────────────────────────────────────────────────────
@router.get("/ai-insights")
@limiter.limit("30/minute")
async def get_ai_insights(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("ai_insights")) is not None:
        return _ok(c)

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    total = await _scalar(db, select(func.count(Report.id)))
    low_conf = await _scalar(
        db,
        select(func.count(Report.id)).where(Report.ai_confidence < 0.5),
    )
    low_conf_pct = round((low_conf / total * 100) if total else 0, 1)

    # Crack change % this week vs previous week
    cracks_this_week = await _scalar(
        db,
        select(func.count(Report.id)).where(
            Report.ai_damage_type == DamageType.crack,
            Report.created_at >= week_ago,
        ),
    )
    cracks_prev_week = await _scalar(
        db,
        select(func.count(Report.id)).where(
            Report.ai_damage_type == DamageType.crack,
            Report.created_at >= two_weeks_ago,
            Report.created_at < week_ago,
        ),
    )
    crack_change_pct = (
        round(((cracks_this_week - cracks_prev_week) / cracks_prev_week) * 100)
        if cracks_prev_week else 0
    )

    # Duplicate locations (more than 2 reports from exact same lat/lng)
    dup_sub = (
        select(func.count(Report.id).label("cnt"))
        .group_by(Report.latitude, Report.longitude)
        .having(func.count(Report.id) > 2)
        .subquery()
    )
    dup_count = (await db.execute(select(func.count()).select_from(dup_sub))).scalar_one_or_none() or 0

    # Avg model confidence as accuracy proxy
    avg_conf = (await db.execute(select(func.avg(Report.ai_confidence)))).scalar_one_or_none()
    avg_accuracy = round(float(avg_conf) * 100) if avg_conf else None

    data = dict(
        low_confidence_pct=low_conf_pct,
        crack_change_pct=crack_change_pct,
        duplicate_count=dup_count,
        avg_model_accuracy=avg_accuracy,
    )
    _set("ai_insights", data)
    return _ok(data)


# ── /recent-reports ─────────────────────────────────────────────────────────
@router.get("/recent-reports")
@limiter.limit("30/minute")
async def get_recent_reports(
    request: Request,
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    cache_key = f"recent_reports_{limit}"
    if (c := _get(cache_key)) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report)
        .order_by(Report.created_at.desc())
        .limit(min(limit, 50))
    )).scalars().all()

    data = [
        dict(
            id=f"#{r.id}",
            type=r.ai_damage_type.value.title() if r.ai_damage_type else "Unknown",
            location=r.barangay or "—",
            severity=r.ai_severity.value.title() if r.ai_severity else "—",
            status=r.status.value.lower() if r.status else "—",
            confidence=round(r.ai_confidence * 100) if r.ai_confidence is not None else None,
            submitted=r.created_at.isoformat() if r.created_at else None,
        )
        for r in rows
    ]
    _set(cache_key, data)
    return _ok(data)


# ── /activity-feed ──────────────────────────────────────────────────────────
@router.get("/activity-feed")
@limiter.limit("30/minute")
async def get_activity_feed(
    request: Request,
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    cache_key = f"activity_feed_{limit}"
    if (c := _get(cache_key)) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report)
        .order_by(Report.updated_at.desc())
        .limit(min(limit, 50))
    )).scalars().all()

    def _msg(r: Report) -> tuple[str, str]:
        loc = r.barangay or "unknown location"
        dmg = r.ai_damage_type.value if r.ai_damage_type else "report"
        s   = r.status.value if r.status else "updated"
        if s == "resolved":
            return f"{dmg.title()} #{r.id} resolved in {loc}", "resolved"
        if s == "verified":
            return f"{dmg.title()} #{r.id} verified — {loc}", "verified"
        if s == "in_progress":
            return f"Repair started on {dmg} #{r.id} in {loc}", "progress"
        if s == "pending":
            return f"New {dmg} reported in {loc}", "new"
        if s == "declined":
            return f"Report #{r.id} declined", "declined"
        return f"Report #{r.id} updated", "new"

    data = []
    for r in rows:
        msg, kind = _msg(r)
        data.append(dict(message=msg, type=kind, timestamp=(r.updated_at or r.created_at).isoformat()))

    _set(cache_key, data)
    return _ok(data)


# ── /priority-flags ─────────────────────────────────────────────────────────
@router.get("/priority-flags")
@limiter.limit("30/minute")
async def get_priority_flags(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := _get("priority_flags")) is not None:
        return _ok(c)

    now = datetime.now(timezone.utc)

    pending_over_3days = await _scalar(
        db,
        select(func.count(Report.id)).where(
            Report.status == ReportStatus.PENDING,
            Report.created_at < now - timedelta(days=3),
        ),
    )
    overdue_count = await _scalar(
        db,
        select(func.count(Report.id)).where(
            Report.status.not_in([ReportStatus.RESOLVED, ReportStatus.DECLINED]),
            Report.created_at < now - timedelta(days=7),
        ),
    )
    low_conf_count = await _scalar(
        db,
        select(func.count(Report.id)).where(
            Report.ai_confidence < 0.5,
            Report.status == ReportStatus.PENDING,
        ),
    )

    # Critical reports grouped by barangay
    crit_rows = (await db.execute(
        select(Report.barangay, func.count(Report.id).label("cnt"))
        .where(
            Report.ai_severity == SeverityLevel.critical,
            Report.status.not_in([ReportStatus.RESOLVED, ReportStatus.DECLINED]),
        )
        .group_by(Report.barangay)
        .order_by(func.count(Report.id).desc())
        .limit(5)
    )).all()
    critical_by_barangay = [{"barangay": bgy or "Unknown", "count": cnt} for bgy, cnt in crit_rows]

    data = dict(
        pending_over_3days=pending_over_3days,
        overdue_count=overdue_count,
        low_confidence_count=low_conf_count,
        critical_by_barangay=critical_by_barangay,
    )
    _set("priority_flags", data)
    return _ok(data)