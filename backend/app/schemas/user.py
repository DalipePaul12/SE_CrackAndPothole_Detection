import re
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import EmailStr, Field, computed_field, field_validator

from app.models.enums import UserRole
from app.schemas.base import AppBaseModel


# ── Validators ────────────────────────────────────────────────────────────────

def validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters.")
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
    password: str = Field(..., min_length=8)
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