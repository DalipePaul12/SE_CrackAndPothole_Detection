from datetime import datetime
from typing import Any, Dict, List, Optional

from app.models.enums import DamageType, SeverityLevel
from app.schemas.base import AppBaseModel


class AIDetectionResultResponse(AppBaseModel):
    id: int
    media_attachment_id: Optional[int] = None
    detected_class: DamageType
    severity: Optional[SeverityLevel] = None
    confidence: float
    bounding_boxes: Optional[List[Dict[str, Any]]] = None
    model_version: Optional[str] = None
    inference_time_ms: Optional[float] = None
    created_at: datetime