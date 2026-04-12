from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserPublic
from app.schemas.auth import TokenResponse, LoginRequest, OTPVerifyRequest, OTPRequestRequest
from app.schemas.report import ReportCreate, ReportUpdate, ReportResponse, ReportListResponse
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.comment import CommentCreate, CommentUpdate, CommentResponse
from app.schemas.notification import NotificationResponse, NotificationUpdate
from app.schemas.cctv import CCTVCreate, CCTVUpdate, CCTVResponse
from app.schemas.media_attachment import MediaAttachmentResponse
from app.schemas.ai_detection_result import AIDetectionResultResponse