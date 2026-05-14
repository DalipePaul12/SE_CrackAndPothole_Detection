from __future__ import annotations

# ── Base / independent tables first ──────────────────────────────────────────
from app.models.frame_detection import FrameDetection       # noqa: F401
from app.models.revoked_token import RevokedToken           # noqa: F401
from app.models.user import User                            # noqa: F401

# ── Tables that depend on the above ────────────────────────────────────────
from app.models.report import Report                        # noqa: F401
from app.models.report_upvote import ReportUpvote             # noqa: F401
from app.models.comment import Comment                      # noqa: F401
from app.models.media_attachment import MediaAttachment     # noqa: F401
from app.models.ai_detection_result import AIDetectionResult  # noqa: F401

# ── Project / audit tables ──────────────────────────────────────────────────
from app.models.project import Project                      # noqa: F401
from app.models.project_update import ProjectUpdate         # noqa: F401
from app.models.notification import Notification            # noqa: F401
from app.models.otp import OTP                              # noqa: F401
from app.models.audit_log import AuditLog                   # noqa: F401
from app.models.cctv import CCTV                            # noqa: F401
from app.models.refresh_token import RefreshToken           # noqa: F401

__all__ = [
    "FrameDetection",
    "RevokedToken",
    "User",
    "Report",
    "ReportUpvote",
    "Comment",
    "MediaAttachment",
    "AIDetectionResult",
    "Project",
    "ProjectUpdate",
    "Notification",
    "OTP",
    "AuditLog",
    "CCTV",
    "RefreshToken",
]