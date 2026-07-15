# models/project_update.py

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import ProjectStatus


class ProjectUpdate(Base):
    """
    Tracks every status/progress change made to a Project.
    Gives admins and contractors a full audit trail of project history.
    """
    __tablename__ = "project_updates"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    changed_by_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    old_status = Column(
        SQLEnum(ProjectStatus, name="projectstatus", create_type=False),
        nullable=True,
    )
    new_status = Column(
        SQLEnum(ProjectStatus, name="projectstatus", create_type=False),
        nullable=True,
    )
    completion_percentage = Column(Float, nullable=True)
    note = Column(String, nullable=True)

    # Contractor assignment audit — no FK enforcement so the log survives
    # even if the referenced user is later deleted.
    old_contractor_id = Column(Integer, nullable=True)
    new_contractor_id = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    project = relationship("Project", back_populates="updates")
    changed_by = relationship("User", foreign_keys=[changed_by_id])