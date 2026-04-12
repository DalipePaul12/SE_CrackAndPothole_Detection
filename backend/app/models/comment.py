from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(
        Integer,
        ForeignKey("reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Threading support (nested replies)
    parent_comment_id = Column(
        Integer,
        ForeignKey("comments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    content = Column(String, nullable=False)
    is_deleted = Column(Boolean, default=False)  # soft delete

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    report = relationship("Report", back_populates="comments")
    user = relationship("User", back_populates="comments")
    replies = relationship(
        "Comment",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    parent = relationship(
        "Comment", back_populates="replies", remote_side=[id]
    )