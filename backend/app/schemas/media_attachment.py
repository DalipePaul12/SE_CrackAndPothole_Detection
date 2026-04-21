from datetime import datetime
from typing import Optional

from app.models.enums import MediaType
from app.schemas.base import AppBaseModel


class MediaAttachmentResponse(AppBaseModel):
    id: int
    file_url: str
    file_name: Optional[str] = None
    file_size_bytes: Optional[int] = None
    media_type: MediaType
    is_ai_generated: bool
    ai_generated_confidence: Optional[float] = None  # FIX: was float, crashes when DB value is NULL
    ai_generated_model_used: Optional[str] = None
    is_processed: bool
    created_at: datetime