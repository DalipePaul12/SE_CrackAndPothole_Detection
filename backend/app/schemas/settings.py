"""Pydantic schemas for the admin settings endpoint."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AdminSettingsResponse(BaseModel):
    """Shape returned by GET /settings and PUT /settings."""

    # General
    org_name:      str
    municipality:  str
    timezone:      str
    contact_email: str

    # Reports & SLA (scheduling fields removed — no background scheduler exists)
    default_severity: str

    # Map (map_provider removed — AdminMapView has its own tile picker)
    default_lat:  float
    default_lng:  float
    default_zoom: int

    # Notifications (sms_alerts removed — no SMS provider)
    email_alerts:         bool
    push_alerts:          bool
    digest_frequency:     str
    critical_alert_sound: bool

    # Security (data_retention_days removed — no purge job)
    require_2fa:               bool
    password_min_length:       int
    session_timeout:           int
    allow_public_registration: bool

    # Maintenance
    maintenance_mode:    bool
    maintenance_message: str
    allowed_admin_ips:   str
    # api_key is intentionally excluded — it must never travel over the wire in
    # plaintext.  It is stored in the DB and used server-side only.

    # Audit
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AdminSettingsUpdate(BaseModel):
    """All fields optional — only supplied keys are written to the DB."""

    # General
    org_name:      Optional[str] = None
    municipality:  Optional[str] = None
    timezone:      Optional[str] = None
    contact_email: Optional[str] = None

    # Reports & SLA
    default_severity: Optional[str] = None

    # Map
    default_lat:  Optional[float] = None
    default_lng:  Optional[float] = None
    default_zoom: Optional[int]   = Field(None, ge=1, le=20)

    # Notifications
    email_alerts:         Optional[bool] = None
    push_alerts:          Optional[bool] = None
    digest_frequency:     Optional[str]  = None
    critical_alert_sound: Optional[bool] = None

    # Security
    require_2fa:               Optional[bool] = None
    password_min_length:       Optional[int]  = Field(None, ge=6, le=64)
    session_timeout:           Optional[int]  = Field(None, ge=5, le=1440)
    allow_public_registration: Optional[bool] = None

    # Maintenance
    maintenance_mode:    Optional[bool] = None
    maintenance_message: Optional[str]  = None
    allowed_admin_ips:   Optional[str]  = None
    # api_key is not settable through this endpoint — rotate it server-side only.
