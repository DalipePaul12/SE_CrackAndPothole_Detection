"""
Email service — sends OTP emails via SMTP using fastapi-mail.
"""
import logging
from typing import Optional

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


async def send_notification_email(
    email: str,
    title: str,
    message: str,
    report_id: Optional[int] = None,
) -> None:
    """Send an in-app notification as an email via Gmail SMTP."""
    if not _mail_enabled:
        logger.info(f"[EMAIL DISABLED] Would send notification to {email}: {title}")
        return

    from fastapi_mail import FastMail, MessageSchema, MessageType

    report_line = f"<p style='margin:12px 0 0;color:#64748b;font-size:13px;'>Report #{report_id}</p>" if report_id else ""

    body = f"""
    <div style="max-width:480px;margin:0 auto;font-family:'Inter',system-ui,sans-serif;color:#1e293b;">
      <div style="background:linear-gradient(135deg,#1b4332,#2d6a4f);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:18px;letter-spacing:0.5px;">Snap2Fix</h2>
        <p style="color:#d8f3dc;margin:4px 0 0;font-size:12px;">AI-Powered Road Damage Reporting</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        <h3 style="margin:0 0 8px;font-size:16px;color:#111;">{title}</h3>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">{message}</p>
        {report_line}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">
          You received this because you have notifications enabled on Snap2Fix.
        </p>
      </div>
    </div>
    """

    msg = MessageSchema(
        subject=f"Snap2Fix — {title}",
        recipients=[email],
        body=body,
        subtype=MessageType.html,
    )
    try:
        fm = FastMail(_conf)
        await fm.send_message(msg)
        logger.info("Notification email sent to %s | %s", email, title)
    except Exception:
        logger.exception("Failed to send notification email to %s", email)
