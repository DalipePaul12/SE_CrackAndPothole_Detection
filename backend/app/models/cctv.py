from sqlalchemy import (
    Boolean, Column, DateTime, Float,
    ForeignKey, Integer, String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class CCTV(Base):
    __tablename__ = "cctvs"

    id = Column(Integer, primary_key=True, index=True)

    location_name = Column(String, nullable=False)
    barangay = Column(String, nullable=True, index=True)
    city = Column(String, nullable=True)

    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)

    stream_url = Column(String, nullable=False)

    is_active = Column(Boolean, default=True, index=True)

    added_by_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    last_maintenance = Column(DateTime(timezone=True), nullable=True)
    last_detection_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    added_by = relationship("User", foreign_keys=[added_by_id])