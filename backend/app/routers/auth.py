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

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.create_user(db, data)

    otp_code = await auth_service.create_otp(
        db, user.email, OTPPurpose.email_verify, user.id
    )

    background_tasks.add_task(send_otp_email, user.email, otp_code, "email_verify")

    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
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
        await auth_service.revoke_all_refresh_tokens(db, data.refresh_token)
        raise HTTPException(401, "Token reuse detected")
    except ValueError as e:
        raise HTTPException(401, str(e))

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


@router.post("/otp/request", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
async def request_otp(
    request: Request,
    data: OTPRequestRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.get_by_email(db, data.email)

    # prevents user enumeration
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
        raise HTTPException(400, str(e))

    if data.purpose == OTPPurpose.email_verify:
        user = await user_service.get_by_email(db, data.email)
        if user:
            user.is_verified = True
            await db.commit()


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
        raise HTTPException(400, str(e))

    user = await user_service.get_by_email(db, data.email)

    if not user:
        raise HTTPException(404, "User not found")

    user.hashed_password = auth_service.hash_password(data.new_password)
    await db.commit()