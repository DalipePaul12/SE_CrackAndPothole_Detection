
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    Index,
)
from sqlalchemy.ext.hybrid import hybrid_property
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
        CheckConstraint(
            "ai_validation_confidence IS NULL OR "
            "(ai_validation_confidence >= 0.0 AND ai_validation_confidence <= 1.0)",
            name="ck_report_ai_validation_confidence_range",
        ),
        # ── Indexes for performance ───────────────────────────────────────────
        Index("idx_report_status",              "status"),
        Index("idx_report_barangay",            "barangay"),
        Index("idx_report_ai_damage_type",      "ai_damage_type"),
        Index("idx_report_type",                "report_type"),
        Index("idx_report_is_hybrid",           "is_hybrid"),
        Index("idx_report_requires_review",     "requires_admin_review"),
        Index("idx_report_owner_id",            "owner_id"),
    )

    # ── Primary key ───────────────────────────────────────────────────────────
    id = Column(Integer, primary_key=True, index=True)

    # ── Owner (nullable so reports survive user deletion) ─────────────────────
    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Location ──────────────────────────────────────────────────────────────
    latitude    = Column(Float,  nullable=False)
    longitude   = Column(Float,  nullable=False)
    barangay    = Column(String, nullable=True)
    street_name = Column(String, nullable=True)

    description = Column(String, nullable=True)

    # ── ML RESULTS (nullable until classification runs) ───────────────────────
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

    # ── STRUCTURED AI VALIDATION AUDIT ────────────────────────────────────────
    # FIX: These 3 columns were declared in ReportCreate / ReportResponse
    #      but missing from the ORM model → HTTP 500 on every submission.
    ai_validation_status     = Column(String(50),  nullable=True)
    ai_validation_confidence = Column(Float,        nullable=True)
    ai_validation_model      = Column(String(100),  nullable=True)

    # ── CAPTURE METADATA (angle, distance, device info) ───────────────────────
    # FIX: Was in schema but missing from ORM.
    capture_metadata = Column(JSON, nullable=True)

    # ── ADMIN REVIEW FLAGS ────────────────────────────────────────────────────
    # FIX: Was in schema but missing from ORM.
    requires_admin_review = Column(Boolean, default=False, nullable=False)
    review_reason         = Column(String(500), nullable=True)

    # ── LEGAL DISCLAIMER ─────────────────────────────────────────────────────
    # FIX: Was in schema but missing from ORM.
    disclaimer_accepted = Column(Boolean, default=False, nullable=False)

    # ── AI FAKE DETECTION ─────────────────────────────────────────────────────
    is_flagged_fake = Column(Boolean, default=False, nullable=False)
    fake_confidence = Column(Float,   nullable=True)

    # ── VIDEO / HYBRID ────────────────────────────────────────────────────────
    report_type = Column(
        SQLEnum(ReportType, name="reporttype", create_type=True),
        default=ReportType.image,
        nullable=False,
    )

    video_path = Column(String, nullable=True)

    is_hybrid = Column(Boolean, default=False, nullable=False)

    secondary_damage = Column(
        SQLEnum(DamageType, name="damagetype_secondary", create_type=True),
        nullable=True,
    )

    detection_note = Column(Text, nullable=True)

    # ── DUPLICATE DETECTION ───────────────────────────────────────────────────
    is_potential_duplicate = Column(Boolean, default=False)

    duplicate_of_id = Column(
        Integer,
        ForeignKey("reports.id"),
        nullable=True,
    )

    # ── STATUS ────────────────────────────────────────────────────────────────
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

    # ── HYBRID PROPERTY ───────────────────────────────────────────────────────
    # FIX: ReportResponse declared image_url as a plain field but there is no
    #      DB column for it.  Exposing it as a hybrid_property lets Pydantic's
    #      model_validate(report, from_attributes=True) read it safely without
    #      an AttributeError → HTTP 500.
    #
    #      Requires media_attachments to be loaded (selectinload) before access.
    #      _fetch_report_or_404 in reports.py already does this.
    @hybrid_property
    def image_url(self) -> str | None:
        """Return the file_url of the first image-type media attachment."""
        for attachment in self.media_attachments:
            if (
                hasattr(attachment, "media_type")
                and attachment.media_type.value == "image"
            ):
                return attachment.file_url
        return None

    # ── RELATIONSHIPS ─────────────────────────────────────────────────────────

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

    # FIX: indentation was 4 spaces instead of 8 — misaligned with the rest
    #      of the class body.
    frame_detections = relationship(
        "FrameDetection",
        back_populates="report",
        cascade="all, delete-orphan",
    )
from app.models.frame_detection import FrameDetection 