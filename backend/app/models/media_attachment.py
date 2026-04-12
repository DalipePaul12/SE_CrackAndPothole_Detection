from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime,
    Enum as SQLEnum, Float, ForeignKey, Integer, String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import MediaType


class MediaAttachment(Base):
    __tablename__ = "media_attachments"

    __table_args__ = (
        CheckConstraint(
            "file_size_bytes IS NULL OR file_size_bytes > 0",
            name="ck_media_file_size_positive",
        ),
        CheckConstraint(
            "ai_generated_confidence >= 0.0 AND ai_generated_confidence <= 1.0",
            name="ck_media_ai_confidence_range",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(
        Integer,
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # File info
    file_url = Column(String, nullable=False)
    file_name = Column(String, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)

    media_type = Column(
        SQLEnum(MediaType, name="mediatype", create_type=True),
        nullable=False,
    )

    # AI-generated media detection results
    is_ai_generated = Column(Boolean, default=False)
    ai_generated_confidence = Column(Float, default=0.0)
    # Which open-source model was used — e.g. "hive-moderation"
    ai_generated_model_used = Column(String, nullable=True)

    # True once YOLO inference has run on this file
    is_processed = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    report = relationship("Report", back_populates="media_attachments")
    ai_detections = relationship(
        "AIDetectionResult",
        back_populates="media",
        cascade="all, delete-orphan",
    )