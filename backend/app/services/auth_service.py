"""
Auth service — handles JWT creation/validation, OTP flow, refresh token rotation.
All sensitive values (OTP codes, refresh tokens) are hashed before storage.

FIX: Password hashing is now handled exclusively by passlib (via core/security.py).
     Previously, raw `bcrypt` was used here while `core/security.py` used passlib's
     CryptContext — these produce incompatible hashes, causing login to fail for any
     account registered through the legacy route. Standardising on passlib fixes this.
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
# FIX: Import passlib-based helpers from core/security.py.
# Do NOT use raw bcrypt.hashpw / bcrypt.checkpw for user passwords —
# passlib wraps bcrypt with a slightly different format that is NOT
# cross-compatible with raw bcrypt verification.
from app.core.security import get_password_hash, verify_password as _passlib_verify
from app.models.otp import OTP
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.enums import OTPPurpose

# OTP-only bcrypt rounds — kept separate from user passwords.
# OTPs are short-lived (10 min) so rounds=10 is fine here.
_OTP_BCRYPT_ROUNDS = 10


# ── Custom exceptions ──────────────────────────────────────────────────────────

class TokenReuseError(Exception):
    """
    Raised when a previously-revoked refresh token is presented.
    This is a strong signal of token theft — the router should revoke
    ALL tokens for the user in response (see routers/auth.py).
    """


# ── Password hashing ───────────────────────────────────────────────────────────
# FIX: Both functions now delegate to core/security.py (passlib CryptContext).
# This ensures that passwords hashed during registration can always be
# verified during login, regardless of which route was used to register.

def hash_password(plain: str) -> str:
    """Hash a plain-text password using passlib (bcrypt under the hood)."""
    return get_password_hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plain-text password against a stored hash.
    Works for hashes produced by both get_password_hash() and the old
    passlib CryptContext, because they are the same library.
    """
    return _passlib_verify(plain, hashed)


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

    # Distinguish reuse (already revoked) from expiry so the router can
    # apply the nuclear option (revoke all sessions) only on reuse.
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

    Called by the router when TokenReuseError is raised: a previously-revoked
    token being presented means either the token was stolen or the client has
    a bug. Either way, force all sessions to re-authenticate.
    """
    token_hash = _hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    db_token = result.scalar_one_or_none()
    if not db_token:
        return  # nothing to do

    now = datetime.now(timezone.utc)

    # Fetch all active tokens for this user and revoke them
    all_tokens_result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == db_token.user_id,
            RefreshToken.is_revoked == False,  # noqa: E712
        )
    )
    for token in all_tokens_result.scalars().all():
        token.is_revoked = True
        token.revoked_at = now

    await db.commit()


# ── OTP ────────────────────────────────────────────────────────────────────────
# NOTE: OTP hashing intentionally uses raw bcrypt (NOT passlib).
# OTP hashes are internal-only and never cross-checked against user passwords,
# so there is no compatibility concern here. Raw bcrypt is used to allow
# explicit round control (_OTP_BCRYPT_ROUNDS) for performance tuning.

def _generate_otp_code(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def _hash_otp(code: str) -> str:
    return bcrypt.hashpw(
        code.encode(), bcrypt.gensalt(rounds=_OTP_BCRYPT_ROUNDS)
    ).decode()


def _verify_otp_code(code: str, hashed: str) -> bool:
    return bcrypt.checkpw(code.encode(), hashed.encode())


async def create_otp(
    db: AsyncSession,
    email: str,
    purpose: OTPPurpose,
    user_id: Optional[int] = None,
) -> str:
    """Creates and stores a hashed OTP. Returns the raw code (send via email)."""
    # Invalidate any existing active OTPs for the same email + purpose
    existing = await db.execute(
        select(OTP).where(
            OTP.email == email,
            OTP.purpose == purpose,
            OTP.is_used == False,  # noqa: E712
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
            OTP.is_used == False,  # noqa: E712
        ).order_by(OTP.created_at.desc())
    )
    db_otp = result.scalar_one_or_none()

    if not db_otp:
        raise ValueError("No active OTP found. Please request a new one.")

    if db_otp.expires_at < datetime.now(timezone.utc):
        raise ValueError("OTP has expired. Please request a new one.")

    if db_otp.attempt_count >= settings.OTP_MAX_ATTEMPTS:
        raise ValueError("Too many failed attempts. Please request a new OTP.")

    if not _verify_otp_code(code, db_otp.hashed_code):
        db_otp.attempt_count += 1
        await db.commit()
        remaining = settings.OTP_MAX_ATTEMPTS - db_otp.attempt_count
        raise ValueError(f"Incorrect OTP. {remaining} attempt(s) remaining.")

    db_otp.is_used = True
    await db.commit()
    return True