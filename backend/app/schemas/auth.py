from pydantic import EmailStr, Field, field_validator

from app.models.enums import OTPPurpose
from app.schemas.base import AppBaseModel
from app.schemas.user import UserResponse, validate_password


class LoginRequest(AppBaseModel):
    email: EmailStr
    password: str


class TokenResponse(AppBaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(AppBaseModel):
    refresh_token: str


class OTPRequestRequest(AppBaseModel):
    email: EmailStr
    purpose: OTPPurpose


class OTPVerifyRequest(AppBaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    purpose: OTPPurpose


class PasswordResetRequest(AppBaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str

    # enforce strong password rules via shared validator
    @field_validator("new_password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        return validate_password(v)