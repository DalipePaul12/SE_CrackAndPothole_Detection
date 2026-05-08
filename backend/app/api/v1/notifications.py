# app/api/v1/notifications.py
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationResponse

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ── Helper ────────────────────────────────────────────────────────────────────
async def _get_notification_or_404(
    db: AsyncSession,
    notification_id: int,
    user_id: int,
) -> Notification:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    return notification


# ══════════════════════════════════════════════════════════════════════════════
# CRITICAL: All fixed-path routes MUST come before /{notification_id} routes.
# FastAPI matches top-to-bottom. If /{notification_id} is first, it will
# capture "read-all" and "clear-all" as integer IDs → 422 Unprocessable Entity.
# ══════════════════════════════════════════════════════════════════════════════

# ── Fixed routes (NO path parameters) — MUST be declared first ───────────────

@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.patch("/read-all", status_code=status.HTTP_200_OK)
# ↑ FIXED PATH — must be before /{notification_id}
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True, read_at=now)
    )
    await db.commit()
    return {"success": True, "message": "All notifications marked as read."}


@router.delete("/clear-all", status_code=status.HTTP_204_NO_CONTENT)
# ↑ FIXED PATH — must be before /{notification_id}
async def clear_all_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        delete(Notification).where(Notification.user_id == current_user.id)
    )
    await db.commit()


# ── Parameterized routes — MUST come after all fixed routes ──────────────────

@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = await _get_notification_or_404(db, notification_id, current_user.id)
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(notification)
    return notification


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = await _get_notification_or_404(db, notification_id, current_user.id)
    await db.delete(notification)
    await db.commit()