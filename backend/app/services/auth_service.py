"""
Auth service — handles JWT creation/validation, OTP flow, refresh token rotation.
All sensitive values (OTP codes, refresh tokens) are hashed before storage.
"""
import hashlib
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.otp import OTP
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.enums import OTPPurpose

# ── Bcrypt rounds — 10 is faster for dev, use 12 in production ────────────────
_BCRYPT_ROUNDS = 10


# ── Custom exceptions ──────────────────────────────────────────────────────────

class TokenReuseError(Exception):
    """
    Raised when a previously-revoked refresh token is presented.
    This is a strong signal of token theft — the router should revoke
    ALL tokens for the user in response.
    """


# ── Password hashing ───────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT ────────────────────────────────────────────────────────────────────────

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
    """Raises JWTError if invalid or expired."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


# ── Refresh tokens ─────────────────────────────────────────────────────────────

def _hash_token(raw: str) -> str:
    """SHA-256 hash of a raw token string — stored in DB, never the raw value."""
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
    """
    Refresh token rotation — invalidates the old token and issues a new one.
    Returns (new_raw_token, user).

    Raises:
      TokenReuseError  — if the token was already revoked (possible theft signal)
      ValueError       — if the token is invalid or expired
    """
    token_hash = _hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    db_token = result.scalar_one_or_none()

    if not db_token:
        raise ValueError("Invalid refresh token.")

    if db_token.is_revoked:
        raise TokenReuseError("Refresh token has already been used or revoked.")

    if db_token.expires_at < datetime.now(timezone.utc):
        raise ValueError("Refresh token has expired.")

    # Revoke old token
    db_token.is_revoked = True
    db_token.revoked_at = datetime.now(timezone.utc)

    user = await db.get(User, db_token.user_id)
    if not user or not user.is_active:
        raise ValueError("User not found or inactive.")

    new_raw = await create_refresh_token(
        db, user.id, db_token.device_info, ip_address
    )
    return new_raw, user


async def revoke_all_refresh_tokens(db: AsyncSession, raw_token: str) -> None:
    """
    Token theft response — revokes ALL active refresh tokens for the user
    associated with the given (possibly already-revoked) token.
    """
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
            RefreshToken.is_revoked == False,
        )
    )
    for token in all_tokens_result.scalars().all():
        token.is_revoked = True
        token.revoked_at = now

    await db.commit()


# ── OTP ────────────────────────────────────────────────────────────────────────

def _generate_otp_code(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def _hash_otp(code: str) -> str:
    # rounds=10 — OTP hashing is the biggest login/register bottleneck
    return bcrypt.hashpw(code.encode(), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode()


def _verify_otp(code: str, hashed: str) -> bool:
    return bcrypt.checkpw(code.encode(), hashed.encode())


async def create_otp(
    db: AsyncSession,
    email: str,
    purpose: OTPPurpose,
    user_id: Optional[int] = None,
) -> str:
    """Creates and stores a hashed OTP. Returns the raw code (send via email)."""
    existing = await db.execute(
        select(OTP).where(
            OTP.email == email,
            OTP.purpose == purpose,
            OTP.is_used == False,
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
    """
    Verifies OTP. Increments attempt_count on failure (brute-force guard).
    Raises ValueError with a safe message on any failure.
    """
    result = await db.execute(
        select(OTP).where(
            OTP.email == email,
            OTP.purpose == purpose,
            OTP.is_used == False,
        ).order_by(OTP.created_at.desc())
    )
    db_otp = result.scalar_one_or_none()

    if not db_otp:
        raise ValueError("No active OTP found. Please request a new one.")

    if db_otp.expires_at < datetime.now(timezone.utc):
        raise ValueError("OTP has expired. Please request a new one.")

    if db_otp.attempt_count >= settings.OTP_MAX_ATTEMPTS:
        raise ValueError("Too many failed attempts. Please request a new OTP.")

    if not _verify_otp(code, db_otp.hashed_code):
        db_otp.attempt_count += 1
        await db.commit()
        remaining = settings.OTP_MAX_ATTEMPTS - db_otp.attempt_count
        raise ValueError(f"Incorrect OTP. {remaining} attempt(s) remaining.")

    db_otp.is_used = True
    await db.commit()
    return True