"""
Analytics router — admin-only dashboard statistics.

GET /analytics/dashboard-summary
GET /analytics/severity-stats
GET /analytics/barangay-ranking
GET /analytics/monthly-reports
GET /analytics/confidence-stats
GET /analytics/damage-type-stats
GET /analytics/report-status-stats
GET /analytics/top-active-users
GET /analytics/cctv-activity-stats
GET /analytics/reports-by-cctv
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends

from app.db.session import get_db
from app.middleware.auth_middleware import require_admin
from app.models.cctv import CCTV
from app.models.report import Report
from app.models.user import User
from app.models.enums import ReportStatus

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/dashboard-summary", dependencies=[Depends(require_admin)])
async def get_dashboard_summary(db: AsyncSession = Depends(get_db)):
    total_reports = (await db.execute(select(func.count(Report.id)))).scalar_one()
    pending     = (await db.execute(select(func.count(Report.id)).where(Report.status == ReportStatus.PENDING))).scalar_one()
    verified    = (await db.execute(select(func.count(Report.id)).where(Report.status == ReportStatus.VERIFIED))).scalar_one()
    in_progress = (await db.execute(select(func.count(Report.id)).where(Report.status == ReportStatus.IN_PROGRESS))).scalar_one()
    resolved    = (await db.execute(select(func.count(Report.id)).where(Report.status == ReportStatus.RESOLVED))).scalar_one()
    declined    = (await db.execute(select(func.count(Report.id)).where(Report.status == ReportStatus.DECLINED))).scalar_one()
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar_one()

    return {
        "total_reports": total_reports,
        "pending":       pending,
        "verified":      verified,
        "in_progress":   in_progress,
        "resolved":      resolved,
        "declined":      declined,
        "active_users":  active_users,
    }


@router.get("/severity-stats", dependencies=[Depends(require_admin)])
async def get_severity_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Report.ai_severity, func.count(Report.id)).group_by(Report.ai_severity)
    )
    return {
        (severity.value if severity else "unknown"): count
        for severity, count in result.all()
    }


@router.get("/barangay-ranking", dependencies=[Depends(require_admin)])
async def get_barangay_ranking(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Report.barangay, func.count(Report.id))
        .group_by(Report.barangay)
        .order_by(func.count(Report.id).desc())
        .limit(10)
    )
    return [
        {"barangay": bgy or "Unidentified", "count": count}
        for bgy, count in result.all()
    ]


@router.get("/monthly-reports", dependencies=[Depends(require_admin)])
async def get_monthly_reports(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            func.to_char(Report.created_at, "YYYY-MM").label("month"),
            func.count(Report.id),
        )
        .group_by("month")
        .order_by("month")
    )
    return [{"month": month, "count": count} for month, count in result.all()]


@router.get("/confidence-stats", dependencies=[Depends(require_admin)])
async def get_confidence_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            (func.floor(Report.ai_confidence * 10) / 10.0).label("bucket"),
            func.count(Report.id),
        )
        .where(Report.ai_confidence.isnot(None))
        .group_by("bucket")
        .order_by("bucket")
    )
    return [{"bucket": f"{bucket:.1f}", "count": count} for bucket, count in result.all()]


@router.get("/damage-type-stats", dependencies=[Depends(require_admin)])
async def get_damage_type_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Report.ai_damage_type, func.count(Report.id)).group_by(Report.ai_damage_type)
    )
    return {
        (damage_type.value if damage_type else "unknown"): count
        for damage_type, count in result.all()
    }


@router.get("/report-status-stats", dependencies=[Depends(require_admin)])
async def get_report_status_stats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Report.status, func.count(Report.id)).group_by(Report.status)
    )
    return {status.value: count for status, count in result.all()}


@router.get("/top-active-users", dependencies=[Depends(require_admin)])
async def get_top_active_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User.public_id, User.full_name, func.count(Report.id).label("count"))
        .join(Report, Report.owner_id == User.id)
        .group_by(User.public_id, User.full_name)
        .order_by(func.count(Report.id).desc())
        .limit(10)
    )
    return [
        {"public_id": str(public_id), "full_name": full_name, "report_count": count}
        for public_id, full_name, count in result.all()
    ]


@router.get("/cctv-activity-stats", dependencies=[Depends(require_admin)])
async def get_cctv_activity_stats(db: AsyncSession = Depends(get_db)):
    active   = (await db.execute(select(func.count(CCTV.id)).where(CCTV.is_active == True))).scalar_one()
    inactive = (await db.execute(select(func.count(CCTV.id)).where(CCTV.is_active == False))).scalar_one()
    return {"active_cctvs": active, "inactive_cctvs": inactive}


@router.get("/reports-by-cctv", dependencies=[Depends(require_admin)])
async def get_reports_by_cctv(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(CCTV.location_name, func.count(Report.id))
            .join(Report, Report.cctv_id == CCTV.id)  # type: ignore[attr-defined]
            .group_by(CCTV.location_name)
            .order_by(func.count(Report.id).desc())
        )
        return [
            {"cctv_location": loc or "Unknown", "report_count": count}
            for loc, count in result.all()
        ]
    except Exception:
        return []