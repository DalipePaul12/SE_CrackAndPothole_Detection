import io
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.supabase_storage import upload_report_file

from app.core.config import settings
from app.db.session import get_db
from app.middleware.auth_middleware import require_contractor
from app.models.enums import MediaType, NotificationType, ProjectStatus, ReportStatus, UserRole
from app.models.media_attachment import MediaAttachment
from app.models.project import Project
from app.models.project_update import ProjectUpdate as ProjectUpdateLog
from app.models.report import Report
from app.models.user import User
from app.services.notification_service import notify
from app.utils.image_validator import validate_image_bytes

UPLOAD_ROOT = Path(settings.UPLOAD_DIR)

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

async def _get_project_or_404(db: AsyncSession, project_id: int) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


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
    project = await _get_project_or_404(db, project_id)

    if project.contractor_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this project.",
        )

    if project.status != ProjectStatus.SCHEDULED:
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
    project = await _get_project_or_404(db, project_id)

    if project.contractor_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this project.",
        )

    if project.status != ProjectStatus.SCHEDULED:
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
    notes: Optional[str] = Form(None),
    materials: Optional[str] = Form(None),
    actual_cost: Optional[float] = Form(None),
    photos: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_contractor),
):
    """Contractor: mark a project complete with proof photos, materials, and cost."""
    project = await _get_project_or_404(db, project_id)

    if project.contractor_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this project.",
        )

    if project.status != ProjectStatus.IN_PROGRESS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This project cannot be completed in its current status.",
        )

    from sqlalchemy import select as _select
    locked_result = await db.execute(
        _select(Project).where(Project.id == project_id).with_for_update()
    )
    project = locked_result.scalar_one_or_none()
    if project is None or project.status != ProjectStatus.IN_PROGRESS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This project cannot be completed in its current status.",
        )

    if not notes or not notes.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completion notes are required.",
        )

    if not photos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one proof photo is required.",
        )

    # ── Parse materials JSON ──────────────────────────────────────────────────
    parsed_materials = None
    if materials is not None:
        try:
            parsed_materials = json.loads(materials)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="materials must be a valid JSON string.",
            )


    saved_attachments: list[MediaAttachment] = []
    for photo in photos:
        data = await photo.read()

        ok, err = validate_image_bytes(data)
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid photo '{photo.filename}': {err}",
            )

        ext = Path(photo.filename or "photo").suffix.lower() or ".jpg"
        safe_name = f"{uuid.uuid4().hex}{ext}"

        storage_subpath = f"{project.report_id}/completion_{safe_name}"
        file_url = upload_report_file(
            file_bytes=data,
            storage_path=storage_subpath,
            content_type="image/jpeg",  # or detect properly like Doc 14 does
        )
        attachment = MediaAttachment(
            report_id=project.report_id,
            file_url=file_url,
            file_name=safe_name,
            file_size_bytes=len(data),
            media_type=MediaType.image,
            attachment_type="completion_proof",
            is_processed=False,
        )
        db.add(attachment)
        saved_attachments.append(attachment)

    # ── Update project ────────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    old_status = project.status

    project.status = ProjectStatus.COMPLETED
    project.completion_percentage = 100.0
    project.actual_completion_date = now
    if notes is not None:
        project.notes = notes
    if parsed_materials is not None:
        project.materials_used = parsed_materials
    if actual_cost is not None:
        project.actual_cost = actual_cost

    # ── Cascade linked report to RESOLVED ─────────────────────────────────────
    report_result = await db.execute(
        select(Report).where(Report.id == project.report_id)
    )
    report = report_result.scalar_one_or_none()
    if report:
        report.status = ReportStatus.RESOLVED

    # ── Audit log ─────────────────────────────────────────────────────────────
    log = ProjectUpdateLog(
        project_id=project.id,
        changed_by_id=current_user.id,
        old_status=old_status,
        new_status=ProjectStatus.COMPLETED,
        completion_percentage=100.0,
        note="Contractor marked project as complete.",
    )
    db.add(log)
    await db.commit()
    await db.refresh(project)

    # ── Notify admin (best-effort — never fail the response) ─────────────────
    try:
        await _notify_admin(
            db,
            project,
            title=f"Project #{project.id} completed",
            message=(
                f"Contractor {current_user.full_name or current_user.email} "
                f"has marked project #{project.id} as complete."
            ),
            notification_type=NotificationType.success,
        )
    except Exception:
        logger.warning("Failed to notify admin for project %s completion.", project.id, exc_info=True)

    # ── Notify report submitter (best-effort) ─────────────────────────────────
    try:
        if report and report.owner_id:
            owner_result = await db.execute(
                select(User).where(User.id == report.owner_id)
            )
            owner = owner_result.scalar_one_or_none()
            if owner:
                await notify(
                    db,
                    user_id=owner.id,
                    title="Your report has been resolved",
                    message=(
                        f"The road damage you reported (Report #{report.id}) "
                        f"has been repaired and marked complete."
                    ),
                    type=NotificationType.success,
                    report_id=report.id,
                    email=owner.email,
                )
    except Exception:
        logger.warning("Failed to notify owner for project %s completion.", project.id, exc_info=True)

    return project
