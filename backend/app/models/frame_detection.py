from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey,
    Integer, JSON, String, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.report import Report


class FrameDetection(Base):
    __tablename__ = "frame_detections"

    __table_args__ = (
        Index("idx_frame_det_report_id",   "report_id"),
        Index("idx_frame_det_damage_type", "damage_type"),
    )

    id          = Column(Integer, primary_key=True, index=True)
    report_id   = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    frame_index = Column(Integer, nullable=False)
    damage_type = Column(String,  nullable=False)   # "crack" | "pothole"
    confidence  = Column(Float,   nullable=False)
    image_path  = Column(String,  nullable=True)    # saved frame crop path
    bbox        = Column(JSON,    nullable=True)     # [x1, y1, x2, y2]
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    report = relationship("Report", back_populates="frame_detections")