import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user
from app.middleware.rate_limiter import limiter
from app.models.enums import OTPPurpose
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    OTPRequestRequest,
    OTPVerifyRequest,
    PasswordResetRequest,
    RefreshTokenRequest,
    TokenResponse,
)
from app.schemas.user import UserCreate, UserResponse
from app.services import auth_service, user_service
from app.services.email_service import send_otp_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await user_service.create_user(db, data)

        otp_code = await auth_service.create_otp(
            db, user.email, OTPPurpose.email_verify, user.id
        )

        background_tasks.add_task(send_otp_email, user.email, otp_code, "email_verify")

        return user
    except Exception as e:
        logger.exception("Registration failed for email: %s", data.email)
        raise


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await user_service.get_by_email(db, data.email)

        if not user or not auth_service.verify_password(data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Incorrect email or password")

        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account deactivated")

        if not user.is_verified:
            raise HTTPException(status_code=403, detail="Email not verified")

        access_token = auth_service.create_access_token(
            user.public_id,
            user.role.value,
        )

        refresh_token = await auth_service.create_refresh_token(
            db,
            user.id,
            device_info=request.headers.get("user-agent"),
            ip_address=request.client.host if request.client else None,
        )

        await user_service.record_login(db, user)
        await db.refresh(user)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Login failed for email: %s", data.email)
        raise HTTPException(status_code=500, detail="Login failed due to a server error")


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh_token(
    request: Request,
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        new_refresh, user = await auth_service.rotate_refresh_token(
            db,
            data.refresh_token,
            ip_address=request.client.host if request.client else None,
        )
    except auth_service.TokenReuseError:
        logger.warning("Token reuse detected — revoking all tokens for this token hash")
        await auth_service.revoke_all_refresh_tokens(db, data.refresh_token)
        raise HTTPException(status_code=401, detail="Token reuse detected")
    except ValueError as e:
        logger.warning("Refresh token validation failed: %s", str(e))
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during token refresh")
        raise HTTPException(status_code=500, detail="Token refresh failed due to a server error")

    try:
        access_token = auth_service.create_access_token(
            user.public_id,
            user.role.value,
        )

        await db.refresh(user)

        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh,
            user=user,
        )
    except Exception as e:
        logger.exception("Failed to build token response for user: %s", user.id)
        raise HTTPException(status_code=500, detail="Failed to build token response")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import hashlib
    from sqlalchemy import select
    from app.models.refresh_token import RefreshToken
    from datetime import datetime, timezone

    try:
        token_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()

        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.user_id == current_user.id,
            )
        )

        db_token = result.scalar_one_or_none()

        if db_token:
            db_token.is_revoked = True
            db_token.revoked_at = datetime.now(timezone.utc)
            await db.commit()
    except Exception as e:
        logger.exception("Logout failed for user: %s", current_user.id)
        # Still return 204 — don't expose internals, token will expire naturally


@router.post("/otp/request", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
async def request_otp(
    request: Request,
    data: OTPRequestRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await user_service.get_by_email(db, data.email)

        # prevents user enumeration — always return 204
        if not user:
            return

        otp_code = await auth_service.create_otp(
            db, data.email, data.purpose, user.id
        )

        background_tasks.add_task(
            send_otp_email,
            data.email,
            otp_code,
            data.purpose.value,
        )
    except Exception as e:
        logger.exception("OTP request failed for email: %s", data.email)
        # Silently fail to prevent enumeration
        return


@router.post("/otp/verify", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def verify_otp(
    request: Request,
    data: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        await auth_service.verify_otp(
            db, data.email, data.code, data.purpose
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("OTP verification failed for email: %s", data.email)
        raise HTTPException(status_code=500, detail="OTP verification failed due to a server error")

    if data.purpose == OTPPurpose.email_verify:
        try:
            user = await user_service.get_by_email(db, data.email)
            if user:
                user.is_verified = True
                await db.commit()
        except Exception as e:
            logger.exception("Failed to mark user as verified: %s", data.email)
            raise HTTPException(status_code=500, detail="Failed to update verification status")


@router.post("/password-reset", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
async def reset_password(
    request: Request,
    data: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        await auth_service.verify_otp(
            db,
            data.email,
            data.code,
            OTPPurpose.password_reset,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("OTP verification failed during password reset for: %s", data.email)
        raise HTTPException(status_code=500, detail="Password reset failed due to a server error")

    try:
        user = await user_service.get_by_email(db, data.email)

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.hashed_password = auth_service.hash_password(data.new_password)
        await db.commit()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update password for: %s", data.email)
        raise HTTPException(status_code=500, detail="Failed to update password")