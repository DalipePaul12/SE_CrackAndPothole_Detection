import re
from pydantic import EmailStr, Field, field_validator

from app.models.enums import OTPPurpose
from app.schemas.base import AppBaseModel
from app.schemas.user import UserResponse, validate_password


class UserCreate(AppBaseModel):
    email: EmailStr
    password: str
    full_name: str
    contact_number: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit.")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain at least one special character.")
        return v

    @field_validator("full_name")
    @classmethod
    def full_name_clean(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        if len(v) > 100:
            raise ValueError("Full name must be under 100 characters.")
        if not re.match(r"^[a-zA-Z\s\-'.]+$", v):
            raise ValueError("Full name contains invalid characters.")
        return v

    @field_validator("contact_number")
    @classmethod
    def contact_number_clean(cls, v: str | None) -> str | None:
        if v is None:
            return v
        digits_only = re.sub(r"\D", "", v)
        if len(digits_only) < 10 or len(digits_only) > 15:
            raise ValueError("Contact number must be between 10 and 15 digits.")
        return digits_only


class EmailSchema(AppBaseModel):
    email: EmailStr


class LoginRequest(AppBaseModel):
    email: EmailStr
    password: str


class LoginStep1Response(AppBaseModel):
    otp_required: bool = True
    email: EmailStr
    message: str = "OTP sent to your email."


class LoginVerifyRequest(AppBaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


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


class ResetPasswordSchema(AppBaseModel):
    email: EmailStr
    otp_code: str
    new_password: str

    @field_validator("otp_code")
    @classmethod
    def otp_format(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("OTP must be exactly 6 digits.")
        return v

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return validate_password(v)


PasswordResetRequest = ResetPasswordSchema