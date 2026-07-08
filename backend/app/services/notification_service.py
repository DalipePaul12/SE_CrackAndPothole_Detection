from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.utils.logger import logger


async def notify(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    message: str,
    type: NotificationType = NotificationType.info,
    report_id: Optional[int] = None,
) -> Notification:
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
        logger.exception("Failed to create notification for user_id=%d", user_id)
        raise

    logger.info(
        "Notification created | user_id=%d | type=%s | report_id=%s",
        user_id,
        type.value,
        report_id,
    )

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

        logger.info("WebSocket notification sent to user_id=%d", user_id)

    except Exception:
        logger.exception("Failed to send WebSocket notification to user_id=%d", user_id)

    # ── Send email notification (best-effort, never blocks) ───────────────────
    try:
        from sqlalchemy import select
        from app.models.user import User
        from app.services.email_service import send_notification_email

        result = await db.execute(select(User.email).where(User.id == user_id))
        email = result.scalar_one_or_none()
        if email:
            await send_notification_email(
                email=email,
                title=title,
                message=message,
                report_id=report_id,
            )
    except Exception:
        logger.exception("Failed to send notification email to user_id=%d", user_id)

    return notif


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
            logger.info("Background notification created for user_id=%d", user_id)

            # ── Send email notification ─────────────────────────────────
            try:
                from sqlalchemy import select
                from app.models.user import User
                from app.services.email_service import send_notification_email

                result = await db.execute(select(User.email).where(User.id == user_id))
                email = result.scalar_one_or_none()
                if email:
                    await send_notification_email(
                        email=email,
                        title=title,
                        message=message,
                        report_id=report_id,
                    )
            except Exception:
                logger.exception("Background email failed for user_id=%d", user_id)

    except Exception:
        logger.exception("Background notification failed for user_id=%d", user_id)


async def notify_verified(
    background_tasks,
    *,
    user_id: int,
    report_id: int,
) -> None:
    background_tasks.add_task(
        notify_background,
        user_id=user_id,
        title="Report Verified",
        message=f"Your report #{report_id} has been verified by an administrator.",
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
    background_tasks.add_task(
        notify_background,
        user_id=user_id,
        title="Report Declined",
        message=f"Your report #{report_id} was declined. Reason: {reason}",
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
    background_tasks.add_task(
        notify_background,
        user_id=user_id,
        title="Report Status Updated",
        message=f"Your report #{report_id} is now '{new_status}'.",
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
    msg = f"Admin commented on your report #{report_id}."

    if preview:
        truncated = preview[:80]
        suffix = "..." if len(preview) > 80 else ""
        msg += f' "{truncated}{suffix}"'

    background_tasks.add_task(
        notify_background,
        user_id=user_id,
        title="New Comment on Your Report",
        message=msg,
        type=NotificationType.info,
        report_id=report_id,
    )