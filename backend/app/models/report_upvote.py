from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class ReportUpvote(Base):
    __tablename__ = "report_upvotes"

    __table_args__ = (
        # One upvote per user per report — enforced at DB level.
        # Application-level checks are not sufficient (race conditions).
        UniqueConstraint("user_id", "report_id", name="uq_user_report_upvote"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_id = Column(
        Integer,
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="upvotes")
    report = relationship("Report", back_populates="upvotes")