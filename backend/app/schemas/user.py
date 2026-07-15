import re
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import EmailStr, Field, computed_field, field_validator

from app.models.enums import UserRole
from app.schemas.base import AppBaseModel


# ── Validators ────────────────────────────────────────────────────────────────

def validate_password(v: str, *, min_length: int = 1) -> str:
    # Length floor is enforced here only as a hard safety floor (min_length=1
    # by default).  The real DB-driven minimum is checked at the endpoint layer
    # after reading admin_settings.password_min_length — do not add a
    # hardcoded value here that would diverge from the DB setting.
    if len(v) < min_length:
        raise ValueError(f"Password must be at least {min_length} characters.")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one digit.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
        raise ValueError("Password must contain at least one special character.")
    return v


# ── Request schemas ────────────────────────────────────────────────────────────

class UserCreate(AppBaseModel):
    email: EmailStr
    # min_length=1: bare-minimum Pydantic floor only.  The real policy minimum
    # (admin_settings.password_min_length) is enforced at the endpoint layer.
    password: str = Field(..., min_length=1)
    full_name: str = Field(..., min_length=2, max_length=100)
    contact_number: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    barangay: Optional[str] = Field(None, max_length=100)
    street: Optional[str] = Field(None, max_length=200)

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return validate_password(v)

    @field_validator("contact_number")
    @classmethod
    def valid_ph_number(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        # Allow formats: +639XXXXXXXXX, 09XXXXXXXXX, 9XXXXXXXXX
        pattern = r"^(\+63|0)?9\d{9}$"
        if not re.match(pattern, v.replace(" ", "").replace("-", "")):
            raise ValueError("Enter a valid Philippine mobile number.")
        return v


class UserUpdate(AppBaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    contact_number: Optional[str] = Field(None, max_length=20)
    profile_picture_url: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    barangay: Optional[str] = Field(None, max_length=100)
    street: Optional[str] = Field(None, max_length=200)


class PasswordChangeRequest(AppBaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return validate_password(v)


# ── Response schemas ───────────────────────────────────────────────────────────

class UserPublic(AppBaseModel):
    """Minimal public profile — safe to expose to other users."""
    public_id: UUID
    full_name: str
    role: UserRole
    reputation_score: float
    created_at: datetime
    email: EmailStr
    contact_number: Optional[str] = None


class UserResponse(AppBaseModel):
    """Full profile — returned only to the authenticated user or admins."""
    public_id: UUID
    email: EmailStr
    full_name: str
    contact_number: Optional[str] = None
    profile_picture_url: Optional[str] = None
    country: str
    city: Optional[str] = None
    barangay: Optional[str] = None
    street: Optional[str] = None
    role: UserRole
    reputation_score: float
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: Optional[datetime] = None