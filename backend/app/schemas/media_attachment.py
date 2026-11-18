from datetime import datetime
from typing import Optional

from app.models.enums import MediaType
from app.schemas.base import AppBaseModel


class MediaAttachmentResponse(AppBaseModel):
    id: int
    file_url: str
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    attachment_type: Optional[str] = None
    detections: list[dict] = []
    media_type: MediaType
    is_ai_generated: Optional[bool] = False
    ai_generated_confidence: Optional[float] = None
    ai_generated_model_used: Optional[str] = None
    is_processed: Optional[bool] = False
    created_at: datetime
