# backend/app/routers/comments.py
"""
Comments router.
POST   /comments              — create comment or reply  → notifies recipient
PATCH  /comments/{id}         — edit own comment
DELETE /comments/{id}         — soft-delete (own or admin)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.comment import Comment
from app.models.enums import UserRole
from app.models.notification import Notification
from app.models.report import Report
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentResponse, CommentUpdate
from app.utils.logger import logger

router = APIRouter(prefix="/comments", tags=["Comments"])


# ─── helpers ──────────────────────────────────────────────────────────────────

async def _get_report(db: AsyncSession, report_id: int) -> Report:
    """Fetch report or raise 404."""
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return report


async def _get_last_admin_on_report(db: AsyncSession, report_id: int) -> int | None:
    """
    Return the user_id of the most-recent admin who commented on this report.
    Used so user replies route to the admin who is actively managing it.
    Falls back to None (caller decides what to do).
    """
    result = await db.execute(
        select(Comment)
        .join(User, Comment.user_id == User.id)
        .where(
            Comment.report_id == report_id,
            Comment.is_deleted.is_(False),
            User.role.in_([UserRole.admin, UserRole.superadmin]),
        )
        .order_by(Comment.created_at.desc())
    )
    last = result.scalars().first()
    return last.user_id if last else None


async def _push_ws(user_id: int, payload: dict) -> None:
    """
    Best-effort WebSocket push.  Never raises — HTTP response must not fail
    because a WS connection happens to be absent.
    """
    try:
        from app.routers.ws import manager          # lazy — avoids circular import
        await manager.send_to_user(user_id, payload)
    except Exception as exc:
        logger.warning("WS push skipped for user %s: %s", user_id, exc)


async def _create_and_push_notification(
    db: AsyncSession,
    *,
    recipient_id: int,
    report_id: int,
    title: str,
    message: str,
    notif_type: str = "comment",
) -> None:
    """
    Persist a Notification row, flush it to get an id, then attempt a
    real-time WebSocket push.  Wrapped in try/except so a DB hiccup here
    never rolls back the comment that was already committed.
    """
    try:
        notif = Notification(
            user_id=recipient_id,
            report_id=report_id,
            title=title,
            message=message,
            type=notif_type,
            is_read=False,
        )
        db.add(notif)
        await db.commit()
        await db.refresh(notif)

        await _push_ws(recipient_id, {
            "event":      "notification",
            "id":         notif.id,
            "title":      notif.title,
            "message":    notif.message,
            "type":       notif.type,
            "report_id":  notif.report_id,
            "is_read":    False,
            "created_at": notif.created_at.isoformat(),
        })

    except Exception as exc:
        # Notification failure must never break the comment flow
        logger.error(
            "Failed to create/push notification (report=%s, recipient=%s): %s",
            report_id, recipient_id, exc,
        )


# ─── routes ───────────────────────────────────────────────────────────────────

@router.post("", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ── 1. validate parent (if reply) ────────────────────────────────────────
    if data.parent_comment_id:
        result = await db.execute(
            select(Comment).where(Comment.id == data.parent_comment_id)
        )
        parent = result.scalar_one_or_none()
        if not parent or parent.report_id != data.report_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent comment.",
            )

    # ── 2. fetch report (need owner id + report number for notif message) ────
    report = await _get_report(db, data.report_id)

    # ── 3. persist comment ───────────────────────────────────────────────────
    comment = Comment(
        report_id=data.report_id,
        user_id=current_user.id,
        content=data.content,
        parent_comment_id=data.parent_comment_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    # ── 4. send notification to the other party ──────────────────────────────
    is_admin = current_user.role in (UserRole.admin, UserRole.superadmin)
    report_label = f"#{str(data.report_id).zfill(3)}"
    preview = data.content[:80] + ("…" if len(data.content) > 80 else "")

    if is_admin:
        # Admin → notify the citizen who owns the report
        recipient_id = report.user_id

        # Don't notify if the admin is commenting on their own report
        # (edge case: admin filed a report themselves)
        if recipient_id != current_user.id:
            await _create_and_push_notification(
                db,
                recipient_id=recipient_id,
                report_id=data.report_id,
                title=f"New note on your report {report_label}",
                message=f"{current_user.full_name}: \"{preview}\"",
                notif_type="comment",
            )
    else:
        # Citizen → notify the last admin who engaged, else skip
        # (admins poll or use WS; no admin yet means no one to ping)
        admin_id = await _get_last_admin_on_report(db, data.report_id)
        if admin_id and admin_id != current_user.id:
            await _create_and_push_notification(
                db,
                recipient_id=admin_id,
                report_id=data.report_id,
                title=f"User replied on report {report_label}",
                message=f"{current_user.full_name}: \"{preview}\"",
                notif_type="comment",
            )

    return comment


@router.patch("/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: int,
    data: CommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()

    if not comment or comment.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit another user's comment.")

    comment.content = data.content
    await db.commit()
    await db.refresh(comment)
    return comment


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()

    if not comment or comment.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")

    is_owner = comment.user_id == current_user.id
    is_admin = current_user.role in (UserRole.admin, UserRole.superadmin)

    if not is_owner and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    comment.is_deleted = True
    comment.content = "[deleted]"
    await db.commit()