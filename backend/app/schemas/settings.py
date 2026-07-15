"""Pydantic schemas for the admin settings endpoint."""
from typing import Optional

from pydantic import BaseModel, Field


class AdminSettingsResponse(BaseModel):
    """Shape returned by GET /settings and PUT /settings."""

    # General
    org_name:      str
    municipality:  str
    timezone:      str
    contact_email: str

    # Reports & SLA
    default_severity:     str
    auto_assign:          bool
    response_time_hours:  int
    escalate_after_hours: int

    # Map
    default_lat:  float
    default_lng:  float
    default_zoom: int
    map_provider: str

    # Notifications
    email_alerts:         bool
    sms_alerts:           bool
    push_alerts:          bool
    digest_frequency:     str
    critical_alert_sound: bool

    # Security
    require_2fa:               bool
    password_min_length:       int
    session_timeout:           int
    data_retention_days:       int
    allow_public_registration: bool

    # Maintenance
    maintenance_mode:    bool
    maintenance_message: str
    allowed_admin_ips:   str
    # api_key is intentionally excluded — it must never travel over the wire in
    # plaintext.  It is stored in the DB and used server-side only.

    model_config = {"from_attributes": True}


class AdminSettingsUpdate(BaseModel):
    """All fields optional — only supplied keys are written to the DB."""

    # General
    org_name:      Optional[str] = None
    municipality:  Optional[str] = None
    timezone:      Optional[str] = None
    contact_email: Optional[str] = None

    # Reports & SLA
    default_severity:     Optional[str]  = None
    auto_assign:          Optional[bool] = None
    response_time_hours:  Optional[int]  = Field(None, ge=1, le=168)
    escalate_after_hours: Optional[int]  = Field(None, ge=1, le=720)

    # Map
    default_lat:  Optional[float] = None
    default_lng:  Optional[float] = None
    default_zoom: Optional[int]   = Field(None, ge=1, le=20)
    map_provider: Optional[str]   = None

    # Notifications
    email_alerts:         Optional[bool] = None
    sms_alerts:           Optional[bool] = None
    push_alerts:          Optional[bool] = None
    digest_frequency:     Optional[str]  = None
    critical_alert_sound: Optional[bool] = None

    # Security
    require_2fa:               Optional[bool] = None
    password_min_length:       Optional[int]  = Field(None, ge=6, le=32)
    session_timeout:           Optional[int]  = Field(None, ge=5, le=1440)
    data_retention_days:       Optional[int]  = Field(None, ge=30, le=2555)
    allow_public_registration: Optional[bool] = None

    # Maintenance
    maintenance_mode:    Optional[bool] = None
    maintenance_message: Optional[str]  = None
    allowed_admin_ips:   Optional[str]  = None
    # api_key is not settable through this endpoint — rotate it server-side only.
