from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Literal, Sequence

from sqlalchemy import String, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings, LOW_CONFIDENCE_TRIAGE_THRESHOLDS
from app.models.enums import DamageType, ReportStatus, SeverityLevel
from app.models.report import Report
from app.models.project import Project
from app.models.repair_review import RepairReview
from app.models.report_upvote import ReportUpvote
from app.schemas.report import ReportCreate, ReportUpdate
from app.services import prior_repairs


# ── CREATE ────────────────────────────────────────────────────────────────────

async def create_report(
    db: AsyncSession,
    data: ReportCreate,
    owner_id: int,
) -> Report:
    """
    Persist a new report with all AI-generated and user-provided fields.
    """
    # Apply admin default_severity when ML hasn't assigned one.
    # Falls back to None (original behaviour) if admin settings are unavailable.
    effective_severity = data.ai_severity

    # FIX: _cfg must exist regardless of which branch runs below, or the
    # auto-assign check after this block raises UnboundLocalError whenever
    # data.ai_severity is already set (e.g. client-computed severity from
    # useSubmitReport.js), since the fetch below was previously skipped.
    _cfg = None
    if effective_severity is None:
        from sqlalchemy import select as _sel
        from app.models.admin_settings import AdminSettings as _AS
        _cfg = (
            await db.execute(_sel(_AS).where(_AS.id == 1))
        ).scalar_one_or_none()
        if _cfg and _cfg.default_severity:
            try:
                effective_severity = SeverityLevel(_cfg.default_severity)
            except ValueError:
                pass  # unrecognised enum value — leave as None

    # ── Auto-assign stub ──────────────────────────────────────────────────────
    # When auto_assign is enabled in AdminSettings, reports would be
    # automatically routed to a contractor based on a barangay routing table.
    # That routing table is not yet configured, so this is intentionally a
    # no-op: the flag is checked and logged, but no assignment is made.
    if _cfg and getattr(_cfg, "auto_assign", False):
        pass  # TODO: route report to contractor via barangay routing table

    # ── Confidence-based auto-triage ──────────────────────────────────────────
    # Per-damage-type thresholds (config.LOW_CONFIDENCE_TRIAGE_THRESHOLDS) gate
    # whether an accepted detection still needs a human eye.  Purely additive:
    # an existing True flag / reason from the detection pipeline is preserved.
    #
    # Null handling: missing confidence OR missing damage type is treated as
    # low-confidence — do not silently pass an unverifiable detection.
    _effective_requires_review = bool(data.requires_admin_review)
    _effective_review_reason   = data.review_reason

    _conf  = data.ai_confidence
    _dtype = data.ai_damage_type.value if data.ai_damage_type is not None else None

    if _conf is None or _dtype is None:
        # Cannot evaluate confidence without both values — flag unconditionally.
        _effective_requires_review = True
        if not _effective_review_reason:
            _effective_review_reason = (
                "Missing confidence data — flagged for manual review"
            )
    else:
        _thresh = LOW_CONFIDENCE_TRIAGE_THRESHOLDS.get(_dtype, 0.5)
        if _conf < _thresh:
            _effective_requires_review = True
            if not _effective_review_reason:
                _effective_review_reason = (
                    f"Low AI detection confidence for {_dtype} "
                    f"({_conf:.2f} < {_thresh:.2f})"
                )

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
        ai_severity=effective_severity,
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
        requires_admin_review=_effective_requires_review,
        review_reason=_effective_review_reason,

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

ReportSort = Literal["created_at", "severity", "priority", "status"]
SortDirection = Literal["asc", "desc"]

async def list_reports(
    db: AsyncSession,
    *,
    owner_id: int | None = None,
    status: ReportStatus | None = None,
    barangay: str | None = None,
    damage_type: DamageType | None = None,
    severity: SeverityLevel | None = None,
    awaiting_repair_review: bool = False,
    possible_repeat_damage: bool = False,
    search: str | None = None,
    created_from: datetime | None = None,
    created_before: datetime | None = None,
    sort_by: ReportSort = "created_at",
    sort_dir: SortDirection = "desc",
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
    base_q = select(Report)
    # Older submissions use Tanong for Tañong.
    barangay_name = func.replace(func.lower(func.trim(Report.barangay)), "ñ", "n")

    if owner_id is not None:
        base_q = base_q.where(Report.owner_id == owner_id)
    if status is not None:
        base_q = base_q.where(Report.status == status)
    if barangay is not None:
        base_q = base_q.where(barangay_name == barangay.strip().lower().replace("ñ", "n"))
    if damage_type is not None:
        base_q = base_q.where(Report.ai_damage_type == damage_type)
    if severity is not None:
        base_q = base_q.where(Report.ai_severity == severity)
    if awaiting_repair_review:
        pending = (select(Project.report_id).join(RepairReview, RepairReview.project_id == Project.id)
                   .where(RepairReview.status == "pending"))
        base_q = base_q.where(Report.status == ReportStatus.IN_PROGRESS, Report.id.in_(pending))
    if possible_repeat_damage:
        base_q = base_q.where(prior_repairs.has_match())
    if created_from is not None:
        base_q = base_q.where(Report.created_at >= created_from)
    if created_before is not None:
        base_q = base_q.where(Report.created_at < created_before)

    term = (search or "").strip().lower()
    if term:
        formatted_id = re.fullmatch(r"(?:#|rpt-)([0-9]+)", term)
        id_text = cast(Report.id, String)
        if formatted_id:
            base_q = base_q.where(id_text == (formatted_id[1].lstrip("0") or "0"))
        else:
            matches = [
                barangay_name.contains(term.replace("ñ", "n"), autoescape=True),
                func.lower(Report.street_name).contains(term, autoescape=True),
            ]
            if re.fullmatch(r"[0-9]+", term):
                display_id = case(
                    (Report.id < 10, "00" + id_text),
                    (Report.id < 100, "0" + id_text),
                    else_=id_text,
                )
                matches.append(display_id.contains(term))
            base_q = base_q.where(or_(*matches))

    # Total count — runs against base_q WITHOUT limit/offset
    count_q = select(func.count()).select_from(base_q.subquery())
    total: int = (await db.execute(count_q)).scalar_one()

    if sort_by == "priority":
        now = datetime.now(timezone.utc)
        # The first ascending rank is the high-priority group in Manage Reports.
        sort_column = case(
            (or_(Report.ai_severity == SeverityLevel.critical,
                 Report.created_at < now - timedelta(hours=72)), 0),
            (Report.created_at < now - timedelta(hours=24), 1),
            else_=2,
        )
    elif sort_by == "status":
        sort_column = cast(Report.status, String)
    elif sort_by == "severity":
        sort_column = cast(Report.ai_severity, String)
    else:
        sort_column = Report.created_at
    ordering = sort_column.asc() if sort_dir == "asc" else sort_column.desc()

    # Paged data query with eager-loaded relationships
    data_q = (
        base_q
        .order_by(ordering.nulls_last(), Report.id.desc())
        .options(
            selectinload(Report.media_attachments),
            selectinload(Report.ai_detections),
            selectinload(Report.owner),
            selectinload(Report.frame_detections),
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
