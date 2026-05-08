"""
frame_detection.py

Stores per-frame YOLO detection results for video-based reports.
One row per detected damage instance per frame.
Used to build the Detection Filmstrip on the frontend
and to populate hybrid report metadata.
"""

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey,
    Integer, JSON, String, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class FrameDetection(Base):
    __tablename__ = "frame_detections"

    __table_args__ = (
        # Fast lookup of all detections for a given report
        Index("idx_frame_det_report_id",   "report_id"),
        # Fast filtering by damage type across reports
        Index("idx_frame_det_damage_type", "damage_type"),
    )

    id = Column(Integer, primary_key=True, index=True)

    report_id = Column(
        Integer,
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Which frame in the video this detection came from (0-based)
    frame_index = Column(Integer, nullable=False)

    # "pothole" | "crack"  — plain string, not enum,
    # since FrameDetection is a log table and DamageType enum
    # is already enforced on the parent Report.
    damage_type = Column(String, nullable=False)

    # YOLO confidence score (0.0 – 1.0)
    confidence = Column(Float, nullable=False)

    # Relative path to the saved annotated frame crop
    # e.g. /static/frames/abc123.jpg
    image_path = Column(String, nullable=True)

    # Raw bounding box from YOLO: [x1, y1, x2, y2] in pixel coords
    bbox = Column(JSON, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # ── Relationship ──────────────────────────────────────────────────────────

    report = relationship(
        "Report",
        back_populates="frame_detections",
    )