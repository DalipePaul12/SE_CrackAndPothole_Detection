from datetime import datetime
from typing import List, Optional

from pydantic import Field, field_validator

from app.models.enums import DamageType, ReportStatus, SeverityLevel
from app.schemas.base import AppBaseModel
from app.schemas.media_attachment import MediaAttachmentResponse
from app.schemas.user import UserPublic

# AIDetectionResultResponse import removed — ai_detections is excluded from
# ReportResponse until selectinload(Report.ai_detections) is restored in the
# router. Accessing the unloaded relationship via Pydantic triggers a
# MissingGreenlet crash in async SQLAlchemy.


class ReportCreate(AppBaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    barangay: Optional[str] = Field(None, max_length=100)
    street_name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

    ai_damage_type: Optional[DamageType] = None
    ai_severity: Optional[SeverityLevel] = None
    ai_confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    is_flagged_fake: bool = False
    fake_confidence: Optional[float] = Field(0.0, ge=0.0, le=1.0)

    @field_validator("latitude")
    @classmethod
    def valid_ph_latitude(cls, v: float) -> float:
        if not (4.5 <= v <= 21.5):
            raise ValueError("Latitude must be within the Philippines (4.5 – 21.5).")
        return v

    @field_validator("longitude")
    @classmethod
    def valid_ph_longitude(cls, v: float) -> float:
        if not (116.0 <= v <= 127.0):
            raise ValueError("Longitude must be within the Philippines (116.0 – 127.0).")
        return v


class ReportUpdate(AppBaseModel):
    status: Optional[ReportStatus] = None
    decline_reason: Optional[str] = Field(None, max_length=500)
    barangay: Optional[str] = Field(None, max_length=100)
    street_name: Optional[str] = Field(None, max_length=200)


class ReportResponse(AppBaseModel):
    id: int
    owner: Optional[UserPublic] = None

    latitude: float
    longitude: float
    barangay: Optional[str] = None
    street_name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None

    ai_damage_type: Optional[DamageType] = None
    ai_severity: Optional[SeverityLevel] = None
    ai_confidence: Optional[float] = None

    is_flagged_fake: bool
    fake_confidence: float
    is_potential_duplicate: bool

    status: ReportStatus
    decline_reason: Optional[str] = None

    upvote_count: int = 0
    view_count: int

    created_at: datetime
    updated_at: datetime

    media_attachments: List[MediaAttachmentResponse] = []
    # ai_detections intentionally excluded — restore after adding
    # selectinload(Report.ai_detections) back to _fetch_report_or_404


class ReportListResponse(AppBaseModel):
    total: int
    page: int
    page_size: int
    results: List[ReportResponse]