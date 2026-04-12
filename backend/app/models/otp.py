from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SQLEnum,
    ForeignKey, Integer, String,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import OTPPurpose


class OTP(Base):
    __tablename__ = "otps"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    email = Column(String, index=True, nullable=False)

    # Store HASHED code only — hash with bcrypt before saving.
    # Never store or log the raw OTP code.
    hashed_code = Column(String, nullable=False)

    purpose = Column(
        SQLEnum(OTPPurpose, name="otppurpose", create_type=True),
        nullable=False,
    )

    is_used = Column(Boolean, default=False)
    attempt_count = Column(Integer, default=0)  # brute-force guard

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Indexed — cleanup jobs (DELETE WHERE expires_at < NOW()) need this
    expires_at = Column(
        DateTime(timezone=True), nullable=False, index=True
    )