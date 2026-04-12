from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime,
    Enum as SQLEnum, Float, ForeignKey, Integer, String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import DamageType, ReportStatus, SeverityLevel


class Report(Base):
    __tablename__ = "reports"

    __table_args__ = (
        # FIX: ai_confidence must be a valid probability [0.0 – 1.0]
        CheckConstraint(
            "ai_confidence IS NULL OR (ai_confidence >= 0.0 AND ai_confidence <= 1.0)",
            name="ck_report_ai_confidence_range",
        ),
        CheckConstraint(
            "fake_confidence >= 0.0 AND fake_confidence <= 1.0",
            name="ck_report_fake_confidence_range",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Location — lat/lon kept for simple use.
    # FIX: for geo radius queries, add a PostGIS `location` column via Alembic:
    #   ALTER TABLE reports ADD COLUMN location geometry(Point, 4326);
    #   UPDATE reports SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326);
    #   CREATE INDEX idx_reports_location ON reports USING GIST(location);
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    barangay = Column(String, nullable=True, index=True)
    street_name = Column(String, nullable=True)

    # Media — single image kept for backward compat; full media via MediaAttachment
    image_url = Column(String, nullable=True)
    description = Column(String, nullable=True)

    # FIX: AI result fields now use Enums — invalid class/severity raises an error
    ai_damage_type = Column(
        SQLEnum(DamageType, name="damagetype", create_type=True),
        nullable=True,
        index=True,
    )
    ai_severity = Column(
        SQLEnum(SeverityLevel, name="severitylevel", create_type=True),
        nullable=True,
        index=True,
    )
    ai_confidence = Column(Float, nullable=True)

    # Fake / Duplicate Detection
    is_flagged_fake = Column(Boolean, default=False)
    fake_confidence = Column(Float, default=0.0)
    is_potential_duplicate = Column(Boolean, default=False)
    duplicate_of_id = Column(
        Integer, ForeignKey("reports.id"), nullable=True
    )

    # FIX: status uses Enum — typos like "PENDNG" now raise an error
    status = Column(
        SQLEnum(ReportStatus, name="reportstatus", create_type=True),
        default=ReportStatus.PENDING,
        nullable=False,
        index=True,
    )
    decline_reason = Column(String, nullable=True)

    # FIX: upvote_count column REMOVED.
    # Rationale: a denormalized integer counter drifts under concurrent
    # requests (race condition). Count upvotes with:
    #   SELECT COUNT(*) FROM report_upvotes WHERE report_id = :id
    # or use a DB view / materialized view for performance at scale.
    view_count = Column(Integer, default=0)

    # Timestamps
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    owner = relationship("User", back_populates="reports")
    project = relationship(
        "Project",
        back_populates="report",
        uselist=False,
        cascade="all, delete-orphan",
    )
    comments = relationship(
        "Comment", back_populates="report", cascade="all, delete-orphan"
    )
    media_attachments = relationship(
        "MediaAttachment",
        back_populates="report",
        cascade="all, delete-orphan",
    )
    ai_detections = relationship(
        "AIDetectionResult",
        back_populates="report",
        cascade="all, delete-orphan",
    )
    upvotes = relationship(
        "ReportUpvote", back_populates="report", cascade="all, delete-orphan"
    )
    notifications = relationship(
        "Notification",
        back_populates="report",
        cascade="all, delete-orphan",
    )
    duplicate_of = relationship(
        "Report",
        remote_side="Report.id",
        foreign_keys=[duplicate_of_id],
    )