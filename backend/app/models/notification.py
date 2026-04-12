from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SQLEnum,
    ForeignKey, Integer, String,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import NotificationType


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    report_id = Column(
        Integer,
        ForeignKey("reports.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title = Column(String, nullable=False)
    message = Column(String, nullable=False)

    type = Column(
        SQLEnum(NotificationType, name="notificationtype", create_type=True),
        default=NotificationType.info,
        nullable=False,
    )

    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="notifications")
    report = relationship("Report", back_populates="notifications")