from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, LargeBinary, String, Text, func
from sqlalchemy.orm import deferred, relationship

from app.db.base import Base


class RepairReview(Base):
    __tablename__ = "repair_reviews"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False)
    contractor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    status = Column(String(24), nullable=False)
    reason = Column(Text)
    notes = Column(Text, nullable=False)
    materials = Column(JSON)
    actual_cost = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    decided_at = Column(DateTime(timezone=True))
    photos = relationship("RepairReviewPhoto", order_by="RepairReviewPhoto.id", cascade="all, delete-orphan")


class RepairReviewPhoto(Base):
    __tablename__ = "repair_review_photos"

    id = Column(Integer, primary_key=True)
    review_id = Column(Integer, ForeignKey("repair_reviews.id", ondelete="CASCADE"), index=True, nullable=False)
    content_type = Column(String(32), nullable=False)
    content = deferred(Column(LargeBinary, nullable=False))
