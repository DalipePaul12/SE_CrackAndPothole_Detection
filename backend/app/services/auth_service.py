import hashlib
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import bcrypt
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_password_hash, verify_password as _passlib_verify
from app.models.otp import OTP
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.enums import OTPPurpose


_OTP_BCRYPT_ROUNDS = 10


class TokenReuseError(Exception):
    pass


# unified password hashing via passlib
def hash_password(plain: str) -> str:
    return get_password_hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _passlib_verify(plain, hashed)


def create_access_token(user_public_id: UUID, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": str(user_public_id),
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def create_refresh_token(
    db: AsyncSession,
    user_id: int,
    device_info: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> str:
    raw_token = secrets.token_urlsafe(64)
    token_hash = _hash_token(raw_token)

    expires = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    db_token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        device_info=device_info,
        ip_address=ip_address,
        expires_at=expires,
    )

    db.add(db_token)
    await db.commit()

    return raw_token


async def rotate_refresh_token(
    db: AsyncSession,
    raw_token: str,
    ip_address: Optional[str] = None,
) -> tuple[str, User]:
    token_hash = _hash_token(raw_token)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    db_token = result.scalar_one_or_none()

    if not db_token:
        raise ValueError("Invalid refresh token")

    if db_token.is_revoked:
        raise TokenReuseError("Token reuse detected")

    if db_token.expires_at < datetime.now(timezone.utc):
        raise ValueError("Refresh token expired")

    db_token.is_revoked = True
    db_token.revoked_at = datetime.now(timezone.utc)

    user = await db.get(User, db_token.user_id)

    if not user or not user.is_active:
        raise ValueError("User invalid or inactive")

    new_raw = await create_refresh_token(
        db,
        user.id,
        db_token.device_info,
        ip_address,
    )

    return new_raw, user


async def revoke_all_refresh_tokens(db: AsyncSession, raw_token: str) -> None:
    token_hash = _hash_token(raw_token)

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    db_token = result.scalar_one_or_none()

    if not db_token:
        return

    now = datetime.now(timezone.utc)

    all_tokens_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == db_token.user_id,
            RefreshToken.is_revoked == False,  # noqa
        )
    )

    for token in all_tokens_result.scalars().all():
        token.is_revoked = True
        token.revoked_at = now

    await db.commit()


def _generate_otp_code(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def _hash_otp(code: str) -> str:
    return bcrypt.hashpw(
        code.encode(),
        bcrypt.gensalt(rounds=_OTP_BCRYPT_ROUNDS),
    ).decode()


def _verify_otp_code(code: str, hashed: str) -> bool:
    return bcrypt.checkpw(code.encode(), hashed.encode())


async def create_otp(
    db: AsyncSession,
    email: str,
    purpose: OTPPurpose,
    user_id: Optional[int] = None,
) -> str:
    existing = await db.execute(
        select(OTP).where(
            OTP.email == email,
            OTP.purpose == purpose,
            OTP.is_used == False,  # noqa
        )
    )

    for old in existing.scalars().all():
        old.is_used = True

    code = _generate_otp_code()

    expires = datetime.now(timezone.utc) + timedelta(
        minutes=settings.OTP_EXPIRE_MINUTES
    )

    db_otp = OTP(
        user_id=user_id,
        email=email,
        hashed_code=_hash_otp(code),
        purpose=purpose,
        expires_at=expires,
    )

    db.add(db_otp)
    await db.commit()

    return code


async def verify_otp(
    db: AsyncSession,
    email: str,
    code: str,
    purpose: OTPPurpose,
) -> bool:
    result = await db.execute(
        select(OTP).where(
            OTP.email == email,
            OTP.purpose == purpose,
            OTP.is_used == False,  # noqa
        ).order_by(OTP.created_at.desc())
    )

    db_otp = result.scalar_one_or_none()

    if not db_otp:
        raise ValueError("No active OTP")

    if db_otp.expires_at < datetime.now(timezone.utc):
        raise ValueError("OTP expired")

    if db_otp.attempt_count >= settings.OTP_MAX_ATTEMPTS:
        raise ValueError("Too many attempts")

    if not _verify_otp_code(code, db_otp.hashed_code):
        db_otp.attempt_count += 1
        await db.commit()

        remaining = settings.OTP_MAX_ATTEMPTS - db_otp.attempt_count
        raise ValueError(f"Incorrect OTP ({remaining} left)")

    db_otp.is_used = True
    await db.commit()

    return True