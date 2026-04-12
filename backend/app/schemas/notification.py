from datetime import datetime
from typing import Optional

from app.models.enums import NotificationType
from app.schemas.base import AppBaseModel


class NotificationUpdate(AppBaseModel):
    is_read: bool = True


class NotificationResponse(AppBaseModel):
    id: int
    report_id: Optional[int] = None
    title: str
    message: str
    type: NotificationType
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime