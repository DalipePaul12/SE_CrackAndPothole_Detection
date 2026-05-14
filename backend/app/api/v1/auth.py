import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, decode_token, get_password_hash, verify_password
from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user, require_admin
from app.middleware.rate_limiter import limiter
from app.models.enums import OTPPurpose, UserRole
from app.models.user import User
from app.services import auth_service
from app.utils.logger import logger

router = APIRouter(prefix="/auth", tags=["Authentication"]) 
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class UserCreate(BaseModel):
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


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str


class EmailSchema(BaseModel):
    email: EmailStr


class ResetPasswordSchema(BaseModel):
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


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def register(
    request: Request,
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Please check your details.",
        )

    new_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        contact_number=user_data.contact_number,
        role=UserRole.citizen,
        reputation_score=100,
        is_active=True,
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    logger.info("New user registered | id=%d | ip=%s", new_user.id, _get_client_ip(request))

    return {"message": "Registration successful.", "user_id": new_user.id}


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning("Failed login attempt | email=%s | ip=%s", form_data.username, _get_client_ip(request))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not getattr(user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support.",
        )

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role.value, "id": user.id}
    )

    logger.info("Successful login | user_id=%d | ip=%s", user.id, _get_client_ip(request))

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role.value,
    }


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    data: EmailSchema,
    db: AsyncSession = Depends(get_db),
):
    ip = _get_client_ip(request)

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        logger.info("Password reset requested for unknown email | ip=%s", ip)
        return {"message": "If that email exists, an OTP has been sent."}

    try:
        await auth_service.create_otp(
            db, data.email, OTPPurpose.password_reset, user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))

    logger.info("OTP generated for password reset | user_id=%d | ip=%s", user.id, ip)

    return {"message": "If that email exists, an OTP has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    data: ResetPasswordSchema,
    db: AsyncSession = Depends(get_db),
):
    ip = _get_client_ip(request)

    try:
        await auth_service.verify_otp(
            db, data.email, data.otp_code, OTPPurpose.password_reset
        )
    except ValueError as e:
        logger.warning("OTP verification failed | ip=%s | reason=%s", ip, str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.hashed_password = get_password_hash(data.new_password)
    await db.commit()

    logger.info("Password reset successful | user_id=%d | ip=%s", user.id, ip)

    return {"message": "Password updated successfully."}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id":             current_user.id,
        "email":          current_user.email,
        "full_name":      current_user.full_name,
        "role":           current_user.role.value,
        "contact_number": current_user.contact_number,
        "is_active":      getattr(current_user, "is_active", True),
    }


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()

    payload = decode_token(token)
    if payload:
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
            await auth_service.revoke_access_token(db, jti, expires_at)

    logger.info("User logged out | user_id=%d", current_user.id)
    return {"message": "Logged out successfully."}