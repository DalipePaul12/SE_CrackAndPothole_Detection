"""
AdminSettings — single-row singleton table (id=1) storing all UI-configurable
system settings. The row is created with defaults on first GET if absent.
"""
import secrets

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


def _default_api_key() -> str:
    """Generate a random sk_live_ key on first row creation."""
    return "sk_live_" + secrets.token_hex(9)   # 18 hex chars → sk_live_<18>


class AdminSettings(Base):
    __tablename__ = "admin_settings"

    # Only one row (id=1) is ever allowed.  The CHECK constraint is the DB-level
    # guard; _get_or_create() in settings.py is the application-level guard.
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_admin_settings_singleton"),
    )

    id = Column(Integer, primary_key=True, default=1)

    # ── General ───────────────────────────────────────────────────────────────
    org_name      = Column(String(255), nullable=False, default="Snap2Fix")
    municipality  = Column(String(255), nullable=False, default="Panghulo")
    timezone      = Column(String(64),  nullable=False, default="Asia/Manila")
    contact_email = Column(String(255), nullable=False, default="admin@snap2fix.gov")

    # ── Reports & SLA ─────────────────────────────────────────────────────────
    default_severity     = Column(String(32),  nullable=False, default="medium")
    auto_assign          = Column(Boolean,      nullable=False, default=True)
    response_time_hours  = Column(Integer,      nullable=False, default=24)
    escalate_after_hours = Column(Integer,      nullable=False, default=72)

    # ── Map & Geolocation ─────────────────────────────────────────────────────
    default_lat  = Column(Float,       nullable=False, default=14.5995)
    default_lng  = Column(Float,       nullable=False, default=120.9842)
    default_zoom = Column(Integer,     nullable=False, default=13)
    map_provider = Column(String(32),  nullable=False, default="google")

    # ── Notifications ─────────────────────────────────────────────────────────
    email_alerts        = Column(Boolean,     nullable=False, default=True)
    sms_alerts          = Column(Boolean,     nullable=False, default=False)
    push_alerts         = Column(Boolean,     nullable=False, default=True)
    digest_frequency    = Column(String(32),  nullable=False, default="daily")
    critical_alert_sound = Column(Boolean,    nullable=False, default=True)

    # ── Security & Privacy ────────────────────────────────────────────────────
    require_2fa              = Column(Boolean,  nullable=False, default=True)
    password_min_length      = Column(Integer,  nullable=False, default=8)
    session_timeout          = Column(Integer,  nullable=False, default=60)
    data_retention_days      = Column(Integer,  nullable=False, default=365)
    allow_public_registration = Column(Boolean, nullable=False, default=False)

    # ── Maintenance ───────────────────────────────────────────────────────────
    maintenance_mode    = Column(Boolean,       nullable=False, default=False)
    maintenance_message = Column(Text,          nullable=False,
                                 default="System under maintenance. Please check back shortly.")
    allowed_admin_ips   = Column(String(1024),  nullable=False, default="")
    api_key             = Column(String(128),   nullable=False, default=_default_api_key)

    # ── Audit ─────────────────────────────────────────────────────────────────
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
