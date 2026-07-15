"""
settings.py — Admin-only system settings endpoints.

GET  /api/v1/settings   — return current settings (creates singleton row if absent)
PUT  /api/v1/settings   — persist settings (partial update — only sent fields written)

Both routes require admin or superadmin role.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import require_admin
from app.middleware.rate_limiter import limiter
from app.models.admin_settings import AdminSettings
from app.models.user import User
from app.schemas.settings import AdminSettingsResponse, AdminSettingsUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["Settings"])

_SINGLETON_ID = 1


async def _get_or_create(db: AsyncSession) -> AdminSettings:
    """
    Return the singleton settings row (id=1).
    Creates it with model defaults if it has never been saved before.
    """
    result = await db.execute(
        select(AdminSettings).where(AdminSettings.id == _SINGLETON_ID)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = AdminSettings(id=_SINGLETON_ID)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        logger.info("Admin settings row created with defaults (first use).")
    return row


@router.get("", response_model=AdminSettingsResponse)
@limiter.limit("60/minute")
async def get_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AdminSettingsResponse:
    """Return the current admin settings, creating the singleton row if absent."""
    row = await _get_or_create(db)
    return row


@router.put("", response_model=AdminSettingsResponse)
@limiter.limit("30/minute")
async def update_settings(
    request: Request,
    data: AdminSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> AdminSettingsResponse:
    """
    Persist admin settings.  Only fields present in the request body are
    written — absent/null fields are left unchanged (partial update).
    """
    row = await _get_or_create(db)

    updates = data.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No fields provided to update.",
        )

    for field, value in updates.items():
        setattr(row, field, value)

    try:
        await db.commit()
        await db.refresh(row)
    except Exception:
        await db.rollback()
        logger.error("Failed to persist admin settings", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while saving settings.",
        )

    logger.info(
        "Admin settings updated | user_id=%d | fields=%s",
        current_user.id,
        list(updates.keys()),
    )
    return row
