from app.models.frame_detection import FrameDetection   # noqa: F401  ← MOVE TO TOP
from app.models.user import User                          # noqa: F401
from app.models.report import Report                      # noqa: F401  ← AFTER FrameDetection
from app.models.project import Project                    # noqa: F401
from app.models.project_update import ProjectUpdate       # noqa: F401
from app.models.comment import Comment                    # noqa: F401
from app.models.notification import Notification          # noqa: F401
from app.models.otp import OTP                            # noqa: F401
from app.models.audit_log import AuditLog                 # noqa: F401
from app.models.cctv import CCTV                          # noqa: F401
from app.models.media_attachment import MediaAttachment   # noqa: F401
from app.models.ai_detection_result import AIDetectionResult  # noqa: F401
from app.models.refresh_token import RefreshToken         # noqa: F401
from app.models.report_upvote import ReportUpvote         # noqa: F401

__all__ = [
    "FrameDetection", "User", "Report", "Project", "ProjectUpdate",
    "Comment", "Notification", "OTP", "AuditLog", "CCTV",
    "MediaAttachment", "AIDetectionResult", "RefreshToken", "ReportUpvote",
]