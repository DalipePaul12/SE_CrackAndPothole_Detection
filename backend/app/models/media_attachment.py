from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime,
    Enum as SQLEnum, Float, ForeignKey, Integer, String, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from enum import Enum

from app.db.base import Base
from app.models.enums import MediaType


class ProcessingStatus(str, Enum):
    UPLOADED = "uploaded"
    VALIDATING_AI = "validating_ai"
    AI_CHECKED = "ai_checked"
    CLASSIFIED = "classified"
    FAILED = "failed"


class MediaAttachment(Base):
    __tablename__ = "media_attachments"

    __table_args__ = (
        CheckConstraint(
            "file_size_bytes IS NULL OR file_size_bytes > 0",
            name="ck_media_file_size_positive",
        ),
        CheckConstraint(
            "ai_generated_confidence IS NULL OR (ai_generated_confidence >= 0.0 AND ai_generated_confidence <= 1.0)",
            name="ck_media_ai_confidence_range",
        ),
        Index("idx_media_report_id", "report_id"),
        Index("idx_media_ai_generated", "is_ai_generated"),
        Index("idx_media_processing_status", "processing_status"),
    )

    id = Column(Integer, primary_key=True, index=True)

    report_id = Column(
        Integer,
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    file_url = Column(String, nullable=False)
    file_name = Column(String, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)

    media_type = Column(
        SQLEnum(MediaType, name="mediatype", create_type=True),
        nullable=False,
    )

    is_ai_generated = Column(Boolean, nullable=True)
    ai_generated_confidence = Column(Float, nullable=True)
    ai_generated_model_used = Column(String, nullable=True)

    processing_status = Column(
        SQLEnum(ProcessingStatus, name="processing_status_enum"),
        default=ProcessingStatus.UPLOADED,
        nullable=False
    )

    is_processed = Column(Boolean, default=False, nullable=False)

    # Distinguishes submission photos from contractor completion-proof photos.
    # NULL / "submission" = original report photo; "completion_proof" = set by
    # the /complete endpoint. Nullable so existing rows are unaffected.
    attachment_type = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    report = relationship(
        "Report",
        back_populates="media_attachments",
        lazy="joined"
    )

    ai_detections = relationship(
        "AIDetectionResult",
        back_populates="media",
        cascade="all, delete-orphan",
    )