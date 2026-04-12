"""
Comments router.
POST   /comments              — create comment or reply
PATCH  /comments/{id}         — edit own comment
DELETE /comments/{id}         — soft-delete (own or admin)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user, require_admin
from app.models.comment import Comment
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentResponse, CommentUpdate

router = APIRouter(prefix="/comments", tags=["Comments"])


@router.post("", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate parent comment belongs to same report
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

    comment = Comment(
        report_id=data.report_id,
        user_id=current_user.id,
        content=data.content,
        parent_comment_id=data.parent_comment_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
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
    is_admin = current_user.role == UserRole.admin

    if not is_owner and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    comment.is_deleted = True
    comment.content = "[deleted]"
    await db.commit()