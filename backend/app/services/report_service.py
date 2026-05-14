"""
backend/app/services/report_service.py
──────────────────────────────────────
Report CRUD + upvote service layer.

Fully aligned with:
  • app/models/report.py          (SQLAlchemy ORM with 7 new columns)
  • app/schemas/report.py         (Pydantic v2 ReportCreate / ReportUpdate)
  • app/api/v1/reports.py         (FastAPI endpoints)

Handles all new fields: ai_validation_*, capture_metadata, requires_admin_review,
review_reason, disclaimer_accepted, is_hybrid, secondary_damage, detection_note.
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
    """
    Persist a new report with all AI-generated and user-provided fields.
    """
    report = Report(
        owner_id=owner_id,
        latitude=data.latitude,
        longitude=data.longitude,
        barangay=data.barangay,
        street_name=data.street_name,
        description=data.description,
        report_type=data.report_type,
        status=ReportStatus.PENDING,

        # ── ML results ─────────────────────────────────────────────────────
        ai_damage_type=data.ai_damage_type,
        ai_severity=data.ai_severity,
        ai_confidence=data.ai_confidence,

        # ── Legacy fake detection ─────────────────────────────────────────
        is_flagged_fake=data.is_flagged_fake,
        fake_confidence=data.fake_confidence,

        # ── Structured AI validation audit ────────────────────────────────
        ai_validation_status=data.ai_validation_status,
        ai_validation_confidence=data.ai_validation_confidence,
        ai_validation_model=data.ai_validation_model,

        # ── Capture metadata (angle, distance, device info) ────────────────
        capture_metadata=data.capture_metadata,

        # ── Admin review flags ──────────────────────────────────────────────
        requires_admin_review=data.requires_admin_review,
        review_reason=data.review_reason,

        # ── Legal disclaimer ────────────────────────────────────────────────
        disclaimer_accepted=data.disclaimer_accepted,

        # ── Hybrid / video ────────────────────────────────────────────────
        is_hybrid=data.is_hybrid,
        secondary_damage=data.secondary_damage,
        detection_note=data.detection_note,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


# ── LIST ────────────────────────────────────────────────────────────────────

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
        Relationships are loaded in a single IN-clause query for the whole
        page, NOT one query per row.
    """
    # Base filter query (no paging)
    base_q = select(Report).order_by(Report.created_at.desc())

    if owner_id is not None:
        base_q = base_q.where(Report.owner_id == owner_id)
    if status is not None:
        base_q = base_q.where(Report.status == status)
    if barangay is not None:
        base_q = base_q.where(Report.barangay == barangay)

    # Total count — runs against base_q WITHOUT limit/offset
    count_q = select(func.count()).select_from(base_q.subquery())
    total: int = (await db.execute(count_q)).scalar_one()

    # Paged data query with eager-loaded relationships
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

    result = await db.execute(data_q)
    reports = result.scalars().all()

    return reports, total


# ── UPDATE STATUS ───────────────────────────────────────────────────────────

async def update_report_status(
    db: AsyncSession,
    report: Report,
    data: ReportUpdate,
    current_user,
) -> Report:
    """
    Apply partial updates to a report and persist them.
    Only updates fields that are explicitly provided (not None).
    """
    if data.status is not None:
        report.status = data.status

    if data.decline_reason is not None:
        report.decline_reason = data.decline_reason

    if data.assigned_to is not None:
        report.assigned_to = data.assigned_to

    # Admin review controls
    if data.requires_admin_review is not None:
        report.requires_admin_review = data.requires_admin_review
    if data.review_reason is not None:
        report.review_reason = data.review_reason

    await db.commit()
    await db.refresh(report)
    return report


# ── UPVOTES ───────────────────────────────────────────────────────────────

async def get_upvote_count(db: AsyncSession, report_id: int) -> int:
    """Return total upvotes for a report."""
    result = await db.execute(
        select(func.count()).where(ReportUpvote.report_id == report_id)
    )
    return result.scalar_one()


async def toggle_upvote(
    db: AsyncSession,
    report_id: int,
    user_id: int,
) -> bool:
    """
    Toggle upvote for a report by a user.
    Returns True if upvote was ADDED, False if REMOVED.
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

    db.add(ReportUpvote(report_id=report_id, user_id=user_id))
    await db.commit()
    return True