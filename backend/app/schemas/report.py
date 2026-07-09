

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import DamageType, ReportStatus, ReportType, SeverityLevel
from app.schemas.base import AppBaseModel
from app.schemas.media_attachment import MediaAttachmentResponse
from app.schemas.user import UserPublic


# ─────────────────────────────────────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────────────────────────────────────

class ReportCreate(AppBaseModel):
    # ── Location ──────────────────────────────────────────────────────────────
    latitude:    float = Field(..., ge=-90.0,   le=90.0)
    longitude:   float = Field(..., ge=-180.0,  le=180.0)
    barangay:    Optional[str] = Field(None, max_length=100)
    street_name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

    # ── ML results ────────────────────────────────────────────────────────────
    ai_damage_type: Optional[DamageType]    = None
    ai_severity:    Optional[SeverityLevel] = None
    ai_confidence:  Optional[float]         = Field(None, ge=0.0, le=1.0)

    # ── Legacy AI fake detection ──────────────────────────────────────────────
    is_flagged_fake: bool          = False
    fake_confidence: Optional[float] = Field(0.0, ge=0.0, le=1.0)

# ── Structured AI validation audit ────────────────────────────────────────
    ai_validation_status:     Optional[str]   = None
    ai_validation_confidence: Optional[float] = None
    ai_validation_model:      Optional[str]   = None

    # ── AI-generated summary (Gemini/Groq) ────────────────────────────────────
    ai_summary:              Optional[str]      = None
    ai_summary_generated_at: Optional[datetime] = None

    # ── Capture metadata ──────────────────────────────────────────────────────
    capture_metadata: Optional[dict] = None

    # ── Admin review flags ────────────────────────────────────────────────────
    requires_admin_review: bool          = False
    review_reason:         Optional[str] = Field(None, max_length=500)

    # ── Legal disclaimer ──────────────────────────────────────────────────────
    disclaimer_accepted: bool = False

    # ── Video / hybrid ────────────────────────────────────────────────────────
    report_type:      ReportType           = ReportType.image
    video_path:       Optional[str]        = None
    is_hybrid:        bool                 = False
    secondary_damage: Optional[DamageType] = None
    detection_note:   Optional[str]        = Field(None, max_length=500)

    # ── Philippine coordinate validation ──────────────────────────────────────
    @field_validator("latitude")
    @classmethod
    def valid_ph_latitude(cls, v: float) -> float:
        if not (4.5 <= v <= 21.5):
            raise ValueError(
                "Latitude must be within the Philippines (4.5 – 21.5)."
            )
        return v

    @field_validator("longitude")
    @classmethod
    def valid_ph_longitude(cls, v: float) -> float:
        if not (116.0 <= v <= 127.0):
            raise ValueError(
                "Longitude must be within the Philippines (116.0 – 127.0)."
            )
        return v

    # FIX: enforce disclaimer acceptance at the schema level so it can never
    #      be bypassed by a raw API call even if the frontend checkbox is skipped.
    @field_validator("disclaimer_accepted")
    @classmethod
    def must_accept_disclaimer(cls, v: bool) -> bool:
        if not v:
            raise ValueError(
                "You must accept the legal disclaimer to submit a report."
            )
        return v


# ─────────────────────────────────────────────────────────────────────────────
# UPDATE  (admin / contractor)
# ─────────────────────────────────────────────────────────────────────────────

class ReportUpdate(AppBaseModel):
    status:           Optional[ReportStatus] = None
    decline_reason:   Optional[str]          = Field(None, max_length=500)
    rejection_reason: Optional[str]          = Field(None, max_length=500)
    barangay:         Optional[str]          = Field(None, max_length=100)
    street_name:      Optional[str]          = Field(None, max_length=200)
    description:      Optional[str]          = Field(None, max_length=1000)
    assigned_to:      Optional[str]          = Field(None, max_length=200)

    # Admin review controls
    requires_admin_review: Optional[bool] = None
    review_reason:         Optional[str]  = Field(None, max_length=500)


# FIX: replaced Form(...) in the decline endpoint with a proper JSON body model
#      so all mutation endpoints are consistently application/json.
class DeclineRequest(AppBaseModel):
    """Body for PUT /{report_id}/decline"""
    reason: str = Field(..., min_length=5, max_length=500)


# ─────────────────────────────────────────────────────────────────────────────
# RESPONSE
# ─────────────────────────────────────────────────────────────────────────────

class ReportResponse(AppBaseModel):
    """
    Returned by every report endpoint.

    All fields must have a corresponding column or @hybrid_property on the
    Report ORM model, otherwise model_validate() raises AttributeError → 500.
    """

    id:    int
    owner: Optional[UserPublic] = None

    # ── Location ──────────────────────────────────────────────────────────────
    latitude:    float
    longitude:   float
    barangay:    Optional[str] = None
    street_name: Optional[str] = None
    description: Optional[str] = None

    # FIX: image_url is now backed by a @hybrid_property on Report so
    #      model_validate no longer throws AttributeError.
    image_url: Optional[str] = None

    # ── ML results ────────────────────────────────────────────────────────────
    ai_damage_type: Optional[DamageType]    = None
    ai_severity:    Optional[SeverityLevel] = None
    ai_confidence:  Optional[float]         = None

    # ── AI fake detection ─────────────────────────────────────────────────────
    is_flagged_fake:          bool           = False
    fake_confidence:          Optional[float] = None
    is_potential_duplicate:   bool           = False

    # ── Structured AI validation audit ────────────────────────────────────────
    ai_validation_status:     Optional[str]   = None
    ai_validation_confidence: Optional[float] = None
    ai_validation_model:      Optional[str]   = None

    # ── Capture metadata ──────────────────────────────────────────────────────
    capture_metadata: Optional[dict] = None

    # ── Admin review flags ────────────────────────────────────────────────────
    requires_admin_review: bool          = False
    review_reason:         Optional[str] = None

    # ── Disclaimer ────────────────────────────────────────────────────────────
    disclaimer_accepted: bool = False

    # ── Video / hybrid ────────────────────────────────────────────────────────
    report_type:      ReportType           = ReportType.image
    video_path:       Optional[str]        = None
    is_hybrid:        bool                 = False
    secondary_damage: Optional[DamageType] = None
    detection_note:   Optional[str]        = None

    # ── Status ────────────────────────────────────────────────────────────────
    status:         ReportStatus
    decline_reason: Optional[str] = None

    upvote_count: int = 0
    view_count:   int

    created_at: datetime
    updated_at: datetime

    media_attachments: List[MediaAttachmentResponse] = []


# ─────────────────────────────────────────────────────────────────────────────
# LIST RESPONSE  (paginated)
# ─────────────────────────────────────────────────────────────────────────────

class ReportListResponse(AppBaseModel):
    total:     int
    page:      int
    page_size: int
    results:   List[ReportResponse]