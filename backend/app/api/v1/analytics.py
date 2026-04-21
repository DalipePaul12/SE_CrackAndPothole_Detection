import asyncio
import time
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.report import Report
from app.models.user import User
from app.models.enums import ReportStatus, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["Analytics"])

_CACHE_TTL_SECONDS = 60
_cache: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL_SECONDS:
        return entry[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (time.monotonic(), value)


def _ok(data: Any) -> dict:
    return {"success": True, "data": data}


async def _scalar(db: AsyncSession, stmt) -> int:
    return (await db.execute(stmt)).scalar_one()


def _enum_val(enum_or_none) -> str:
    return enum_or_none.value if enum_or_none is not None else "unknown"


def invalidate_analytics_cache() -> None:
    for key in [
        "dashboard_summary", "damage_type_stats", "report_status_stats",
        "monthly_reports", "barangay_ranking", "severity_stats",
    ]:
        _cache.pop(key, None)
    logger.debug("analytics: cache invalidated")


def _require_staff(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (UserRole.admin, UserRole.contractor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Analytics require admin or contractor access.",
        )
    return current_user


@router.get("/dashboard-summary")
@limiter.limit("30/minute")
async def get_dashboard_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_staff),
):
    cached = _cache_get("dashboard_summary")
    if cached is not None:
        return _ok(cached)

    (
        total_reports, pending, verified,
        in_progress, resolved, declined, active_users,
    ) = await asyncio.gather(
        _scalar(db, select(func.count(Report.id))),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.PENDING)),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.VERIFIED)),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.IN_PROGRESS)),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.RESOLVED)),
        _scalar(db, select(func.count(Report.id)).where(Report.status == ReportStatus.DECLINED)),
        _scalar(db, select(func.count(User.id)).where(User.is_active == True)),  # noqa: E712
    )

    data = {
        "total_reports": total_reports,
        "pending":       pending,
        "verified":      verified,
        "in_progress":   in_progress,
        "resolved":      resolved,
        "declined":      declined,
        "active_users":  active_users,
    }
    _cache_set("dashboard_summary", data)
    return _ok(data)


@router.get("/damage-type-stats")
@limiter.limit("30/minute")
async def get_damage_type_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_staff),
):
    cached = _cache_get("damage_type_stats")
    if cached is not None:
        return _ok(cached)

    result = await db.execute(
        select(Report.ai_damage_type, func.count(Report.id)).group_by(Report.ai_damage_type)
    )
    data = {_enum_val(dt): count for dt, count in result.all()}
    _cache_set("damage_type_stats", data)
    return _ok(data)


@router.get("/report-status-stats")
@limiter.limit("30/minute")
async def get_report_status_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_staff),
):
    cached = _cache_get("report_status_stats")
    if cached is not None:
        return _ok(cached)

    result = await db.execute(
        select(Report.status, func.count(Report.id)).group_by(Report.status)
    )
    data = {s.value: count for s, count in result.all()}
    _cache_set("report_status_stats", data)
    return _ok(data)


@router.get("/monthly-reports")
@limiter.limit("30/minute")
async def get_monthly_reports(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_staff),
):
    cached = _cache_get("monthly_reports")
    if cached is not None:
        return _ok(cached)

    result = await db.execute(
        select(
            func.to_char(Report.created_at, "YYYY-MM").label("month"),
            func.count(Report.id),
        )
        .group_by("month")
        .order_by("month")
    )
    data = [{"month": month, "count": count} for month, count in result.all()]
    _cache_set("monthly_reports", data)
    return _ok(data)


@router.get("/barangay-ranking")
@limiter.limit("30/minute")
async def get_barangay_ranking(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_staff),
):
    cached = _cache_get("barangay_ranking")
    if cached is not None:
        return _ok(cached)

    result = await db.execute(
        select(Report.barangay, func.count(Report.id))
        .group_by(Report.barangay)
        .order_by(func.count(Report.id).desc())
        .limit(10)
    )
    data = [
        {"barangay": bgy or "Unidentified", "count": count}
        for bgy, count in result.all()
    ]
    _cache_set("barangay_ranking", data)
    return _ok(data)


@router.get("/severity-stats")
@limiter.limit("30/minute")
async def get_severity_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_staff),
):
    cached = _cache_get("severity_stats")
    if cached is not None:
        return _ok(cached)

    result = await db.execute(
        select(Report.ai_severity, func.count(Report.id)).group_by(Report.ai_severity)
    )
    data = {_enum_val(sev): count for sev, count in result.all()}
    _cache_set("severity_stats", data)
    return _ok(data)