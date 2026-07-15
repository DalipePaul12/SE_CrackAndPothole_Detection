import re
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_token, get_password_hash, verify_password
from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.enums import OTPPurpose, UserRole
from app.models.user import User
from app.schemas.auth import (
    EmailSchema,
    LoginRequest,
    LoginStep1Response,
    LoginVerifyRequest,
    RefreshTokenRequest,
    ResetPasswordSchema,
    TokenResponse,
    UserCreate,
)
from app.services import auth_service
from app.services.email_service import send_otp_email
from app.utils.logger import logger
from app.schemas.user import UserResponse as _UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _load_admin_settings(db: AsyncSession):
    """Return the singleton AdminSettings row, or None if the table is empty."""
    from sqlalchemy import select as _select
    from app.models.admin_settings import AdminSettings
    result = await db.execute(_select(AdminSettings).where(AdminSettings.id == 1))
    return result.scalar_one_or_none()


def _mask_email(email: str) -> str:
    if "@" not in email:
        return email
    local, domain = email.split("@")
    if len(local) <= 2:
        masked_local = local[0] + "***"
    else:
        masked_local = local[0] + "***" + local[-1]
    return f"{masked_local}@{domain}"


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def register(
    request: Request,
    user_data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # ── Enforce DB-configured password minimum length ─────────────────────────
    admin_cfg = await _load_admin_settings(db)
    min_len = (admin_cfg.password_min_length if admin_cfg else None) or 8
    if len(user_data.password) < min_len:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must be at least {min_len} characters.",
        )

    result = await db.execute(select(User).where(User.email == user_data.email))
    existing = result.scalar_one_or_none()

    if existing:
        if existing.is_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration failed. Please check your details.",
            )
        else:
            # Unverified leftover — resend OTP instead of blocking
            existing.hashed_password = get_password_hash(user_data.password)
            existing.full_name = user_data.full_name
            existing.contact_number = user_data.contact_number
            await db.commit()
            await db.refresh(existing)
            code = await auth_service.create_otp(db, existing.email, OTPPurpose.email_verify, existing.id)
            background_tasks.add_task(send_otp_email, existing.email, code, "email_verify")
            return {"message": "Registration successful.", "user_id": existing.id}

    new_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        contact_number=user_data.contact_number,
        role=UserRole.citizen,
        reputation_score=100,
        is_active=True,
        is_verified=False,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # ← THIS WAS MISSING
    code = await auth_service.create_otp(db, new_user.email, OTPPurpose.email_verify, new_user.id)
    background_tasks.add_task(send_otp_email, new_user.email, code, "email_verify")

    logger.info("New user registered | id=%d | ip=%s", new_user.id, _get_client_ip(request))
    return {"message": "Registration successful.", "user_id": new_user.id}


@router.post("/login")   # response_model intentionally absent — shape varies by require_2fa setting
@limiter.limit("5/minute")
async def login(
    request: Request,
    credentials: LoginRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.hashed_password):
        logger.warning("Failed login attempt | email=%s | ip=%s", credentials.email, _get_client_ip(request))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    if not getattr(user, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support.",
        )

    # ── Read security settings from DB ────────────────────────────────────────
    admin_cfg   = await _load_admin_settings(db)
    require_2fa     = (admin_cfg.require_2fa     if admin_cfg else None)
    session_timeout = (admin_cfg.session_timeout if admin_cfg else None)
    # Default: require 2FA when the setting row is absent (safe-fail closed).
    if require_2fa is None:
        require_2fa = True

    if not require_2fa:
        # ── 2FA disabled: issue tokens immediately after password check ───────
        user.last_login_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(user)
        access_token = auth_service.create_access_token(
            user.public_id, user.role.value, expire_minutes=session_timeout
        )
        refresh_token = await auth_service.create_refresh_token(
            db,
            user.id,
            device_info=request.headers.get("User-Agent"),
            ip_address=_get_client_ip(request),
        )
        logger.info("Login (2FA disabled) | user_id=%d | ip=%s", user.id, _get_client_ip(request))
        return {
            "otp_required": False,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": _UserResponse.model_validate(user),
        }

    # ── 2FA enabled: send OTP and return step-1 response ─────────────────────
    try:
        code = await auth_service.create_otp(db, user.email, OTPPurpose.two_factor, user.id)
        background_tasks.add_task(send_otp_email, user.email, code, "two_factor")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))

    logger.info("2FA OTP sent | user_id=%d | ip=%s", user.id, _get_client_ip(request))

    return {
        "otp_required": True,
        "email": _mask_email(user.email),
        "message": "OTP sent to your email.",
    }


@router.post("/verify-login-otp", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_login_otp(
    request: Request,
    data: LoginVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    ip = _get_client_ip(request)

    try:
        otp_valid = await auth_service.verify_otp(db, data.email, data.code, OTPPurpose.two_factor)
        if not otp_valid:
            raise ValueError("OTP verification returned False")
    except ValueError as e:
        logger.warning("2FA verification failed | email=%s | ip=%s | reason=%s", data.email, ip, str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account invalid or deactivated.")

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    admin_cfg       = await _load_admin_settings(db)
    session_timeout = (admin_cfg.session_timeout if admin_cfg else None)
    access_token = auth_service.create_access_token(
        user.public_id, user.role.value, expire_minutes=session_timeout
    )
    refresh_token = await auth_service.create_refresh_token(
        db,
        user.id,
        device_info=request.headers.get("User-Agent"),
        ip_address=ip,
    )

    logger.info("Successful 2FA login | user_id=%d | ip=%s", user.id, ip)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user,  # Return the ORM object directly — FastAPI/Pydantic will serialize via UserResponse
    }
@router.post("/verify-email-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def verify_email_otp(
    request: Request,
    data: LoginVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        await auth_service.verify_otp(db, data.email, data.code, OTPPurpose.email_verify)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user.is_verified = True
    await db.commit()
    return {"message": "Email verified successfully."}

@router.post("/resend-login-otp", response_model=LoginStep1Response)
@limiter.limit("3/minute")
async def resend_login_otp(
    request: Request,
    data: EmailSchema,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user and user.is_active:
        try:
            code = await auth_service.create_otp(db, user.email, OTPPurpose.two_factor, user.id)
            background_tasks.add_task(send_otp_email, user.email, code, "two_factor")
        except ValueError:
            pass

    return {
        "otp_required": True,
        "email": _mask_email(data.email),
        "message": "If that email exists, an OTP has been sent.",
    }

@router.post("/resend-email-otp", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def resend_email_otp(
    request: Request,
    data: EmailSchema,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if user and not user.is_verified:
        try:
            code = await auth_service.create_otp(db, user.email, OTPPurpose.email_verify, user.id)
            background_tasks.add_task(send_otp_email, user.email, code, "email_verify")
        except ValueError:
            pass  # cooldown — silently ignore

    return {"message": "If that email exists, a new code has been sent."}

@router.post("/refresh")
async def refresh_token(
    request: Request,
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Rotate refresh token and return new access + refresh tokens."""
    ip = _get_client_ip(request)

    try:
        new_refresh_token, user = await auth_service.rotate_refresh_token(
            db, data.refresh_token, ip_address=ip
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    except auth_service.TokenReuseError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. Please log in again.",
        )

    admin_cfg       = await _load_admin_settings(db)
    session_timeout = (admin_cfg.session_timeout if admin_cfg else None)
    access_token = auth_service.create_access_token(
        user.public_id, user.role.value, expire_minutes=session_timeout
    )

    logger.info("Token refreshed | user_id=%d | ip=%s", user.id, ip)

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "user": user,
    }


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    data: EmailSchema,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    ip = _get_client_ip(request)
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        logger.info("Password reset requested for unknown email | ip=%s", ip)
        return {"message": "If that email exists, an OTP has been sent."}

    try:
        code = await auth_service.create_otp(db, data.email, OTPPurpose.password_reset, user.id)
        background_tasks.add_task(send_otp_email, data.email, code, "password_reset")
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
        await auth_service.verify_otp(db, data.email, data.otp_code, OTPPurpose.password_reset)
    except ValueError as e:
        logger.warning("OTP verification failed | ip=%s | reason=%s", ip, str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # ── Enforce DB-configured password minimum length ─────────────────────────
    admin_cfg = await _load_admin_settings(db)
    min_len = (admin_cfg.password_min_length if admin_cfg else None) or 8
    if len(data.new_password) < min_len:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must be at least {min_len} characters.",
        )

    user.hashed_password = get_password_hash(data.new_password)
    await db.commit()

    logger.info("Password reset successful | user_id=%d | ip=%s", user.id, ip)
    return {"message": "Password updated successfully."}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.public_id),
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.value,
        "contact_number": current_user.contact_number,
        "is_active": getattr(current_user, "is_active", True),
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