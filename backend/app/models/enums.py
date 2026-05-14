import enum


class UserRole(str, enum.Enum):
    citizen = "citizen"
    admin = "admin"
    superadmin = "superadmin"
    contractor = "contractor"


class ReportStatus(str, enum.Enum):
    PENDING     = "PENDING"
    VERIFIED    = "VERIFIED"
    DECLINED    = "DECLINED"
    ASSIGNED    = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED   = "COMPLETED"
    REJECTED    = "REJECTED"
    RESOLVED    = "RESOLVED"


class ProjectStatus(str, enum.Enum):
    SCHEDULED   = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    ON_HOLD     = "ON_HOLD"
    COMPLETED   = "COMPLETED"
    CANCELLED   = "CANCELLED"


class PriorityLevel(str, enum.Enum):
    LOW      = "LOW"
    HIGH     = "HIGH"
    CRITICAL = "CRITICAL"


class DamageType(str, enum.Enum):
    pothole   = "pothole"
    crack     = "crack"
    none      = "none"
    uncertain = "uncertain"


class SeverityLevel(str, enum.Enum):
    low      = "low"
    critical = "critical"


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