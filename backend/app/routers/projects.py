"""
Projects router — admin/contractor only except GET.
POST   /projects              — create project from a verified report
GET    /projects              — list all projects
GET    /projects/{id}         — get single project with update history
PATCH  /projects/{id}         — update project (status, progress, costs)
DELETE /projects/{id}         — delete project (admin only)
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.middleware.auth_middleware import (
    get_current_user, require_admin, require_admin_or_contractor,
)
from app.models.enums import ProjectStatus  # FIX: import for typed query param
from app.models.project import Project
from app.models.project_update import ProjectUpdate as ProjectUpdateLog
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["Projects"])


async def _get_project_or_404(db: AsyncSession, project_id: int) -> Project:
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.admin),
            selectinload(Project.contractor),
            selectinload(Project.updates).selectinload(ProjectUpdateLog.changed_by),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    from app.models.report import Report
    from app.models.enums import ReportStatus

    result = await db.execute(select(Report).where(Report.id == data.report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    if report.status != ReportStatus.VERIFIED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only VERIFIED reports can be assigned to a project.",
        )

    project = Project(**data.model_dump(exclude={"update_note"}))
    db.add(project)

    report.status = ReportStatus.IN_PROGRESS
    await db.commit()
    await db.refresh(project)
    return await _get_project_or_404(db, project.id)


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    # FIX: typed as ProjectStatus | None instead of str | None.
    # A typo like ?status=IN_PROGRES previously returned all projects silently.
    # Now FastAPI validates and returns 422 for invalid values.
    status: ProjectStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Project).options(
        selectinload(Project.admin),
        selectinload(Project.contractor),
    )
    if status:
        query = query.where(Project.status == status)
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_project_or_404(db, project_id)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_contractor),
):
    project = await _get_project_or_404(db, project_id)
    old_status = project.status

    for field, value in data.model_dump(exclude_unset=True, exclude={"update_note"}).items():
        setattr(project, field, value)

    log = ProjectUpdateLog(
        project_id=project.id,
        changed_by_id=current_user.id,
        old_status=old_status if data.status and data.status != old_status else None,
        new_status=data.status if data.status and data.status != old_status else None,
        completion_percentage=data.completion_percentage,
        note=data.update_note,
    )
    db.add(log)

    if data.status and data.status.value == "COMPLETED":
        from app.models.report import Report
        from app.models.enums import ReportStatus
        result = await db.execute(select(Report).where(Report.id == project.report_id))
        report = result.scalar_one_or_none()
        if report:
            report.status = ReportStatus.RESOLVED

    await db.commit()
    return await _get_project_or_404(db, project_id)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    project = await _get_project_or_404(db, project_id)
    await db.delete(project)
    await db.commit()