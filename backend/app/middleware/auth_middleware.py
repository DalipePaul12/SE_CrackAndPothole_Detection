"""
Auth middleware — FastAPI dependencies for JWT verification and RBAC.
Use these as Depends() in route functions to protect endpoints.
"""
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.services.auth_service import decode_access_token
from app.services.user_service import get_by_public_id

bearer_scheme = HTTPBearer(auto_error=True)

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired token.",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decodes JWT and returns the authenticated User ORM object."""
    try:
        payload = decode_access_token(credentials.credentials)
        public_id: Optional[str] = payload.get("sub")
        token_type: Optional[str] = payload.get("type")

        if not public_id or token_type != "access":
            raise _CREDENTIALS_EXCEPTION

    except JWTError:
        raise _CREDENTIALS_EXCEPTION

    user = await get_by_public_id(db, UUID(public_id))

    if not user:
        raise _CREDENTIALS_EXCEPTION
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated.",
        )
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before continuing.",
        )
    return user


async def get_current_user_unverified(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Same as get_current_user but allows unverified accounts.
    Use only for the email verification endpoint itself.
    """
    try:
        payload = decode_access_token(credentials.credentials)
        public_id: Optional[str] = payload.get("sub")
        if not public_id:
            raise _CREDENTIALS_EXCEPTION
    except JWTError:
        raise _CREDENTIALS_EXCEPTION

    user = await get_by_public_id(db, UUID(public_id))
    if not user or not user.is_active:
        raise _CREDENTIALS_EXCEPTION
    return user


# ── RBAC role guards ───────────────────────────────────────────────────────────

def require_role(*roles: UserRole):
    """
    Factory that returns a dependency requiring one of the given roles.

    Usage:
        @router.delete("/users/{id}", dependencies=[Depends(require_role(UserRole.admin))])
    """
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user
    return _check


# ── Shorthand dependencies ─────────────────────────────────────────────────────

require_admin = require_role(UserRole.admin)
require_admin_or_contractor = require_role(UserRole.admin, UserRole.contractor)