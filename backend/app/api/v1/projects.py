
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user, require_admin
from app.models.enums import NotificationType, ProjectStatus, PriorityLevel, ReportStatus, UserRole
from app.models.project import Project
from app.models.report import Report
from app.models.user import User
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

    result = await db.execute(select(Report).where(Report.id == data.report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

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

    project = await _get_project_or_404(db, project_id)
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

    result = await db.execute(select(Report).where(Report.id == project.report_id))
    report = result.scalar_one_or_none()
    if is_completed and report:
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

    project = await _get_project_or_404(db, project_id)

    if current_user.role == UserRole.contractor and project.contractor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not assigned to this project")

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

    result = await db.execute(select(Report).where(Report.id == project.report_id))
    report = result.scalar_one_or_none()
    if is_completed and report:
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

    project = await _get_project_or_404(db, project_id)

    # Validate target user exists and is a contractor
    contractor_result = await db.execute(
        select(User).where(User.id == data.contractor_id)
    )
    contractor = contractor_result.scalar_one_or_none()
    if not contractor:
        raise HTTPException(status_code=404, detail="User not found")
    if contractor.role != UserRole.contractor:
        raise HTTPException(
            status_code=400, detail="Assigned user must have role=contractor"
        )
    # Previously not explicitly rejected — an inactive/suspended contractor
    # could be assigned and would silently never act on it.
    if not contractor.is_active:
        raise HTTPException(
            status_code=400, detail="Cannot assign an inactive contractor."
        )

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

    project = await _get_project_or_404(db, project_id)
    await db.delete(project)
    await db.commit()