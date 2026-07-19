from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True
    )

    # Role of the acting user AT THE TIME of the action.
    # Stored here rather than derived by joining users.role because roles can
    # change after the fact — a user promoted to superadmin would otherwise
    # appear to have always been a superadmin in historical audit queries.
    performed_by_role = Column(String(32), nullable=True)

    # Action performed — e.g. USER_LOGIN | REPORT_CREATED | STATUS_CHANGED
    action = Column(String, nullable=False, index=True)

    # Target resource and its id
    target_resource = Column(String, nullable=True)  # e.g. "reports" | "users"
    target_id = Column(Integer, nullable=True)

    # Structured payload
    details = Column(JSON, nullable=True)

    # Request context — important for security investigations
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    timestamp = Column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Relationships
    user = relationship("User", back_populates="audit_logs")