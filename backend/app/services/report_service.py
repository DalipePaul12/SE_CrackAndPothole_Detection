"""
Report service — handles report creation, status changes, upvotes,
and upvote count aggregation (no denormalized counter).
"""
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.report import Report
from app.models.report_upvote import ReportUpvote
from app.models.audit_log import AuditLog
from app.models.enums import ReportStatus, UserRole
from app.models.user import User
from app.schemas.report import ReportCreate, ReportUpdate


# ── Helpers ────────────────────────────────────────────────────────────────────

async def get_upvote_count(db: AsyncSession, report_id: int) -> int:
    """
    Computes upvote count directly from report_upvotes table.
    No denormalized column — accurate under concurrent requests.
    """
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


# ── CRUD ───────────────────────────────────────────────────────────────────────

async def create_report(
    db: AsyncSession,
    data: ReportCreate,
    owner_id: int,
) -> Report:
    report = Report(
        owner_id=owner_id,
        latitude=data.latitude,
        longitude=data.longitude,
        barangay=data.barangay,
        street_name=data.street_name,
        description=data.description,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


async def get_report(db: AsyncSession, report_id: int) -> Optional[Report]:
    report = await _load_report(db, report_id)
    if report:
        # FIX: atomic increment — avoids lost updates under concurrent requests.
        # read-modify-write in application code (report.view_count += 1) loses
        # counts when two requests read the same value before either commits.
        await db.execute(
            update(Report)
            .where(Report.id == report_id)
            .values(view_count=Report.view_count + 1)
        )
        await db.commit()
        # Reflect the incremented value in the already-loaded object
        report.view_count += 1
    return report


async def list_reports(
    db: AsyncSession,
    status: Optional[ReportStatus] = None,
    barangay: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Report], int]:
    # FIX: lean count query — the original used query.subquery() which carried
    # selectinload() options into the COUNT, adding unnecessary joins.
    count_query = select(func.count(Report.id))
    if status:
        count_query = count_query.where(Report.status == status)
    if barangay:
        count_query = count_query.where(Report.barangay.ilike(f"%{barangay}%"))
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Paginated results with relationships
    query = select(Report).options(
        selectinload(Report.owner),
        selectinload(Report.media_attachments),
    )
    if status:
        query = query.where(Report.status == status)
    if barangay:
        query = query.where(Report.barangay.ilike(f"%{barangay}%"))
    query = query.order_by(Report.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
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

    if data.status and data.status != old_status:
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
    await db.refresh(report)
    return report


# ── Upvotes ────────────────────────────────────────────────────────────────────

async def toggle_upvote(
    db: AsyncSession,
    report_id: int,
    user_id: int,
) -> bool:
    """
    Toggles upvote. Returns True if upvote was added, False if removed.
    DB-level UniqueConstraint prevents duplicate upvotes.
    """
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
    else:
        db.add(ReportUpvote(report_id=report_id, user_id=user_id))
        await db.commit()
        return True