from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select

from app.models.admin_settings import AdminSettings
from app.models.enums import ReportStatus
from app.models.report import Report

TERMINAL_STATUSES = (
    ReportStatus.RESOLVED, ReportStatus.DECLINED, ReportStatus.COMPLETED,
    ReportStatus.REJECTED, ReportStatus.CANCELLED,
)


@dataclass(frozen=True)
class ReportSLA:
    now: datetime
    response_hours: int
    escalation_hours: int

    def cutoff(self, hours):
        return self.now - timedelta(hours=hours)

    def past_sla(self):
        return and_(
            Report.status.not_in(TERMINAL_STATUSES),
            Report.created_at <= self.cutoff(min(self.response_hours, self.escalation_hours)),
        )

    def classify(self, created_at, status):
        if created_at is None or status in TERMINAL_STATUSES:
            return None, None
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if created_at <= self.cutoff(self.escalation_hours):
            category = "escalated"
        elif created_at <= self.cutoff(self.response_hours):
            category = "overdue"
        else:
            category = "on_track"
        elapsed = (self.now - created_at).total_seconds() / 3600
        return category, round(elapsed, 1)


async def get_sla(db):
    settings = (await db.execute(select(AdminSettings).where(AdminSettings.id == 1))).scalar_one_or_none()
    return ReportSLA(
        datetime.now(timezone.utc),
        settings.response_time_hours if settings else 24,
        settings.escalate_after_hours if settings else 72,
    )


async def count_past_sla(db):
    sla = await get_sla(db)
    result = await db.execute(select(func.count(Report.id)).where(sla.past_sla()))
    return result.scalar_one()
