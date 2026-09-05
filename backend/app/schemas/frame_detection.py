from datetime import datetime
from typing import Optional

from pydantic import Field

from app.schemas.base import AppBaseModel


# ── Input: one filmstrip snapshot the frontend already rendered ─────────────
# Matches ml_service._select_diverse_snapshots() output / DetectionFilmstrip
# snapshot shape exactly, so CreateReport.jsx can forward `detectionSnapshots`
# as-is without any reshaping.
class FrameSnapshotIn(AppBaseModel):
    frame:              int
    timestamp_seconds:  Optional[float] = None
    label:              str             = Field(..., max_length=50)
    confidence:         float           = Field(..., ge=0.0, le=1.0)
    image_b64:          str             # raw base64 JPEG, no data: prefix


# ── Output: a saved snapshot as returned in ReportResponse ──────────────────
class FrameDetectionResponse(AppBaseModel):
    id:                 int
    frame_index:        int
    damage_type:        str
    confidence:         float
    image_url:          Optional[str] = None
    timestamp_seconds:  Optional[float] = None
    created_at:         datetime