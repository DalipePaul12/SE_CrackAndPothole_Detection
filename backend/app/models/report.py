from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime,
    Enum as SQLEnum, Float, ForeignKey, Integer, String, Text, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import DamageType, ReportStatus, ReportType, SeverityLevel


class Report(Base):
    __tablename__ = "reports"

    __table_args__ = (
        CheckConstraint(
            "ai_confidence IS NULL OR (ai_confidence >= 0.0 AND ai_confidence <= 1.0)",
            name="ck_report_ai_confidence_range",
        ),
        CheckConstraint(
            "fake_confidence IS NULL OR (fake_confidence >= 0.0 AND fake_confidence <= 1.0)",
            name="ck_report_fake_confidence_range",
        ),

        # Indexes for performance
        Index("idx_report_status",         "status"),
        Index("idx_report_barangay",        "barangay"),
        Index("idx_report_ai_damage_type",  "ai_damage_type"),
        Index("idx_report_type",            "report_type"),
        Index("idx_report_is_hybrid",       "is_hybrid"),
    )

    id = Column(Integer, primary_key=True, index=True)

    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    latitude   = Column(Float,  nullable=False)
    longitude  = Column(Float,  nullable=False)
    barangay   = Column(String, nullable=True)
    street_name = Column(String, nullable=True)

    # Removed direct dependency on single image — use media_attachments instead
    description = Column(String, nullable=True)

    # ── ML RESULTS (nullable until classification runs) ──────────────────────
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

    # ── AI FAKE DETECTION (derived from media_attachments) ───────────────────
    is_flagged_fake = Column(Boolean, default=False, nullable=False)
    fake_confidence = Column(Float,   nullable=True)

    # ── VIDEO / HYBRID ───────────────────────────────────────────────────────
    report_type = Column(
        SQLEnum(ReportType, name="reporttype", create_type=True),
        default=ReportType.image,
        nullable=False,
    )

    # Relative path to the stored video file (e.g. /uploads/abc123.webm)
    video_path = Column(String, nullable=True)

    # True when both crack AND pothole are detected across video frames
    is_hybrid = Column(Boolean, default=False, nullable=False)

    # The secondary damage type on hybrid reports (e.g. pothole when primary is crack)
    secondary_damage = Column(
        SQLEnum(DamageType, name="damagetype_secondary", create_type=True),
        nullable=True,
    )

    # Human-readable note produced by resolve_hybrid()
    # e.g. "Also detected crack in 4 frame(s) with avg confidence 0.71"
    detection_note = Column(Text, nullable=True)
    # ─────────────────────────────────────────────────────────────────────────

    is_potential_duplicate = Column(Boolean, default=False)

    duplicate_of_id = Column(
        Integer,
        ForeignKey("reports.id"),
        nullable=True,
    )

    status = Column(
        SQLEnum(ReportStatus, name="reportstatus", create_type=True),
        default=ReportStatus.PENDING,
        nullable=False,
        index=True,
    )

    decline_reason = Column(String, nullable=True)
    assigned_to    = Column(String, nullable=True)

    view_count = Column(Integer, default=0)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── RELATIONSHIPS ────────────────────────────────────────────────────────

    owner = relationship("User", back_populates="reports")

    project = relationship(
        "Project",
        back_populates="report",
        uselist=False,
        cascade="all, delete-orphan",
    )

    comments = relationship(
        "Comment",
        back_populates="report",
        cascade="all, delete-orphan",
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
        "ReportUpvote",
        back_populates="report",
        cascade="all, delete-orphan",
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
    frame_detections = relationship(
    "FrameDetection",
    back_populates="report",
    cascade="all, delete-orphan",
)