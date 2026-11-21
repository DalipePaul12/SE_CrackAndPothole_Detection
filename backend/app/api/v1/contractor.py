import math
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db
from app.middleware.auth_middleware import require_contractor
from app.models.enums import NotificationType, ProjectStatus, ReportStatus, UserRole
from app.models.project import Project
from app.models.project_update import ProjectUpdate as ProjectUpdateLog
from app.models.repair_review import RepairReview, RepairReviewPhoto
from app.models.report import Report
from app.models.user import User
from app.services import repair_service
from app.services.notification_service import notify

router = APIRouter(prefix="/contractor", tags=["Contractor"])


# ── Serialization helper ───────────────────────────────────────────────────────

def _serialize_project(project: Project) -> dict:
    """Return an enriched project dict with a nested `report` object.

    Requires Project.report and Report.media_attachments to be eagerly loaded
    (e.g. via selectinload) before calling this function.
    """
    report = project.report
    media_attachments = []
    if report and report.media_attachments:
        for att in report.media_attachments:
            media_attachments.append({
                "id": att.id,
                "file_url": att.file_url,
                "file_name": att.file_name,
                "media_type": att.media_type.value if att.media_type else None,
                "attachment_type": att.attachment_type,
                "detections": att.detections,
                "created_at": att.created_at.isoformat() if att.created_at else None,
            })

    report_data = None
    if report:
        report_data = {
            "id": report.id,
            "ai_damage_type": report.ai_damage_type.value if report.ai_damage_type else None,
            "ai_severity": report.ai_severity.value if report.ai_severity else None,
            "ai_confidence": report.ai_confidence,
            "description": report.description,
            "barangay": report.barangay,
            "street_name": report.street_name,
            "exact_address": getattr(report, "exact_address", None),
            "latitude": report.latitude,
            "longitude": report.longitude,
            "media_attachments": media_attachments,
        }

    return {
        "id": project.id,
        "report_id": project.report_id,
        "assigned_admin_id": project.assigned_admin_id,
        "contractor_id": project.contractor_id,
        "status": project.status.value if project.status else None,
        "priority_level": project.priority_level.value if project.priority_level else None,
        "estimated_cost": project.estimated_cost,
        "actual_cost": project.actual_cost,
        "budget_approved": project.budget_approved,
        "start_date": project.start_date.isoformat() if project.start_date else None,
        "estimated_completion_date": (
            project.estimated_completion_date.isoformat()
            if project.estimated_completion_date else None
        ),
        "actual_completion_date": (
            project.actual_completion_date.isoformat()
            if project.actual_completion_date else None
        ),
        "completion_percentage": project.completion_percentage,
        "notes": project.notes,
        "materials_used": project.materials_used,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "report": report_data,
    }


# ── Eager-load options (reused by list + detail endpoints) ────────────────────

_PROJECT_LOAD_OPTIONS = [
    selectinload(Project.report).selectinload(Report.media_attachments)
]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _notify_admin(
    db: AsyncSession,
    project: Project,
    title: str,
    message: str,
    notification_type: NotificationType,
) -> None:
    """Notify assigned_admin_id if set; otherwise notify all admins/superadmins."""
    if project.assigned_admin_id is not None:
        result = await db.execute(
            select(User).where(User.id == project.assigned_admin_id)
        )
        admin = result.scalar_one_or_none()
        if admin:
            await notify(
                db,
                user_id=admin.id,
                title=title,
                message=message,
                type=notification_type,
                report_id=project.report_id,
                email=admin.email,
            )
    else:
        result = await db.execute(
            select(User).where(
                User.role.in_([UserRole.admin, UserRole.superadmin]),
                User.is_active.is_(True),
            )
        )
        admins = result.scalars().all()
        for admin in admins:
            await notify(
                db,
                user_id=admin.id,
                title=title,
                message=message,
                type=notification_type,
                report_id=project.report_id,
                email=admin.email,
            )


# ── Schemas ───────────────────────────────────────────────────────────────────

class DeclineBody(BaseModel):
    reason: str


class RepairMaterial(BaseModel):
    name: str = Field(min_length=1)
    quantity: float = Field(gt=0, allow_inf_nan=False)
    unit_cost: float = Field(ge=0, allow_inf_nan=False)


REPAIR_MATERIALS = TypeAdapter(list[RepairMaterial])


class AvailabilityUpdate(BaseModel):
    is_available: bool


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.patch("/availability")
async def update_availability(
    body: AvailabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_contractor),
):
    """Contractor: toggle availability for new project assignments."""
    current_user.is_available = body.is_available
    await db.commit()
    await db.refresh(current_user)
    return {"is_available": current_user.is_available}


@router.get("/assigned-projects")
async def get_assigned_projects(
    status_filter: Optional[ProjectStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_contractor),
):
    """Contractor: list projects assigned to the current contractor.

    Eagerly loads the linked Report (with ai_damage_type, ai_severity,
    ai_confidence, description, barangay, street_name) and its
    MediaAttachment records — nested under a `report` key in each item.
    """
    query = (
        select(Project)
        .where(Project.contractor_id == current_user.id)
        .options(*_PROJECT_LOAD_OPTIONS)
    )
    if status_filter is not None:
        query = query.where(Project.status == status_filter)
    result = await db.execute(query)
    projects = result.scalars().all()
    return [_serialize_project(p) for p in projects]


@router.get("/projects/{project_id}")
async def get_contractor_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_contractor),
):
    """Contractor: fetch a single enriched project by ID (ownership-checked).

    Returns the same shape as assigned-projects list items — Project fields
    plus a nested `report` object with damage details and media_attachments.
    """
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.contractor_id == current_user.id)
        .options(*_PROJECT_LOAD_OPTIONS)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or not assigned to you.",
        )
    return _serialize_project(project)


@router.post("/projects/{project_id}/accept")
async def accept_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_contractor),
):
    """Contractor: accept an assigned project — sets status to IN_PROGRESS."""
    project, locked_report = await repair_service.lock_project(db, project_id)

    if project.contractor_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this project.",
        )

    if project.status != ProjectStatus.SCHEDULED or locked_report.status in repair_service.CLOSED_REPORT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This project cannot be accepted in its current status.",
        )

    old_status = project.status
    project.status = ProjectStatus.IN_PROGRESS

    # ── Cascade linked report to IN_PROGRESS ──────────────────────────────────
    report_result = await db.execute(
        select(Report).where(Report.id == project.report_id)
    )
    report = report_result.scalar_one_or_none()
    if report:
        report.status = ReportStatus.IN_PROGRESS

    log = ProjectUpdateLog(
        project_id=project.id,
        changed_by_id=current_user.id,
        old_status=old_status,
        new_status=ProjectStatus.IN_PROGRESS,
        note="Contractor accepted the project",
    )
    db.add(log)
    await db.commit()
    await db.refresh(project)

    await _notify_admin(
        db,
        project,
        title=f"Project #{project.id} accepted",
        message=f"Contractor {current_user.full_name or current_user.email} has accepted project #{project.id}.",
        notification_type=NotificationType.info,
    )

    return project


@router.post("/projects/{project_id}/decline")
async def decline_project(
    project_id: int,
    body: DeclineBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_contractor),
):
    """Contractor: decline an assigned project — clears contractor_id and resets status to SCHEDULED."""
    project, locked_report = await repair_service.lock_project(db, project_id)

    if project.contractor_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this project.",
        )

    if project.status != ProjectStatus.SCHEDULED or locked_report.status in repair_service.CLOSED_REPORT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This project cannot be declined in its current status.",
        )

    old_status = project.status
    old_contractor_id = project.contractor_id

    project.contractor_id = None
    project.status = ProjectStatus.SCHEDULED

    log = ProjectUpdateLog(
        project_id=project.id,
        changed_by_id=current_user.id,
        old_status=old_status,
        new_status=ProjectStatus.SCHEDULED,
        old_contractor_id=old_contractor_id,
        new_contractor_id=None,
        note=f"Contractor declined: {body.reason}",
    )
    db.add(log)
    await db.commit()
    await db.refresh(project)

    await _notify_admin(
        db,
        project,
        title=f"Project #{project.id} declined",
        message=(
            f"Contractor {current_user.full_name or current_user.email} "
            f"declined project #{project.id}. Reason: {body.reason}"
        ),
        notification_type=NotificationType.warning,
    )

    return project


@router.post("/projects/{project_id}/complete")
async def complete_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    notes: Optional[str] = Form(None),
    materials: Optional[str] = Form(None),
    actual_cost: Optional[float] = Form(None),
    photos: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_contractor),
):
    """Submit an assigned repair for admin review."""
    if not notes or not notes.strip():
        raise HTTPException(422, "Completion notes are required.")
    if not photos:
        raise HTTPException(422, "At least one proof photo is required.")
    if actual_cost is not None and (not math.isfinite(actual_cost) or actual_cost < 0):
        raise HTTPException(422, "Actual cost must be a finite, non-negative amount.")
    try:
        parsed_materials = (
            [item.model_dump() for item in REPAIR_MATERIALS.validate_json(materials)]
            if materials is not None else None
        )
    except ValidationError as exc:
        raise HTTPException(422, "Enter a name, positive quantity, and non-negative unit cost for each material.") from exc

    project, report = await repair_service.lock_project(db, project_id)
    if project.contractor_id != current_user.id:
        raise HTTPException(403, "You are not assigned to this project.")
    if project.status != ProjectStatus.IN_PROGRESS or report.status != ReportStatus.IN_PROGRESS:
        raise HTTPException(409, "This repair is no longer in progress.")
    previous = await db.scalar(repair_service.latest_review(project_id))
    if previous and previous.status == repair_service.PENDING_REVIEW:
        raise HTTPException(409, "Repair proof is already awaiting review.")

    remaining = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    proof_photos = []
    for photo in photos:
        contents, content_type = await repair_service.read_proof(photo, remaining)
        remaining -= len(contents)
        proof_photos.append(RepairReviewPhoto(content=contents, content_type=content_type))

    review = RepairReview(
        project_id=project.id, contractor_id=current_user.id, status=repair_service.PENDING_REVIEW,
        notes=notes.strip(), materials=parsed_materials, actual_cost=actual_cost, photos=proof_photos,
    )
    db.add(review)
    admin_ids = await db.scalars(select(User.id).where(
        User.role.in_([UserRole.admin, UserRole.superadmin]), User.is_active.is_(True),
    ))
    recipients = list(admin_ids)
    if project.assigned_admin_id in recipients:
        recipients = [project.assigned_admin_id]
    for user_id in recipients:
        repair_service.add_notification(
            db, background_tasks, user_id, report.id, "Repair proof ready for review",
            f"Review the repair photos for report #{report.id}.", NotificationType.info,
        )
    await db.flush()
    attempt_id = review.id
    await db.commit()
    return {"id": attempt_id, "status": repair_service.PENDING_REVIEW}
