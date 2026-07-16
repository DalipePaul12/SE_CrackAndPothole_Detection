from uuid import uuid4

from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SQLEnum,
    Float, Integer, String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import UserRole


class User(Base):
    __tablename__ = "users"

    # FIX: Integer PK kept for internal joins (performance), but
    # public_id (UUID) is what gets exposed in every API response.
    # Never return `id` to the client — always use `public_id`.
    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(
        UUID(as_uuid=True),
        default=uuid4,
        unique=True,
        nullable=False,
        index=True,
    )

    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, index=True)
    contact_number = Column(String, nullable=True)
    profile_picture_url = Column(String, nullable=True)

    # Location
    country = Column(String, default="Philippines")
    city = Column(String, nullable=True)
    barangay = Column(String, nullable=True)
    street = Column(String, nullable=True)

    # FIX: role uses Enum — invalid values now raise a DB/ORM error
    role = Column(
        SQLEnum(UserRole, name="userrole", create_type=True),
        default=UserRole.citizen,
        nullable=False,
    )

    reputation_score = Column(Float, default=100.0)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    # Contractor availability flag — True = accepting new projects.
    # Nullable so existing rows are unaffected until explicitly set;
    # treat NULL as available (same as True) in application logic.
    is_available = Column(Boolean, nullable=True, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    # FIX: RA 10173 (Philippine Data Privacy Act) — right to erasure.
    # When set, a background job should anonymise PII and set is_active=False.
    deletion_requested_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    reports = relationship("Report", back_populates="owner")
    comments = relationship("Comment", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")
    refresh_tokens = relationship("RefreshToken", back_populates="user")
    upvotes = relationship("ReportUpvote", back_populates="user")
    assigned_projects = relationship(
        "Project",
        back_populates="contractor",
        foreign_keys="Project.contractor_id",
    )
    managed_projects = relationship(
        "Project",
        back_populates="admin",
        foreign_keys="Project.assigned_admin_id",
    )