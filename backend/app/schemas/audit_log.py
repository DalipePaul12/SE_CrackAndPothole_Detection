from datetime import datetime
from typing import Any, List, Optional

from app.schemas.base import AppBaseModel


class AuditLogResponse(AppBaseModel):
    id:                int
    user_id:           Optional[int]
    performed_by_role: Optional[str]
    action:            str
    target_resource:   Optional[str]
    target_id:         Optional[int]
    details:           Optional[Any]   # JSON blob — shape varies per action
    ip_address:        Optional[str]
    user_agent:        Optional[str]
    timestamp:         datetime


class AuditLogListResponse(AppBaseModel):
    total:     int
    page:      int
    page_size: int
    results:   List[AuditLogResponse]
