"""
Email service — sends OTP emails via SMTP using fastapi-mail.
"""
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

_mail_enabled = bool(settings.MAIL_FROM and "@" in settings.MAIL_FROM and settings.MAIL_USERNAME)

if _mail_enabled:
    from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

    _conf = ConnectionConfig(
        MAIL_USERNAME=settings.MAIL_USERNAME,
        MAIL_PASSWORD=settings.MAIL_PASSWORD,
        MAIL_FROM=settings.MAIL_FROM,
        MAIL_PORT=settings.MAIL_PORT,
        MAIL_SERVER=settings.MAIL_SERVER,
        MAIL_STARTTLS=False,
        MAIL_SSL_TLS=True,
        USE_CREDENTIALS=True,
    )
else:
    logger.warning("Email not configured — OTP emails will be logged to console only.")

_OTP_SUBJECTS = {
    "email_verify":    "Verify Your Email",
    "password_reset":  "Password Reset OTP",
    "two_factor":      "Your Login OTP",
}


async def send_otp_email(email: str, code: str, purpose: str) -> None:
    subject = _OTP_SUBJECTS.get(purpose, "Your OTP Code")

    if not _mail_enabled:
        logger.info(f"[EMAIL DISABLED] Would send OTP to {email} [{purpose}]: code={code}")
        return

    from fastapi_mail import FastMail, MessageSchema, MessageType
    body = f"""
    <h2>{subject}</h2>
    <p>Your one-time code is:</p>
    <h1 style="letter-spacing:6px">{code}</h1>
    <p>This code expires in {settings.OTP_EXPIRE_MINUTES} minutes. Do not share it.</p>
    """
    message = MessageSchema(
        subject=subject,
        recipients=[email],
        body=body,
        subtype=MessageType.html,
    )
    try:
        fm = FastMail(_conf)
        await fm.send_message(message)
        logger.info(f"OTP email sent to {email} [{purpose}]")
    except Exception:
        logger.exception(f"Failed to send OTP email to {email}")
