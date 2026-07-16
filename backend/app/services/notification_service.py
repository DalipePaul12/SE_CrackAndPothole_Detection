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
    email: Optional[str] = None,
    # ^^^ Pre-fetch the user's email with a single batched query (e.g.
    # User.id.in_(ids)) and pass it here when calling notify() in a loop.
    # If omitted, notify() issues its own SELECT per call, which becomes an
    # N+1 if called in a loop.
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

    # ── Respect admin push_alerts / email_alerts settings ────────────────────
    # Fail open: if settings are unavailable, always deliver (never silence).
    try:
        from sqlalchemy import select as _sel
        from app.models.admin_settings import AdminSettings as _AS
        _cfg      = (await db.execute(_sel(_AS).where(_AS.id == 1))).scalar_one_or_none()
        _push_on  = _cfg.push_alerts  if _cfg is not None else True
        _email_on = _cfg.email_alerts if _cfg is not None else True
    except Exception:
        _push_on = _email_on = True

    if _push_on:
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
    if _email_on:
        try:
            from app.services.email_service import send_notification_email

            resolved_email = email
            if resolved_email is None:
                # Per-call SELECT — acceptable for single-user paths.  If this
                # function is ever called in a loop, pre-fetch all emails with one
                # User.id.in_(ids) query and pass email= to avoid N+1.
                from sqlalchemy import select
                from app.models.user import User
                result = await db.execute(select(User.email).where(User.id == user_id))
                resolved_email = result.scalar_one_or_none()
            if resolved_email:
                await send_notification_email(
                    email=resolved_email,
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
    email: Optional[str] = None,
    # ^^^ Pre-fetch the user's email with a single batched query (e.g.
    # User.id.in_(ids)) and pass it here when scheduling notify_background()
    # in a loop.  If omitted, this function issues its own SELECT per call,
    # which becomes an N+1 if looped without batching.
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
            await db.refresh(notif)  # populate id + created_at for WS payload
            logger.info("Background notification created for user_id=%d", user_id)

            # ── Respect push_alerts / email_alerts admin settings ─────────────
            # Fail open: if AdminSettings is unavailable, always deliver.
            try:
                from sqlalchemy import select as _sel
                from app.models.admin_settings import AdminSettings as _AS
                _cfg      = (await db.execute(_sel(_AS).where(_AS.id == 1))).scalar_one_or_none()
                _push_on  = _cfg.push_alerts  if _cfg is not None else True
                _email_on = _cfg.email_alerts if _cfg is not None else True
            except Exception:
                _push_on = _email_on = True  # fail open

            # ── WebSocket push (mirrors notify() lines 62-83) ─────────────────
            if _push_on:
                try:
                    from app.routers.ws import manager

                    await manager.send_to_user(
                        user_id=user_id,
                        data={
                            "event":      "notification",
                            "id":         notif.id,
                            "title":      notif.title,
                            "message":    notif.message,
                            "type":       notif.type.value,
                            "report_id":  notif.report_id,
                            "is_read":    notif.is_read,
                            "created_at": notif.created_at.isoformat(),
                        },
                    )
                    logger.info("Background WS notification sent to user_id=%d", user_id)
                except Exception:
                    logger.exception(
                        "Background WS push failed for user_id=%d (notification still saved)",
                        user_id,
                    )

            if _email_on:
                # ── Send email notification ─────────────────────────────────
                try:
                    from app.services.email_service import send_notification_email

                    resolved_email = email
                    if resolved_email is None:
                        # Per-call SELECT — acceptable for single-user paths.  If
                        # this task is ever scheduled in a loop, pre-fetch all
                        # emails with one User.id.in_(ids) query and pass email=.
                        from sqlalchemy import select
                        from app.models.user import User
                        result = await db.execute(
                            select(User.email).where(User.id == user_id)
                        )
                        resolved_email = result.scalar_one_or_none()
                    if resolved_email:
                        await send_notification_email(
                            email=resolved_email,
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