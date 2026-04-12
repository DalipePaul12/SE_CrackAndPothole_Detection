from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime,
    Enum as SQLEnum, Float, ForeignKey, Integer, String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import PriorityLevel, ProjectStatus


class Project(Base):
    __tablename__ = "projects"

    __table_args__ = (
        CheckConstraint(
            "completion_percentage >= 0 AND completion_percentage <= 100",
            name="ck_project_completion_range",
        ),
        CheckConstraint(
            "estimated_cost IS NULL OR estimated_cost >= 0",
            name="ck_project_estimated_cost_positive",
        ),
        CheckConstraint(
            "actual_cost IS NULL OR actual_cost >= 0",
            name="ck_project_actual_cost_positive",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(
        Integer,
        ForeignKey("reports.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    assigned_admin_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    contractor_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    priority_level = Column(
        SQLEnum(PriorityLevel, name="prioritylevel", create_type=True),
        default=PriorityLevel.LOW,
        nullable=False,
        index=True,
    )

    status = Column(
        SQLEnum(ProjectStatus, name="projectstatus", create_type=True),
        default=ProjectStatus.SCHEDULED,
        nullable=False,
        index=True,
    )

    estimated_cost = Column(Float, nullable=True)
    actual_cost = Column(Float, nullable=True)
    budget_approved = Column(Boolean, default=False)

    start_date = Column(DateTime(timezone=True), nullable=True)
    estimated_completion_date = Column(DateTime(timezone=True), nullable=True)
    actual_completion_date = Column(DateTime(timezone=True), nullable=True)

    completion_percentage = Column(Float, default=0.0, nullable=False)
    notes = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    report = relationship("Report", back_populates="project")
    admin = relationship(
        "User",
        back_populates="managed_projects",
        foreign_keys=[assigned_admin_id],
    )
    contractor = relationship(
        "User",
        back_populates="assigned_projects",
        foreign_keys=[contractor_id],
    )
    updates = relationship(
        "ProjectUpdate", back_populates="project", cascade="all, delete-orphan"
    )