from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import Field, field_validator

from app.models.enums import DamageType, ReportStatus, SeverityLevel
from app.schemas.base import AppBaseModel
from app.schemas.ai_detection_result import AIDetectionResultResponse
from app.schemas.media_attachment import MediaAttachmentResponse
from app.schemas.user import UserPublic


# ── Request schemas ────────────────────────────────────────────────────────────

class ReportCreate(AppBaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    barangay: Optional[str] = Field(None, max_length=100)
    street_name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

    @field_validator("latitude")
    @classmethod
    def valid_ph_latitude(cls, v: float) -> float:
        # Philippines bounding box: lat 4.5 – 21.5
        if not (4.5 <= v <= 21.5):
            raise ValueError("Latitude must be within the Philippines (4.5 – 21.5).")
        return v

    @field_validator("longitude")
    @classmethod
    def valid_ph_longitude(cls, v: float) -> float:
        # Philippines bounding box: lon 116.0 – 127.0
        if not (116.0 <= v <= 127.0):
            raise ValueError("Longitude must be within the Philippines (116.0 – 127.0).")
        return v


class ReportUpdate(AppBaseModel):
    """Admin/contractor only — citizens cannot change status directly."""
    status: Optional[ReportStatus] = None
    decline_reason: Optional[str] = Field(None, max_length=500)
    barangay: Optional[str] = Field(None, max_length=100)
    street_name: Optional[str] = Field(None, max_length=200)


# ── Response schemas ───────────────────────────────────────────────────────────

class ReportResponse(AppBaseModel):
    id: int
    owner: Optional[UserPublic] = None

    latitude: float
    longitude: float
    barangay: Optional[str] = None
    street_name: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None

    # AI results
    ai_damage_type: Optional[DamageType] = None
    ai_severity: Optional[SeverityLevel] = None
    ai_confidence: Optional[float] = None

    # Flags
    is_flagged_fake: bool
    fake_confidence: float
    is_potential_duplicate: bool

    status: ReportStatus
    decline_reason: Optional[str] = None

    upvote_count: int = 0          # computed in service layer, not a DB column
    view_count: int

    created_at: datetime
    updated_at: datetime

    media_attachments: List[MediaAttachmentResponse] = []
    ai_detections: List[AIDetectionResultResponse] = []


class ReportListResponse(AppBaseModel):
    """Paginated list wrapper."""
    total: int
    page: int
    page_size: int
    results: List[ReportResponse]