from datetime import datetime
from typing import List, Optional

from pydantic import Field

from app.schemas.base import AppBaseModel
from app.schemas.user import UserPublic


class CommentCreate(AppBaseModel):
    report_id: int
    content: str = Field(..., min_length=1, max_length=1000)
    parent_comment_id: Optional[int] = None


class CommentUpdate(AppBaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


class CommentResponse(AppBaseModel):
    id: int
    report_id: int
    user: Optional[UserPublic] = None
    content: str
    is_deleted: bool
    parent_comment_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    replies: List["CommentResponse"] = []


# Required for self-referential model
CommentResponse.model_rebuild()