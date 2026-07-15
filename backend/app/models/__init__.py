"""
Explicit model exports.
Importing this package ensures all models are registered
against the shared Base for Alembic to detect them.
"""
from app.models.user import User
from app.models.report import Report
from app.models.project import Project
from app.models.project_update import ProjectUpdate
from app.models.comment import Comment
from app.models.notification import Notification
from app.models.otp import OTP
from app.models.audit_log import AuditLog
from app.models.cctv import CCTV
from app.models.media_attachment import MediaAttachment
from app.models.ai_detection_result import AIDetectionResult
from app.models.refresh_token import RefreshToken
from app.models.report_upvote import ReportUpvote
from app.models.admin_settings import AdminSettings

__all__ = [
    "User", "Report", "Project", "ProjectUpdate", "Comment",
    "Notification", "OTP", "AuditLog", "CCTV", "MediaAttachment",
    "AIDetectionResult", "RefreshToken", "ReportUpvote", "AdminSettings",
]