"""
backend/app/models/enums.py

CRITICAL: ReportStatus values must be lowercase strings.
Every consumer normalises to lowercase before lookup:
  - _normalize_status() calls ReportStatus(status_str.lower())
  - Frontend patchStatus() always sends lowercase
  - notif_map keys in reports.py are uppercase only for .value.upper() display
  - PostgreSQL stores whatever value Python writes; mixed case = broken queries
"""
from __future__ import annotations
import enum


class UserRole(str, enum.Enum):
    citizen    = "citizen"
    admin      = "admin"
    superadmin = "superadmin"
    contractor = "contractor"


class ReportStatus(str, enum.Enum):
    # ✅ All values are lowercase — matches _normalize_status() and frontend
    PENDING     = "pending"
    VERIFIED    = "verified"
    DECLINED    = "declined"
    ASSIGNED    = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED   = "completed"
    REJECTED    = "rejected"
    RESOLVED    = "resolved"
    CANCELLED   = "cancelled"   # used by frontend cancel action


class ProjectStatus(str, enum.Enum):
    SCHEDULED   = "scheduled"
    IN_PROGRESS = "in_progress"
    ON_HOLD     = "on_hold"
    COMPLETED   = "completed"
    CANCELLED   = "cancelled"


class PriorityLevel(str, enum.Enum):
    LOW      = "low"
    HIGH     = "high"
    CRITICAL = "critical"


class DamageType(str, enum.Enum):
    pothole   = "pothole"
    crack     = "crack"
    none      = "none"
    uncertain = "uncertain"


class SeverityLevel(str, enum.Enum):
    non_critical = "non_critical"   # ✅ added
    critical     = "critical"


class OTPPurpose(str, enum.Enum):
    email_verify   = "email_verify"
    password_reset = "password_reset"
    two_factor     = "two_factor"


class NotificationType(str, enum.Enum):
    info    = "info"
    success = "success"
    warning = "warning"
    error   = "error"


class MediaType(str, enum.Enum):
    image = "image"
    video = "video"


class ReportType(str, enum.Enum):
    image  = "image"
    video  = "video"
    hybrid = "hybrid"