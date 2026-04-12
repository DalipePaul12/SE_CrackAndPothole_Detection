from datetime import datetime
from typing import List, Optional

from pydantic import Field, field_validator

from app.models.enums import PriorityLevel, ProjectStatus
from app.schemas.base import AppBaseModel
from app.schemas.user import UserPublic


class ProjectCreate(AppBaseModel):
    report_id: int
    assigned_admin_id: Optional[int] = None
    contractor_id: Optional[int] = None
    priority_level: PriorityLevel = PriorityLevel.LOW
    estimated_cost: Optional[float] = Field(None, ge=0)
    budget_approved: bool = False
    start_date: Optional[datetime] = None
    estimated_completion_date: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("estimated_completion_date")
    @classmethod
    def completion_after_start(cls, v, info) -> Optional[datetime]:
        start = info.data.get("start_date")
        if v and start and v <= start:
            raise ValueError("Estimated completion date must be after start date.")
        return v


class ProjectUpdate(AppBaseModel):
    status: Optional[ProjectStatus] = None
    priority_level: Optional[PriorityLevel] = None
    contractor_id: Optional[int] = None
    estimated_cost: Optional[float] = Field(None, ge=0)
    actual_cost: Optional[float] = Field(None, ge=0)
    budget_approved: Optional[bool] = None
    completion_percentage: Optional[float] = Field(None, ge=0, le=100)
    actual_completion_date: Optional[datetime] = None
    notes: Optional[str] = Field(None, max_length=1000)
    update_note: Optional[str] = Field(None, max_length=500)  # logged to ProjectUpdate


class ProjectUpdateLogResponse(AppBaseModel):
    id: int
    old_status: Optional[ProjectStatus] = None
    new_status: Optional[ProjectStatus] = None
    completion_percentage: Optional[float] = None
    note: Optional[str] = None
    changed_by: Optional[UserPublic] = None
    created_at: datetime


class ProjectResponse(AppBaseModel):
    id: int
    report_id: int
    admin: Optional[UserPublic] = None
    contractor: Optional[UserPublic] = None
    priority_level: PriorityLevel
    status: ProjectStatus
    estimated_cost: Optional[float] = None
    actual_cost: Optional[float] = None
    budget_approved: bool
    start_date: Optional[datetime] = None
    estimated_completion_date: Optional[datetime] = None
    actual_completion_date: Optional[datetime] = None
    completion_percentage: float
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    updates: List[ProjectUpdateLogResponse] = []