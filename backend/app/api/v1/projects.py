
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, undefer

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user, require_admin
from app.models.enums import NotificationType, ProjectStatus, PriorityLevel, ReportStatus, UserRole
from app.models.project import Project
from app.models.project_update import ProjectUpdate as ProjectUpdateLog
from app.models.repair_review import RepairReview, RepairReviewPhoto
from app.models.report import Report
from app.models.user import User
from app.services import repair_service
from app.services.notification_service import notify_background

router = APIRouter(prefix="/projects", tags=["Projects"])

# --- SCHEMAS ---
class ProjectCreate(BaseModel):
    report_id: int
    priority: PriorityLevel = PriorityLevel.LOW
    contractor_id: Optional[int] = None
    estimated_cost: Optional[float] = None
    start_date: Optional[datetime] = None


class ProjectUpdate(BaseModel):
    status: Optional[ProjectStatus] = None
    completion_percentage: Optional[float] = None


class ContractorAssign(BaseModel):
    contractor_id: int


class RepairDecision(BaseModel):
    decision: Literal["approve", "request_retake", "withdraw_and_reassign"]
    reason: str | None = Field(None, max_length=2000)
    contractor_id: int | None = Field(None, gt=0)


async def _get_active_contractor(db: AsyncSession, contractor_id: int) -> User:
    contractor = await db.get(User, contractor_id)
    if contractor is None:
        raise HTTPException(404, "User not found")
    if contractor.role != UserRole.contractor:
        raise HTTPException(400, "Assigned user must have role=contractor")
    if not contractor.is_active:
        raise HTTPException(400, "Cannot assign an inactive contractor.")
    return contractor


async def repair_review_access(db, project_id, user):
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    if user.role not in (UserRole.admin, UserRole.superadmin) and (
        user.role != UserRole.contractor or project.contractor_id != user.id
    ):
        raise HTTPException(403, "Not authorized to view repair proof.")
    return project


@router.get("/{project_id}/repair-review")
async def get_repair_review(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = await repair_review_access(db, project_id, current_user)
    query = repair_service.latest_review(project_id).options(selectinload(RepairReview.photos))
    review = await db.scalar(query)
    if review is None or (current_user.role == UserRole.contractor and review.contractor_id != current_user.id):
        return None
    return {
        "id": review.id, "status": review.status, "reason": review.reason,
        "notes": review.notes, "materials": review.materials, "actual_cost": review.actual_cost,
        "created_at": review.created_at, "decided_at": review.decided_at,
        "photo_ids": [photo.id for photo in review.photos],
        "contractor_id": project.contractor_id,
        "can_approve_or_retake": project.contractor_id is not None and project.contractor_id == review.contractor_id,
    }


@router.get("/{project_id}/repair-review/history")
async def get_repair_review_history(
    project_id: int,
    before_id: int | None = Query(None, gt=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    await repair_review_access(db, project_id, current_user)
    page_size = 10
    latest_id = repair_service.latest_review(project_id).with_only_columns(RepairReview.id).scalar_subquery()
    query = (select(RepairReview).where(RepairReview.project_id == project_id, RepairReview.id < latest_id)
             .options(selectinload(RepairReview.photos)).order_by(RepairReview.id.desc()).limit(page_size + 1))
    if before_id is not None:
        query = query.where(RepairReview.id < before_id)
    rows = (await db.scalars(query)).all()
    return {
        "attempts": [
            {"id": row.id, "status": row.status, "reason": row.reason,
             "created_at": row.created_at, "decided_at": row.decided_at,
             "photo_ids": [photo.id for photo in row.photos]}
            for row in rows[:page_size]
        ],
        "next_before_id": rows[page_size - 1].id if len(rows) > page_size else None,
    }


@router.get("/{project_id}/repair-review/{attempt_id}/photos/{photo_id}")
async def get_repair_review_photo(
    project_id: int,
    attempt_id: int,
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await repair_review_access(db, project_id, current_user)
    query = (select(RepairReviewPhoto).join(RepairReview)
             .where(RepairReview.project_id == project_id, RepairReview.id == attempt_id,
                    RepairReviewPhoto.id == photo_id).options(undefer(RepairReviewPhoto.content)))
    if current_user.role == UserRole.contractor:
        query = query.where(RepairReview.contractor_id == current_user.id)
    photo = await db.scalar(query)
    if photo is None:
        raise HTTPException(404, "Repair photo not found")
    return Response(photo.content, media_type=photo.content_type, headers={"Cache-Control": "private, no-store"})


@router.post("/{project_id}/repair-review/{attempt_id}/decision")
async def decide_repair_review(
    project_id: int,
    attempt_id: int,
    data: RepairDecision,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    reason = (data.reason or "").strip()
    withdrawing = data.decision == "withdraw_and_reassign"
    if data.decision == "request_retake" and not reason:
        raise HTTPException(422, "Enter a reason for requesting a retake.")
    if withdrawing and (not reason or data.contractor_id is None):
        raise HTTPException(422, "Enter a withdrawal reason and choose a replacement contractor.")
    project, report = await repair_service.lock_project(db, project_id)
    review = await db.scalar(repair_service.latest_review(project_id))
    if (
        review is None or review.id != attempt_id or review.status != repair_service.PENDING_REVIEW
        or project.status != ProjectStatus.IN_PROGRESS or report.status != ReportStatus.IN_PROGRESS
    ):
        raise HTTPException(409, "This submission is no longer awaiting review. Refresh to see the latest status.")
    if not withdrawing and (project.contractor_id is None or project.contractor_id != review.contractor_id):
        raise HTTPException(409, "The original assignment is gone. Withdraw and reassign this review.")

    paths = []
    old_status = project.status
    assignment_audit = {}
    if withdrawing:
        if data.contractor_id in (project.contractor_id, review.contractor_id):
            raise HTTPException(422, "Choose a different contractor.")
        replacement = await _get_active_contractor(db, data.contractor_id)
        assignment_audit = {"old_contractor_id": project.contractor_id, "new_contractor_id": replacement.id}
        project.contractor_id = replacement.id
        project.status = ProjectStatus.SCHEDULED
        project.completion_percentage = 0
        report.assigned_to = None
        review.status = repair_service.WITHDRAWN
        review.reason = reason
        audit_note = f"Withdrew repair proof attempt #{review.id} and reassigned the project. {reason}"
        repair_service.add_notification(
            db, background_tasks, replacement.id, report.id, "You have been assigned to a project",
            f"Accept project #{project.id} to continue the repair.", NotificationType.info,
        )
    elif data.decision == "approve":
        photos = await db.execute(
            select(RepairReviewPhoto.content, RepairReviewPhoto.content_type)
            .where(RepairReviewPhoto.review_id == review.id).order_by(RepairReviewPhoto.id)
        )
        paths = await repair_service.publish_proof(db, report.id, photos)
        review.status = repair_service.APPROVED
        project.status = ProjectStatus.COMPLETED
        project.completion_percentage = 100
        project.actual_completion_date = datetime.now(timezone.utc)
        project.notes = review.notes
        project.materials_used = review.materials
        project.actual_cost = review.actual_cost
        report.status = ReportStatus.RESOLVED
        repair_service.add_notification(
            db, background_tasks, report.owner_id, report.id, "Your report has been resolved",
            f"The repair for report #{report.id} has been approved.", NotificationType.success,
        )
        audit_note = "Approved contractor repair proof."
    else:
        review.status = repair_service.RETAKE_REQUESTED
        review.reason = reason
        repair_service.add_notification(
            db, background_tasks, project.contractor_id, report.id, "Repair photo retake requested", reason, NotificationType.warning,
        )
        audit_note = f"Requested a repair proof retake. {reason}"

    review.reviewer_id = current_user.id
    review.decided_at = datetime.now(timezone.utc)
    db.add(ProjectUpdateLog(project_id=project.id, changed_by_id=current_user.id,
                            old_status=old_status, new_status=project.status,
                            completion_percentage=project.completion_percentage, note=audit_note,
                            **assignment_audit))
    result = {"id": review.id, "status": review.status}
    await repair_service.commit_with_proof(db, paths)
    return result


# --- HELPERS ---
async def _get_project_or_404(db: AsyncSession, project_id: int) -> Project:
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.report), selectinload(Project.contractor))
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# --- ENDPOINTS ---
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin/superadmin: Create a repair project linked to a report."""
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Not authorized")

    report = await repair_service.lock_report(db, data.report_id)
    if report.status in repair_service.CLOSED_REPORT_STATUSES:
        raise HTTPException(409, "This report is closed.")

    existing = await db.execute(select(Project).where(Project.report_id == data.report_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Project already exists for this report")

    new_project = Project(
        report_id=data.report_id,
        priority_level=data.priority,
        contractor_id=data.contractor_id,
        estimated_cost=data.estimated_cost,
        start_date=data.start_date,
        status=ProjectStatus.SCHEDULED,
        completion_percentage=0.0,
    )

    report.status = ReportStatus.IN_PROGRESS
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)

    # Previously: creating a project (even with a contractor pre-assigned)
    # sent zero notifications. A contractor could be assigned at creation
    # time and never find out except by refreshing their dashboard.
    if new_project.contractor_id:
        contractor_email_result = await db.execute(
            select(User.email).where(User.id == new_project.contractor_id)
        )
        background_tasks.add_task(
            notify_background,
            user_id=new_project.contractor_id,
            title="New Project Assignment",
            message=f"You have been assigned to project #{new_project.id} for report #{report.id}.",
            type=NotificationType.info,
            report_id=report.id,
            email=contractor_email_result.scalar_one_or_none(),
        )

    if report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Moved to a Project",
            message=f"Your report #{report.id} now has an active repair project.",
            type=NotificationType.info,
            report_id=report.id,
        )

    return await _get_project_or_404(db, new_project.id)


@router.get("/")
async def get_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all projects with report and contractor details."""
    result = await db.execute(
        select(Project).options(
            selectinload(Project.report),
            selectinload(Project.contractor),
        )
    )
    return result.scalars().all()


@router.put("/{project_id}/status")
async def update_project_status(
    project_id: int,
    data: ProjectUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update project progress and status."""
    if current_user.role not in (UserRole.admin, UserRole.superadmin, UserRole.contractor):
        raise HTTPException(status_code=403, detail="Not authorized")

    project, report = await repair_service.lock_project(db, project_id)

    if current_user.role == UserRole.contractor and project.contractor_id != current_user.id:
        raise HTTPException(403, "Not assigned to this project")
    if data.status == ProjectStatus.COMPLETED or data.completion_percentage == 100.0:
        if current_user.role == UserRole.contractor:
            raise HTTPException(403, "Submit repair proof for admin review.")
        await repair_service.require_unassigned(db, report)
    if data.status is not None and data.status != project.status:
        await repair_service.require_no_pending_review(db, project.id)
    old_status = project.status
    status_changed = data.status is not None and data.status != old_status

    if data.status is not None:
        project.status = data.status
    if data.completion_percentage is not None:
        project.completion_percentage = data.completion_percentage

    # Auto-complete when 100% or explicitly COMPLETED
    is_completed = (
        data.status == ProjectStatus.COMPLETED
        or data.completion_percentage == 100.0
    )
    if is_completed:
        project.status = ProjectStatus.COMPLETED
        project.completion_percentage = 100.0
        project.actual_completion_date = datetime.now(timezone.utc)
        status_changed = status_changed or (old_status != ProjectStatus.COMPLETED)

    if is_completed:
        report.status = ReportStatus.RESOLVED

    await db.commit()

    # Previously: status/progress updates through this endpoint sent zero
    # notifications — a contractor's own progress update, or an admin
    # pushing a project forward, never told the report owner anything moved.
    if status_changed:
        if project.contractor_id and current_user.id != project.contractor_id:
            background_tasks.add_task(
                notify_background,
                user_id=project.contractor_id,
                title="Project Status Updated",
                message=f"Project #{project.id} status changed to {project.status.value}.",
                type=NotificationType.info,
                report_id=project.report_id,
            )
        if report and report.owner_id:
            background_tasks.add_task(
                notify_background,
                user_id=report.owner_id,
                title="Report Status Updated",
                message=f"Your report #{report.id} status is now {report.status.value}.",
                type=NotificationType.info,
                report_id=report.id,
            )

    return {"message": "Project updated", "status": project.status.value}


@router.get("/available-contractors")
async def get_available_contractors(
    is_available: bool | None = Query(None, description="Filter by contractor availability. Omit to return all contractors."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin/superadmin: list all contractors with their active project count.

    Optional ?is_available=true/false filter.  NULL is_available is treated as
    available (true) — matching existing rows created before the column existed.
    """
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Not authorized")

    active_count_sq = (
        select(func.count(Project.id))
        .where(Project.contractor_id == User.id)
        .where(
            Project.status.notin_(
                [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED]
            )
        )
        .correlate(User)
        .scalar_subquery()
    )

    query = (
        select(User, active_count_sq.label("active_project_count"))
        .where(User.role == UserRole.contractor)
    )

    if is_available is True:
        # NULL treated as available
        query = query.where(
            (User.is_available == True) | (User.is_available.is_(None))
        )
    elif is_available is False:
        query = query.where(User.is_available == False)
    # is_available is None → no filter; return all contractors

    query = query.order_by(User.full_name)
    result = await db.execute(query)

    rows = result.all()
    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "active_project_count": count,
            # Expose the flag; normalise NULL → True for API consumers
            "is_available": user.is_available if user.is_available is not None else True,
        }
        for user, count in rows
    ]


@router.get("/{project_id}")
async def get_project_details(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_project_or_404(db, project_id)


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update project status and/or completion percentage."""
    if current_user.role not in (UserRole.admin, UserRole.superadmin, UserRole.contractor):
        raise HTTPException(status_code=403, detail="Not authorized")

    project, report = await repair_service.lock_project(db, project_id)

    if current_user.role == UserRole.contractor and project.contractor_id != current_user.id:
        raise HTTPException(403, "Not assigned to this project")
    if data.status == ProjectStatus.COMPLETED or data.completion_percentage == 100.0:
        if current_user.role == UserRole.contractor:
            raise HTTPException(403, "Submit repair proof for admin review.")
        await repair_service.require_unassigned(db, report)
    if data.status is not None and data.status != project.status:
        await repair_service.require_no_pending_review(db, project.id)

    old_status = project.status
    status_changed = data.status is not None and data.status != old_status

    if data.status is not None:
        project.status = data.status
    if data.completion_percentage is not None:
        project.completion_percentage = data.completion_percentage

    # Auto-complete when 100% or explicitly COMPLETED
    is_completed = (
        data.status == ProjectStatus.COMPLETED
        or data.completion_percentage == 100.0
    )
    if is_completed:
        project.status = ProjectStatus.COMPLETED
        project.completion_percentage = 100.0
        project.actual_completion_date = datetime.now(timezone.utc)
        status_changed = status_changed or (old_status != ProjectStatus.COMPLETED)

    if is_completed:
        report.status = ReportStatus.RESOLVED

    await db.commit()

    # Same duplicate-endpoint issue as /status above — this PUT route does
    # the same job under a slightly different path, so it needs the same fix.
    if status_changed:
        if project.contractor_id and current_user.id != project.contractor_id:
            background_tasks.add_task(
                notify_background,
                user_id=project.contractor_id,
                title="Project Status Updated",
                message=f"Project #{project.id} status changed to {project.status.value}.",
                type=NotificationType.info,
                report_id=project.report_id,
            )
        if report and report.owner_id:
            background_tasks.add_task(
                notify_background,
                user_id=report.owner_id,
                title="Report Status Updated",
                message=f"Your report #{report.id} status is now {report.status.value}.",
                type=NotificationType.info,
                report_id=report.id,
            )

    return await _get_project_or_404(db, project_id)


@router.patch("/{project_id}/assign")
async def assign_contractor(
    project_id: int,
    data: ContractorAssign,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin/superadmin: assign a contractor to a project."""
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Not authorized")

    project, report = await repair_service.lock_project(db, project_id)

    if report.status in repair_service.CLOSED_REPORT_STATUSES or project.status in (ProjectStatus.COMPLETED, ProjectStatus.CANCELLED):
        raise HTTPException(409, "This repair is closed.")
    await repair_service.require_no_pending_review(db, project.id)

    # Validate target user exists and is a contractor
    contractor = await _get_active_contractor(db, data.contractor_id)

    old_contractor_id = project.contractor_id
    project.contractor_id = data.contractor_id

    from app.models.project_update import ProjectUpdate as ProjectUpdateLog
    log = ProjectUpdateLog(
        project_id=project.id,
        changed_by_id=current_user.id,
        old_contractor_id=old_contractor_id,
        new_contractor_id=data.contractor_id,
        note=f"Contractor assigned: {contractor.full_name or contractor.email}",
    )
    db.add(log)
    await db.commit()

    # Notify the new contractor
    from app.services.notification_service import notify
    await notify(
        db,
        user_id=contractor.id,
        title="You have been assigned to a project",
        message=f"You have been assigned to project #{project.id}.",
        type=NotificationType.info,
        report_id=project.report_id,
        email=contractor.email,
    )

    # Previously: reassignment only ever told the new contractor. The old
    # contractor found out they'd lost a project only by noticing it vanish
    # from their dashboard, and the report owner never learned who was
    # actually working on their report.
    if old_contractor_id and old_contractor_id != data.contractor_id:
        prev_email_result = await db.execute(
            select(User.email).where(User.id == old_contractor_id)
        )
        background_tasks.add_task(
            notify_background,
            user_id=old_contractor_id,
            title="Removed from Project",
            message=f"You have been removed from project #{project.id}.",
            type=NotificationType.warning,
            report_id=project.report_id,
            email=prev_email_result.scalar_one_or_none(),
        )

    report_result = await db.execute(select(Report).where(Report.id == project.report_id))
    report = report_result.scalar_one_or_none()
    if report and report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Contractor Assigned",
            message=f"{contractor.full_name or contractor.email} has been assigned to repair your report #{report.id}.",
            type=NotificationType.info,
            report_id=report.id,
        )

    return await _get_project_or_404(db, project_id)

@router.get("/{project_id}/completion")
async def get_project_completion(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return completion details for a project.
    Accessible by: the report submitter, the assigned contractor, or any admin/superadmin.
    """
    from app.models.media_attachment import MediaAttachment
    from app.models.report import Report

    project = await _get_project_or_404(db, project_id)

    is_admin = current_user.role in (UserRole.admin, UserRole.superadmin)
    is_contractor = (
        current_user.role == UserRole.contractor
        and project.contractor_id == current_user.id
    )

    # Check if the caller is the report submitter
    is_submitter = False
    if not is_admin and not is_contractor:
        report_result = await db.execute(
            select(Report).where(Report.id == project.report_id)
        )
        report = report_result.scalar_one_or_none()
        if report and report.owner_id == current_user.id:
            is_submitter = True

    if not (is_admin or is_contractor or is_submitter):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Fetch completion-proof photos
    photos_result = await db.execute(
        select(MediaAttachment).where(
            MediaAttachment.report_id == project.report_id,
            MediaAttachment.attachment_type == "completion_proof",
        )
    )
    completion_photos = photos_result.scalars().all()

    return {
        "project_id": project.id,
        "status": project.status,
        "notes": project.notes,
        "materials_used": project.materials_used,
        "actual_cost": project.actual_cost,
        "completion_percentage": project.completion_percentage,
        "completed_at": project.actual_completion_date,
        "completion_photos": [
            {
                "id": p.id,
                "file_url": p.file_url,
                "file_name": p.file_name,
                "file_size_bytes": p.file_size_bytes,
                "created_at": p.created_at,
            }
            for p in completion_photos
        ],
    }


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Not authorized")

    project, _ = await repair_service.lock_project(db, project_id)
    await repair_service.require_no_pending_review(db, project.id)
    await db.delete(project)
    await db.commit()
