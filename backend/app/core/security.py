"""
security.py
===========

FIXES:
  [FIX-S1] create_refresh_token() added.
            The original file only had create_access_token(). The auth router
            calls create_refresh_token() on login, which caused an ImportError
            that crashed the entire /auth/login endpoint — making every login
            return a 500, so no token was ever stored, causing the 401 on
            every subsequent request.

  [FIX-S2] datetime.utcnow() replaced with datetime.now(timezone.utc).
            utcnow() is deprecated in Python 3.12 and raises a DeprecationWarning
            that pollutes logs.

  [FIX-S3] decode_token() added.
            Centralizes JWT decoding so auth_middleware.py doesn't have to
            import jose directly — one place to change algorithm/key.
"""

import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from app.core.config import settings


# ── Password hashing ───────────────────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(rounds=10),
    ).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


# ── Token creation ─────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """
    Creates a short-lived JWT access token.
    Expires in ACCESS_TOKEN_EXPIRE_MINUTES (default: 15 min).
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(   # [FIX-S2]
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:           # [FIX-S1]
    """
    Creates a long-lived JWT refresh token.
    Expires in REFRESH_TOKEN_EXPIRE_DAYS (default: 7 days).

    The payload includes type="refresh" so the /auth/refresh endpoint can
    reject access tokens that are mistakenly sent as refresh tokens.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(   # [FIX-S2]
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ── Token decoding ─────────────────────────────────────────────────────────────

def decode_token(token: str) -> Optional[dict]:        # [FIX-S3]
    """
    Decodes a JWT token.  Returns the payload dict or None if invalid/expired.
    Does NOT raise — callers check the return value.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError:
        return None