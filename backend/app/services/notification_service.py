"""
Notification service — creates in-app notifications and
broadcasts real-time updates via WebSocket manager.
"""
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationType
from app.models.notification import Notification


async def notify(
    db: AsyncSession,
    user_id: int,
    title: str,
    message: str,
    type: NotificationType = NotificationType.info,
    report_id: Optional[int] = None,
) -> Notification:
    """
    Create a notification using an existing session.
    Use this when you already have an open session in the same request.
    Do NOT pass this to BackgroundTasks — the session will be closed by then.
    """
    notif = Notification(
        user_id=user_id,
        report_id=report_id,
        title=title,
        message=message,
        type=type,
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)

    from app.routers.ws import manager
    await manager.send_to_user(
        user_id=user_id,
        data={
            "event": "notification",
            "id": notif.id,
            "title": title,
            "message": message,
            "type": type.value,
            "report_id": report_id,
        },
    )
    return notif


async def notify_background(
    user_id: int,
    title: str,
    message: str,
    type: NotificationType = NotificationType.info,
    report_id: Optional[int] = None,
) -> None:
    """
    FIX: Session-owning variant for use with BackgroundTasks.

    The request-scoped AsyncSession is closed before a BackgroundTask runs,
    so passing db=db from a router causes "session is closed" errors.
    This function opens its own session from AsyncSessionLocal instead.

    Usage in routers:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="...",
            message="...",
            type=NotificationType.info,
            report_id=report_id,
        )
    """
    import logging
    logger = logging.getLogger(__name__)

    from app.db.session import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await notify(db, user_id, title, message, type, report_id)
    except Exception as e:
        logger.error(f"notify_background failed for user_id={user_id}: {e}", exc_info=True)