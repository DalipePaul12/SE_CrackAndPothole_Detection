from datetime import datetime
from typing import Optional

from pydantic import AnyUrl, Field

from app.schemas.base import AppBaseModel
from app.schemas.user import UserPublic


class CCTVCreate(AppBaseModel):
    location_name: str = Field(..., min_length=2, max_length=200)
    barangay: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    latitude: float = Field(..., ge=4.5, le=21.5)
    longitude: float = Field(..., ge=116.0, le=127.0)
    stream_url: AnyUrl  # validates rtsp:// or http:// format


class CCTVUpdate(AppBaseModel):
    location_name: Optional[str] = Field(None, min_length=2, max_length=200)
    stream_url: Optional[AnyUrl] = None
    is_active: Optional[bool] = None
    last_maintenance: Optional[datetime] = None


class CCTVResponse(AppBaseModel):
    id: int
    location_name: str
    barangay: Optional[str] = None
    city: Optional[str] = None
    latitude: float
    longitude: float
    stream_url: str
    is_active: bool
    added_by: Optional[UserPublic] = None
    last_maintenance: Optional[datetime] = None
    last_detection_at: Optional[datetime] = None
    created_at: datetime