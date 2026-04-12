from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Store only the HASH of the token — never the raw token string.
    # Hash with SHA-256 before saving. Compare hashes on validation.
    token_hash = Column(String, nullable=False, unique=True)

    # Device info for session management (shows user their active sessions)
    device_info = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)

    # Lifecycle
    is_revoked = Column(Boolean, default=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="refresh_tokens")