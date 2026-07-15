import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.revoked_token import RevokedToken
from app.models.user import User

logger = logging.getLogger(__name__)

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
    payload = decode_token(credentials.credentials)

    if payload is None:
        raise _CREDENTIALS_EXCEPTION

    # Enforce token type so old tokens cannot be replayed after migration.
    # New tokens from auth_service.create_access_token must set type="access".
    if payload.get("type") != "access":
        raise _CREDENTIALS_EXCEPTION

    # Fail closed: a token with no jti cannot be revoked, so we reject it
    # outright rather than silently skipping the revocation check.
    # create_access_token always embeds a jti; absence means a hand-crafted
    # or legacy token — neither should be trusted.
    jti: str | None = payload.get("jti")
    if not jti:
        raise _CREDENTIALS_EXCEPTION

    revoked = await db.execute(
        select(RevokedToken).where(RevokedToken.jti == jti)
    )
    if revoked.scalar_one_or_none():
        raise _CREDENTIALS_EXCEPTION

    # sub = user.public_id (UUID string) set by auth_service.create_access_token
    public_id: str | None = payload.get("sub")
    if not public_id:
        raise _CREDENTIALS_EXCEPTION

    result = await db.execute(
        select(User).where(User.public_id == public_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise _CREDENTIALS_EXCEPTION

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support.",
        )

    return user


async def require_admin(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action.",
        )

    # ── Enforce allowed_admin_ips ─────────────────────────────────────────────
    # If the setting is non-empty, only listed IPs may access admin routes.
    from app.models.admin_settings import AdminSettings
    result = await db.execute(select(AdminSettings).where(AdminSettings.id == 1))
    cfg = result.scalar_one_or_none()
    if cfg:
        allowed_str = (cfg.allowed_admin_ips or "").strip()
        if allowed_str:
            allowed_ips = {ip.strip() for ip in allowed_str.split(",") if ip.strip()}
            if allowed_ips:
                forwarded = request.headers.get("X-Forwarded-For", "")
                client_ip = (
                    forwarded.split(",")[0].strip()
                    if forwarded
                    else (request.client.host if request.client else "")
                )
                if client_ip not in allowed_ips:
                    logger.warning(
                        "Admin access denied: ip=%s not in allowlist | user_id=%d",
                        client_ip, current_user.id,
                    )
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied: your IP address is not permitted for admin access.",
                    )

    return current_user


async def require_admin_or_contractor(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role not in (UserRole.admin, UserRole.superadmin, UserRole.contractor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action.",
        )
    return current_user