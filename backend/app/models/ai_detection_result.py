from sqlalchemy import (
    CheckConstraint, Column, DateTime, Enum as SQLEnum,
    Float, ForeignKey, Integer, JSON, String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import DamageType, SeverityLevel


class AIDetectionResult(Base):
    __tablename__ = "ai_detection_results"

    __table_args__ = (
        CheckConstraint(
            "confidence >= 0.0 AND confidence <= 1.0",
            name="ck_ai_confidence_range",
        ),
        CheckConstraint(
            "inference_time_ms IS NULL OR inference_time_ms >= 0",
            name="ck_ai_inference_time_positive",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(
        Integer,
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    media_attachment_id = Column(
        Integer,
        ForeignKey("media_attachments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # FIX: create_type=False — report.py already creates "damagetype" and "severitylevel".
    # Having two models both set create_type=True for the same DB type name causes
    # "type already exists" errors during table creation / Alembic migrations.
    detected_class = Column(
        SQLEnum(DamageType, name="damagetype", create_type=False),
        nullable=False,
        index=True,
    )

    severity = Column(
        SQLEnum(SeverityLevel, name="severitylevel", create_type=False),
        nullable=True,
    )

    confidence = Column(Float, nullable=False)

    bounding_boxes = Column(JSON, nullable=True)
    raw_output = Column(JSON, nullable=True)

    model_version = Column(String, nullable=True)
    inference_time_ms = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    report = relationship("Report", back_populates="ai_detections")
    media = relationship("MediaAttachment", back_populates="ai_detections")