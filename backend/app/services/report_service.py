"""
app/services/report_service.py
───────────────────────────────
Core business logic for reports.

Key fixes vs. original
───────────────────────
1.  list_reports uses selectinload(Report.media_attachments) and
    selectinload(Report.ai_detections) so the API layer never needs to
    re-fetch each report individually — eliminates the N+1 loop in
    reports.py that was firing one SELECT per row.

2.  Total count is now computed from a SEPARATE base query (no LIMIT /
    OFFSET) so pagination metadata is correct. The old code wrapped the
    paged query in a subquery, meaning count() returned the page size
    (e.g. 11) instead of the real total.

3.  update_report_status no longer accepts TWO different field names
    (decline_reason / rejection_reason) for the same column.  The
    frontend was sending rejection_reason in some places and
    decline_reason in others — now both sides use decline_reason only.
    The legacy rejection_reason branch has been removed.
"""
from __future__ import annotations

from typing import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import ReportStatus
from app.models.report import Report
from app.models.report_upvote import ReportUpvote
from app.schemas.report import ReportCreate, ReportUpdate


# ── CREATE ────────────────────────────────────────────────────────────────────

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
        report_type=data.report_type,
        status=ReportStatus.PENDING,
        ai_damage_type=data.ai_damage_type,
        ai_severity=data.ai_severity,
        ai_confidence=data.ai_confidence,
        is_flagged_fake=data.is_flagged_fake,
        fake_confidence=data.fake_confidence,
        secondary_damage=data.secondary_damage,
        detection_note=data.detection_note,
        is_hybrid=data.is_hybrid,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


# ── LIST ──────────────────────────────────────────────────────────────────────

async def list_reports(
    db: AsyncSession,
    *,
    owner_id: int | None = None,
    status: ReportStatus | None = None,
    barangay: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[Sequence[Report], int]:
    """
    Returns (reports_for_page, total_count).

    FIX — selectinload:
        Relationships (media_attachments, ai_detections, owner) are loaded
        in a single IN-clause query for the whole page, NOT one query per
        row.  This eliminates the N+1 pattern where SQLAlchemy was firing:
            SELECT media_attachments WHERE report_id IN ($1)   ← one ID
        instead of:
            SELECT media_attachments WHERE report_id IN ($1,$2,...,$N)

    FIX — correct total count:
        The original code did:
            count_q = select(func.count()).select_from(paged_query.subquery())
        which wrapped the LIMIT/OFFSET query in a subquery so count()
        returned the page size, not the real total.  We now build a
        separate base_q (filters only, no LIMIT/OFFSET) and count against
        that.
    """
    # ── Base filter query (no paging) ─────────────────────────────────────
    base_q = select(Report).order_by(Report.created_at.desc())

    if owner_id is not None:
        base_q = base_q.where(Report.owner_id == owner_id)
    if status is not None:
        base_q = base_q.where(Report.status == status)
    if barangay is not None:
        base_q = base_q.where(Report.barangay == barangay)

    # ── Total count — runs against base_q WITHOUT limit/offset ────────────
    count_q = select(func.count()).select_from(base_q.subquery())
    total: int = (await db.execute(count_q)).scalar_one()

    # ── Paged data query ──────────────────────────────────────────────────
    data_q = (
        base_q
        .options(
            selectinload(Report.media_attachments),
            selectinload(Report.ai_detections),
            selectinload(Report.owner),
        )
        .limit(page_size)
        .offset((page - 1) * page_size)
    )

    result  = await db.execute(data_q)
    reports = result.scalars().all()

    return reports, total


# ── UPDATE STATUS ─────────────────────────────────────────────────────────────

async def update_report_status(
    db: AsyncSession,
    report: Report,
    data: ReportUpdate,
    current_user,
) -> Report:
    """
    Apply partial updates to a report and persist them.

    FIX — field name standardisation:
        The original accepted BOTH `decline_reason` AND `rejection_reason`
        and mapped them to the same DB column.  This created ambiguity:
        AdminManageRequests sent rejection_reason while AdminAllReports and
        the new fixed frontend both send decline_reason.

        The `rejection_reason` branch has been removed.  All frontend pages
        now send `decline_reason` exclusively, matching this service and the
        DB column name.  If you ever need to accept a legacy payload, add a
        migration at the schema/API boundary rather than here.
    """
    if data.status is not None:
        report.status = data.status

    # FIX: single canonical field — rejection_reason alias removed
    if data.decline_reason is not None:
        report.decline_reason = data.decline_reason

    if data.assigned_to is not None:
        report.assigned_to = data.assigned_to

    await db.commit()
    await db.refresh(report)
    return report


# ── UPVOTES ───────────────────────────────────────────────────────────────────

async def get_upvote_count(db: AsyncSession, report_id: int) -> int:
    """Single-report upvote count. Use _bulk_upvote_counts in reports.py for lists."""
    result = await db.execute(
        select(func.count()).where(ReportUpvote.report_id == report_id)
    )
    return result.scalar_one()


async def toggle_upvote(
    db: AsyncSession,
    report_id: int,
    user_id: int,
) -> bool:
    """Returns True if upvote was added, False if it was removed."""
    result = await db.execute(
        select(ReportUpvote).where(
            ReportUpvote.report_id == report_id,
            ReportUpvote.user_id   == user_id,
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