"""
notification_service.py — Snap2Fix
----------------------------------
Centralized notification service for:

• Database notification persistence
• Real-time WebSocket broadcasting
• BackgroundTasks support
• Reusable notification helpers

Usage inside routes:

    await notify(
        db,
        user_id=user.id,
        title="Report Verified",
        message="Your report has been verified.",
        type=NotificationType.success,
        report_id=report.id,
    )

Usage with BackgroundTasks:

    background_tasks.add_task(
        notify_background,
        user_id=user.id,
        title="Report Verified",
        message="Your report has been verified.",
        type=NotificationType.success,
        report_id=report.id,
    )
"""

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.enums import NotificationType
from app.models.notification import Notification

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Core Notification Creator
# ─────────────────────────────────────────────────────────────

async def notify(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    message: str,
    type: NotificationType = NotificationType.info,
    report_id: Optional[int] = None,
) -> Notification:
    """
    Create and persist a notification using an existing DB session.

    Use this inside routes/services where an active AsyncSession already exists.
    """

    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        report_id=report_id,
        is_read=False,
    )

    db.add(notif)

    try:
        await db.commit()
        await db.refresh(notif)

    except Exception:
        await db.rollback()
        logger.exception(
            "Failed to create notification for user_id=%d",
            user_id,
        )
        raise

    logger.info(
        "Notification created | user_id=%d | type=%s | report_id=%s",
        user_id,
        type.value,
        report_id,
    )

    # ─────────────────────────────────────────────────────────
    # Real-time WebSocket Broadcast
    # ─────────────────────────────────────────────────────────

    try:
        from app.routers.ws import manager

        await manager.send_to_user(
            user_id=user_id,
            data={
                "event": "notification",
                "id": notif.id,
                "title": notif.title,
                "message": notif.message,
                "type": notif.type.value,
                "report_id": notif.report_id,
                "is_read": notif.is_read,
                "created_at": notif.created_at.isoformat(),
            },
        )

        logger.info(
            "WebSocket notification sent to user_id=%d",
            user_id,
        )

    except Exception:
        logger.exception(
            "Failed to send WebSocket notification to user_id=%d",
            user_id,
        )

    return notif


# ─────────────────────────────────────────────────────────────
# Background Task Notification Creator
# ─────────────────────────────────────────────────────────────

async def notify_background(
    *,
    user_id: int,
    title: str,
    message: str,
    type: NotificationType = NotificationType.info,
    report_id: Optional[int] = None,
) -> None:
    try:
        async with AsyncSessionLocal() as db:
            notif = Notification(
                user_id=user_id,
                title=title,
                message=message,
                type=type,
                report_id=report_id,
                is_read=False,
            )
            db.add(notif)
            await db.commit()
            logger.info(f"Background notification created for user_id={user_id}")
    except Exception:
        logger.exception(f"Background notification failed for user_id={user_id}")


# ─────────────────────────────────────────────────────────────
# Convenience Notification Wrappers
# ─────────────────────────────────────────────────────────────

async def notify_verified(
    background_tasks,
    *,
    user_id: int,
    report_id: int,
) -> None:
    """
    Notify user that a report has been verified.
    """

    background_tasks.add_task(
        notify_background,
        user_id=user_id,
        title="Report Verified",
        message=(
            f"Your report #{report_id} "
            f"has been verified by an administrator."
        ),
        type=NotificationType.success,
        report_id=report_id,
    )


async def notify_declined(
    background_tasks,
    *,
    user_id: int,
    report_id: int,
    reason: str,
) -> None:
    """
    Notify user that a report has been declined.
    """

    background_tasks.add_task(
        notify_background,
        user_id=user_id,
        title="Report Declined",
        message=(
            f"Your report #{report_id} was declined. "
            f"Reason: {reason}"
        ),
        type=NotificationType.warning,
        report_id=report_id,
    )


async def notify_status_changed(
    background_tasks,
    *,
    user_id: int,
    report_id: int,
    new_status: str,
) -> None:
    """
    Notify user that report status has changed.
    """

    background_tasks.add_task(
        notify_background,
        user_id=user_id,
        title="Report Status Updated",
        message=(
            f"Your report #{report_id} "
            f"is now '{new_status}'."
        ),
        type=NotificationType.info,
        report_id=report_id,
    )


async def notify_comment_added(
    background_tasks,
    *,
    user_id: int,
    report_id: int,
    preview: str = "",
) -> None:
    """
    Notify user that an admin commented on their report.
    """

    msg = f"Admin commented on your report #{report_id}."

    if preview:
        truncated = preview[:80]
        suffix = "…" if len(preview) > 80 else ""

        msg += f' "{truncated}{suffix}"'

    background_tasks.add_task(
        notify_background,
        user_id=user_id,
        title="New Comment on Your Report",
        message=msg,
        type=NotificationType.info,
        report_id=report_id,
    )