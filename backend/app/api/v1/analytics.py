"""
analytics.py — Dashboard analytics endpoints.
All routes require admin, superadmin, or contractor role.
Redis-backed TTL cache (60 s) with graceful in-process fallback when Redis
is unreachable, so the endpoints never crash due to cache unavailability.
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None  # type: ignore[assignment]
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.project import Project
from app.models.report import Report
from app.models.user import User
from app.models.enums import DamageType, ProjectStatus, ReportStatus, SeverityLevel, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])

# ── Cache configuration ────────────────────────────────────────────────────
_CACHE_TTL = 60          # seconds
_CACHE_PREFIX = "analytics:"

# Module-level Redis client — lazily connected on first use.
_redis_client = None


def _get_redis():
    """Return a shared Redis client, or None if Redis is unavailable."""
    global _redis_client
    if aioredis is None:
        return None
    if _redis_client is None:
        url = os.getenv("REDIS_URL")
        if url:
            _redis_client = aioredis.from_url(url, decode_responses=True)
    return _redis_client


async def _cache_get(key: str) -> Any | None:
    """Return cached value for *key*, or None on miss / Redis error."""
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(f"{_CACHE_PREFIX}{key}")
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        logger.warning("Redis cache GET failed (key=%s): %s", key, exc)
        return None


async def _cache_set(key: str, val: Any) -> None:
    """Store *val* under *key* with TTL; silently skip on Redis error."""
    r = _get_redis()
    if r is None:
        return
    try:
        await r.set(f"{_CACHE_PREFIX}{key}", json.dumps(val), ex=_CACHE_TTL)
    except Exception as exc:
        logger.warning("Redis cache SET failed (key=%s): %s", key, exc)


async def invalidate_analytics_cache() -> None:
    """Delete all analytics cache keys. No-op if Redis is unreachable."""
    r = _get_redis()
    if r is None:
        return
    try:
        keys = await r.keys(f"{_CACHE_PREFIX}*")
        if keys:
            await r.delete(*keys)
        logger.debug("analytics cache cleared (%d keys)", len(keys))
    except Exception as exc:
        logger.warning("Redis cache CLEAR failed: %s", exc)


# ── Helpers ────────────────────────────────────────────────────────────────

def _ok(data: Any) -> dict:
    return {"success": True, "data": data}


async def _scalar(db: AsyncSession, stmt) -> int:
    return (await db.execute(stmt)).scalar_one_or_none() or 0


def _require_staff(current_user: User = Depends(get_current_user)) -> User:
    """Allow admin, superadmin, and contractor — reject everyone else."""
    if current_user.role not in (
        UserRole.admin,
        UserRole.superadmin,
        UserRole.contractor,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient privileges.",
        )
    return current_user


# ── /dashboard-summary ─────────────────────────────────────────────────────
@router.get("/dashboard-summary")
@limiter.limit("30/minute")
async def get_dashboard_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("dashboard_summary")) is not None:
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
    await _cache_set("dashboard_summary", data)
    return _ok(data)


# ── /damage-type-stats ──────────────────────────────────────────────────────
@router.get("/damage-type-stats")
@limiter.limit("30/minute")
async def get_damage_type_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("damage_type_stats")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report.ai_damage_type, func.count(Report.id)).group_by(Report.ai_damage_type)
    )).all()
    data = {(dt.value if dt else "unknown"): cnt for dt, cnt in rows}
    await _cache_set("damage_type_stats", data)
    return _ok(data)


# ── /report-status-stats ────────────────────────────────────────────────────
@router.get("/report-status-stats")
@limiter.limit("30/minute")
async def get_report_status_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("report_status_stats")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report.status, func.count(Report.id)).group_by(Report.status)
    )).all()
    data = {s.value: cnt for s, cnt in rows}
    await _cache_set("report_status_stats", data)
    return _ok(data)


# ── /monthly-reports ────────────────────────────────────────────────────────
@router.get("/monthly-reports")
@limiter.limit("30/minute")
async def get_monthly_reports(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("monthly_reports")) is not None:
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
    await _cache_set("monthly_reports", data)
    return _ok(data)


# ── /severity-stats ─────────────────────────────────────────────────────────
@router.get("/severity-stats")
@limiter.limit("30/minute")
async def get_severity_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("severity_stats")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report.ai_severity, func.count(Report.id)).group_by(Report.ai_severity)
    )).all()
    data = {(sev.value if sev else "unknown"): cnt for sev, cnt in rows}
    result = {
        "critical": data.get("critical", 0),
        "medium":   data.get("medium", 0),
        "low":      data.get("low", 0),
    }
    await _cache_set("severity_stats", result)
    return _ok(result)


# ── /hotspots ───────────────────────────────────────────────────────────────
@router.get("/hotspots")
@limiter.limit("30/minute")
async def get_hotspots(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("hotspots")) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report.barangay, func.count(Report.id).label("cnt"))
        .group_by(Report.barangay)
        .order_by(func.count(Report.id).desc())
        .limit(10)
    )).all()
    data = [{"barangay": bgy or "Unidentified", "count": cnt} for bgy, cnt in rows]
    await _cache_set("hotspots", data)
    return _ok(data)


# ── /barangay-trend ─────────────────────────────────────────────────────────
@router.get("/barangay-trend")
@limiter.limit("30/minute")
async def get_barangay_trend(
    request: Request,
    barangay: str = Query(..., description="Barangay name to filter by"),
    days: int = Query(30, ge=7, le=365, description="Lookback window in days"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    """
    Time-series of open vs. resolved report counts for a single barangay.

    Granularity auto-scales: 'day' for <= 60-day windows, 'week' otherwise.
    Returns [{ period: "YYYY-MM-DD", open_count: int, resolved_count: int }]
    ordered by period ascending.
    """
    cache_key = f"barangay_trend:{barangay.lower().strip()}:{days}"
    if (c := await _cache_get(cache_key)) is not None:
        return _ok(c)

    trunc     = "day" if days <= 60 else "week"
    cutoff    = datetime.now(tz=timezone.utc) - timedelta(days=days)
    terminal  = [
        ReportStatus.RESOLVED, ReportStatus.DECLINED, ReportStatus.COMPLETED,
        ReportStatus.REJECTED, ReportStatus.CANCELLED,
    ]

    period_col = func.date_trunc(trunc, Report.created_at).label("period")
    stmt = (
        select(
            period_col,
            func.sum(case((Report.status.notin_(terminal), 1), else_=0)).label("open_count"),
            func.sum(case((Report.status == ReportStatus.RESOLVED,  1), else_=0)).label("resolved_count"),
        )
        .where(Report.barangay.ilike(barangay.strip()))
        .where(Report.created_at >= cutoff)
        .group_by(period_col)
        .order_by(period_col)
    )

    rows = (await db.execute(stmt)).all()
    data = [
        {
            "period": (
                str(row.period.date())
                if hasattr(row.period, "date")
                else str(row.period)[:10]
            ),
            "open_count":     int(row.open_count),
            "resolved_count": int(row.resolved_count),
        }
        for row in rows
    ]
    await _cache_set(cache_key, data)
    return _ok(data)


# ── /sla-stats ──────────────────────────────────────────────────────────────
@router.get("/sla-stats")
@limiter.limit("30/minute")
async def get_sla_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("sla_stats")) is not None:
        return _ok(c)

    now = datetime.now(timezone.utc)
    sla_days = 7

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
    await _cache_set("sla_stats", data)
    return _ok(data)


# ── /ai-insights ────────────────────────────────────────────────────────────
@router.get("/ai-insights")
@limiter.limit("30/minute")
async def get_ai_insights(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("ai_insights")) is not None:
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

    dup_sub = (
        select(func.count(Report.id).label("cnt"))
        .group_by(Report.latitude, Report.longitude)
        .having(func.count(Report.id) > 2)
        .subquery()
    )
    dup_count = (await db.execute(select(func.count()).select_from(dup_sub))).scalar_one_or_none() or 0

    avg_conf = (await db.execute(select(func.avg(Report.ai_confidence)))).scalar_one_or_none()
    avg_accuracy = round(float(avg_conf) * 100) if avg_conf else None

    data = dict(
        low_confidence_pct=low_conf_pct,
        crack_change_pct=crack_change_pct,
        duplicate_count=dup_count,
        avg_model_accuracy=avg_accuracy,
    )
    await _cache_set("ai_insights", data)
    return _ok(data)


# ── /recent-reports ─────────────────────────────────────────────────────────
@router.get("/recent-reports")
@limiter.limit("30/minute")
async def get_recent_reports(
    request: Request,
    limit: int = Query(default=8, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    cache_key = f"recent_reports_{limit}"
    if (c := await _cache_get(cache_key)) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report)
        .order_by(Report.created_at.desc())
        .limit(limit)
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
    await _cache_set(cache_key, data)
    return _ok(data)


# ── /activity-feed ──────────────────────────────────────────────────────────
@router.get("/activity-feed")
@limiter.limit("30/minute")
async def get_activity_feed(
    request: Request,
    limit: int = Query(default=8, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    cache_key = f"activity_feed_{limit}"
    if (c := await _cache_get(cache_key)) is not None:
        return _ok(c)

    rows = (await db.execute(
        select(Report)
        .order_by(Report.updated_at.desc())
        .limit(limit)
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

    await _cache_set(cache_key, data)
    return _ok(data)


# ── /priority-flags ─────────────────────────────────────────────────────────
@router.get("/priority-flags")
@limiter.limit("30/minute")
async def get_priority_flags(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    if (c := await _cache_get("priority_flags")) is not None:
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
    await _cache_set("priority_flags", data)
    return _ok(data)


# ── /contractor-performance ─────────────────────────────────────────────────
@router.get("/contractor-performance")
@limiter.limit("30/minute")
async def get_contractor_performance(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_require_staff),
):
    """Return per-contractor stats: active projects, completed count, avg resolution days."""
    if (c := await _cache_get("contractor_performance")) is not None:
        return _ok(c)

    active_sq = (
        select(func.count(Project.id))
        .where(Project.contractor_id == User.id)
        .where(Project.status.notin_([ProjectStatus.COMPLETED, ProjectStatus.CANCELLED]))
        .correlate(User)
        .scalar_subquery()
    )
    completed_sq = (
        select(func.count(Project.id))
        .where(Project.contractor_id == User.id)
        .where(Project.status == ProjectStatus.COMPLETED)
        .correlate(User)
        .scalar_subquery()
    )
    avg_days_sq = (
        select(
            func.avg(
                func.extract("epoch", Project.actual_completion_date - Project.start_date) / 86400.0
            )
        )
        .where(Project.contractor_id == User.id)
        .where(Project.status == ProjectStatus.COMPLETED)
        .where(Project.actual_completion_date.isnot(None))
        .where(Project.start_date.isnot(None))
        .correlate(User)
        .scalar_subquery()
    )

    rows = (await db.execute(
        select(
            User,
            active_sq.label("active_projects"),
            completed_sq.label("completed_projects"),
            avg_days_sq.label("avg_resolution_days"),
        )
        .where(User.role == UserRole.contractor)
        .order_by(completed_sq.desc(), User.full_name)
    )).all()

    data = [
        {
            "contractor_id": user.id,
            "full_name": user.full_name or user.email,
            "email": user.email,
            "active_projects": active or 0,
            "completed_projects": completed or 0,
            "avg_resolution_days": round(float(avg_days), 1) if avg_days else None,
        }
        for user, active, completed, avg_days in rows
    ]

    await _cache_set("contractor_performance", data)
    return _ok(data)
