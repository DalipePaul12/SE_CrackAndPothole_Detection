from datetime import datetime
from typing import Optional

from app.models.enums import ProjectStatus
from app.schemas.base import AppBaseModel
from app.schemas.user import UserPublic


class ProjectUpdateCreate(AppBaseModel):
    """Used internally by routers when a project status/progress changes."""
    old_status: Optional[ProjectStatus] = None
    new_status: Optional[ProjectStatus] = None
    completion_percentage: Optional[float] = None
    note: Optional[str] = None


class ProjectUpdateResponse(AppBaseModel):
    id: int
    project_id: int
    old_status: Optional[ProjectStatus] = None
    new_status: Optional[ProjectStatus] = None
    completion_percentage: Optional[float] = None
    note: Optional[str] = None
    changed_by: Optional[UserPublic] = None
    created_at: datetime