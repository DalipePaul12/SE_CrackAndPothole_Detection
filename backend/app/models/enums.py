"""
backend/app/models/enums.py

CRITICAL: ReportStatus values must be lowercase strings.
Every consumer normalises to lowercase before lookup:
  - _normalize_status() calls ReportStatus(status_str.lower())
  - Frontend patchStatus() always sends lowercase
  - notif_map keys in reports.py are uppercase only for .value.upper() display
  - PostgreSQL stores whatever value Python writes; mixed case = broken queries

SeverityLevel values use underscore (non_critical) NOT hyphen (non-critical).
  - run_yolo() output must be normalized before SeverityLevel() lookup:
      raw.lower().strip().replace("-", "_").replace(" ", "_")
  - Frontend toClass() converts underscore → hyphen for CSS only (display layer)
  - DB stores the underscore form: "non_critical", "critical"
"""
from __future__ import annotations
import enum


# ─────────────────────────────────────────────────────────────────────────────
# USER
# ─────────────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    citizen    = "citizen"
    admin      = "admin"
    superadmin = "superadmin"
    contractor = "contractor"


# ─────────────────────────────────────────────────────────────────────────────
# REPORT
# ─────────────────────────────────────────────────────────────────────────────

class ReportStatus(str, enum.Enum):
    # All values lowercase — matches _normalize_status() and frontend patchStatus()
    PENDING     = "pending"
    VERIFIED    = "verified"
    DECLINED    = "declined"
    ASSIGNED    = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED   = "completed"
    REJECTED    = "rejected"
    RESOLVED    = "resolved"
    CANCELLED   = "cancelled"   # used by frontend cancel action


class ReportType(str, enum.Enum):
    image  = "image"
    video  = "video"
    hybrid = "hybrid"


# ─────────────────────────────────────────────────────────────────────────────
# DAMAGE / AI
# ─────────────────────────────────────────────────────────────────────────────

class DamageType(str, enum.Enum):
    pothole   = "pothole"
    crack     = "crack"
    none      = "none"
    uncertain = "uncertain"


class SeverityLevel(str, enum.Enum):
    """
    IMPORTANT: DB stores underscore form.
    run_yolo() may return "non-critical" (hyphen) — always normalize before lookup:
        raw.lower().strip().replace("-", "_")
    Frontend CSS uses "non-critical" (hyphen) via toClass() — that is display only.
    """
    non_critical = "non_critical"
    critical     = "critical"


# ─────────────────────────────────────────────────────────────────────────────
# MEDIA
# ─────────────────────────────────────────────────────────────────────────────

class MediaType(str, enum.Enum):
    image = "image"
    video = "video"


class ProcessingStatus(str, enum.Enum):
    """
    Tracks ML pipeline state on MediaAttachment.
    Used by queue_service._process_ml_task() and upload_service.save_upload().
    Frontend polls /ml/classify until status is CLASSIFIED or FAILED.
    """
    PENDING    = "pending"      # uploaded, ML not yet queued
    QUEUED     = "queued"       # enqueued in BackgroundTasks
    PROCESSING = "processing"   # run_yolo() is actively running
    CLASSIFIED = "classified"   # ML finished, AIDetectionResult saved
    FAILED     = "failed"       # ML crashed — frontend stops polling


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATION
# ─────────────────────────────────────────────────────────────────────────────

class NotificationType(str, enum.Enum):
    info    = "info"
    success = "success"
    warning = "warning"
    error   = "error"
    comment = "comment"     # admin note sent to reporter


# ─────────────────────────────────────────────────────────────────────────────
# AUTH / OTP
# ─────────────────────────────────────────────────────────────────────────────

class OTPPurpose(str, enum.Enum):
    email_verify   = "email_verify"
    password_reset = "password_reset"
    two_factor     = "two_factor"