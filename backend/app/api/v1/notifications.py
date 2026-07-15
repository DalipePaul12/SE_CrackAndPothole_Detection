import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user, require_admin
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SendNotificationRequest(BaseModel):
    user_id:   int
    report_id: int | None = None
    title:     str
    message:   str
    type:      str = "info"


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
# FIXED ROUTES (NO path parameters) — MUST be declared FIRST
# ══════════════════════════════════════════════════════════════════════════════

@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    limit: int = Query(default=50, ge=1, le=100),
    unread_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List notifications for current user.

    Query params:
    - limit: Max notifications to return (1-100, default 50)
    - unread_only: If true, only return unread notifications
    """
    query = select(Notification).where(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc())

    if unread_only:
        query = query.where(Notification.is_read == False)  # noqa: E712

    result = await db.execute(query.limit(limit))
    return result.scalars().all()


@router.get("/count")
async def get_notification_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get unread and total notification counts using COUNT(*) — no full-row fetch."""
    unread_count, total_count = (
        await db.execute(
            select(
                func.count(Notification.id).filter(Notification.is_read == False).label("unread"),  # noqa: E712
                func.count(Notification.id).label("total"),
            ).where(Notification.user_id == current_user.id)
        )
    ).one()
    return {
        "unread_count": unread_count,
        "total_count":  total_count,
    }


@router.post("/send", status_code=status.HTTP_201_CREATED)
async def send_notification(
    data: SendNotificationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Admin-only: send a notification directly to any user.
    Used by Manage Reports, Manage Requests, and All Reports pages
    to message report submitters.
    """
    try:
        notif_type = NotificationType[data.type]
    except KeyError:
        notif_type = NotificationType.info

    notif = Notification(
        user_id=data.user_id,
        report_id=data.report_id,
        title=data.title,
        message=data.message,
        type=notif_type,
        is_read=False,
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)
    logger.info(
        "Admin %d sent notification to user %d | report_id=%s | title=%r",
        current_user.id, data.user_id, data.report_id, data.title,
    )
    return {"success": True, "id": notif.id}


@router.patch("/read-all", status_code=status.HTTP_200_OK)
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all notifications as read."""
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
async def clear_all_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all notifications for current user."""
    await db.execute(
        delete(Notification).where(Notification.user_id == current_user.id)
    )
    await db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# PARAMETERIZED ROUTES — MUST come after all fixed routes
# ══════════════════════════════════════════════════════════════════════════════

@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark single notification as read."""
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
    """Delete single notification."""
    notification = await _get_notification_or_404(db, notification_id, current_user.id)
    await db.delete(notification)
    await db.commit()