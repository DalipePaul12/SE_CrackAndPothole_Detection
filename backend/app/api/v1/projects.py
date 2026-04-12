"""
Legacy projects router — kept for reference only.
The production projects flow is in app/routers/projects.py.
This file is NOT registered in main.py.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
# FIXED: removed the duplicate import of get_current_user from app.api.v1.auth.
# That second import was silently overwriting this one, meaning the `is_verified`
# check in auth_middleware.get_current_user was being bypassed.
# Only import from auth_middleware — it is the correct, production-grade version.
from app.middleware.auth_middleware import get_current_user, require_admin
from app.models.enums import ProjectStatus, PriorityLevel, ReportStatus, UserRole
from app.models.project import Project
from app.models.report import Report
from app.models.user import User

router = APIRouter()


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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: Create a repair project linked to a report."""
    if current_user.role != UserRole.admin:
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update project progress and status."""
    if current_user.role not in (UserRole.admin, UserRole.contractor):
        raise HTTPException(status_code=403, detail="Not authorized")

    project = await _get_project_or_404(db, project_id)

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

        result = await db.execute(select(Report).where(Report.id == project.report_id))
        report = result.scalar_one_or_none()
        if report:
            report.status = ReportStatus.RESOLVED

    await db.commit()
    return {"message": "Project updated", "status": project.status.value}


@router.get("/{project_id}")
async def get_project_details(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_project_or_404(db, project_id)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Not authorized")

    project = await _get_project_or_404(db, project_id)
    await db.delete(project)
    await db.commit()