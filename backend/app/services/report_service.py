from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.report import Report
from app.models.report_upvote import ReportUpvote
from app.models.audit_log import AuditLog
from app.models.enums import ReportStatus
from app.models.user import User
from app.schemas.report import ReportCreate, ReportUpdate

import logging

logger = logging.getLogger(__name__)


async def get_upvote_count(db: AsyncSession, report_id: int) -> int:
    result = await db.execute(
        select(func.count()).where(ReportUpvote.report_id == report_id)
    )
    return result.scalar_one()


async def _load_report(db: AsyncSession, report_id: int) -> Optional[Report]:
    result = await db.execute(
        select(Report)
        .options(
            selectinload(Report.owner),
            selectinload(Report.media_attachments),
            selectinload(Report.ai_detections),
            selectinload(Report.upvotes),
        )
        .where(Report.id == report_id)
    )
    return result.scalar_one_or_none()


async def create_report(db: AsyncSession, data: ReportCreate, owner_id: int) -> Report:
    report = Report(
        owner_id=owner_id,
        latitude=data.latitude,
        longitude=data.longitude,
        barangay=data.barangay,
        street_name=data.street_name,
        description=data.description,
        ai_damage_type=data.ai_damage_type,
        ai_severity=data.ai_severity,
        ai_confidence=data.ai_confidence,
        is_flagged_fake=data.is_flagged_fake,
        fake_confidence=data.fake_confidence or 0.0,
        status=ReportStatus.PENDING,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


async def get_report(db: AsyncSession, report_id: int) -> Optional[Report]:
    report = await _load_report(db, report_id)
    if report:
        await db.execute(
            update(Report)
            .where(Report.id == report_id)
            .values(view_count=Report.view_count + 1)
        )
        await db.commit()
        report.view_count += 1
    return report


async def list_reports(
    db: AsyncSession,
    *,
    owner_id: Optional[int] = None,
    status: Optional[ReportStatus] = None,
    barangay: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Report], int]:
    count_q = select(func.count(Report.id))
    if owner_id is not None:
        count_q = count_q.where(Report.owner_id == owner_id)
    if status is not None:
        count_q = count_q.where(Report.status == status)
    if barangay:
        count_q = count_q.where(Report.barangay.ilike(f"%{barangay}%"))
    total = (await db.execute(count_q)).scalar_one()

    query = select(Report).options(
        selectinload(Report.owner),
        selectinload(Report.media_attachments),
    )
    if owner_id is not None:
        query = query.where(Report.owner_id == owner_id)
    if status is not None:
        query = query.where(Report.status == status)
    if barangay:
        query = query.where(Report.barangay.ilike(f"%{barangay}%"))
    query = (
        query
        .order_by(Report.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    return result.scalars().all(), total


async def update_report_status(
    db: AsyncSession,
    report: Report,
    data: ReportUpdate,
    changed_by: User,
) -> Report:
    old_status = report.status

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(report, field, value)

    await db.commit()
    await db.refresh(report)

    if data.status and data.status != old_status:
        try:
            log = AuditLog(
                user_id=changed_by.id,
                action="STATUS_CHANGED",
                target_resource="reports",
                target_id=report.id,
                details={
                    "old_status": old_status.value,
                    "new_status": data.status.value,
                },
            )
            db.add(log)
            await db.commit()
        except Exception as e:
            logger.warning("AuditLog insert failed (non-fatal): %s", e)
            await db.rollback()

    return report


async def toggle_upvote(
    db: AsyncSession,
    report_id: int,
    user_id: int,
) -> bool:
    result = await db.execute(
        select(ReportUpvote).where(
            ReportUpvote.report_id == report_id,
            ReportUpvote.user_id == user_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return False

    db.add(ReportUpvote(report_id=report_id, user_id=user_id))
    await db.commit()
    return True