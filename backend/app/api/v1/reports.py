"""
backend/app/api/v1/reports.py
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Sequence

import aiofiles
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.session import get_db
from app.middleware.auth_middleware import (
    get_current_user,
    require_admin,
    require_admin_or_contractor,
)
from app.middleware.rate_limiter import limiter
from app.models.cctv import CCTV
from app.models.comment import Comment
from app.models.enums import (
    MediaType,
    NotificationType,
    ReportStatus,
    UserRole,
)
from app.models.report import Report
from app.models.report_upvote import ReportUpvote
from app.models.user import User
from app.schemas.report import (
    DeclineRequest,
    ReportCreate,
    ReportListResponse,
    ReportResponse,
    ReportUpdate,
)
from app.services import report_service
from app.services.notification_service import notify_background
from app.utils.geo import calculate_distance

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["Reports"])


# ═════════════════════════════════════════════════════════════════════════════
# Pydantic helpers
# ═════════════════════════════════════════════════════════════════════════════

class CommentCreate(BaseModel):
    content: str


# ═════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ═════════════════════════════════════════════════════════════════════════════

def _enum_val(field):
    if field is None:
        return None
    return field.value if hasattr(field, "value") else field


async def _fetch_report_or_404(db: AsyncSession, report_id: int) -> Report:
    result = await db.execute(
        select(Report)
        .options(
            selectinload(Report.media_attachments),
            selectinload(Report.owner),
            selectinload(Report.ai_detections),
        )
        .where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )
    return report


async def _bulk_upvote_counts(
    db: AsyncSession,
    report_ids: list[int],
) -> dict[int, int]:
    if not report_ids:
        return {}
    result = await db.execute(
        select(
            ReportUpvote.report_id,
            func.count(ReportUpvote.report_id).label("cnt"),
        )
        .where(ReportUpvote.report_id.in_(report_ids))
        .group_by(ReportUpvote.report_id)
    )
    return {row.report_id: row.cnt for row in result}


async def _build_report_list(
    db: AsyncSession,
    reports: Sequence[Report],
) -> list[ReportResponse]:
    report_ids = [r.id for r in reports]
    upvote_map = await _bulk_upvote_counts(db, report_ids)
    items: list[ReportResponse] = []
    for r in reports:
        item = ReportResponse.model_validate(r)
        item.upvote_count = upvote_map.get(r.id, 0)
        items.append(item)
    return items


# ═════════════════════════════════════════════════════════════════════════════
# Magic-byte detection — determines real file type from raw bytes
# Handles files with no extension or wrong/missing Content-Type
# ═════════════════════════════════════════════════════════════════════════════

def _detect_mime_from_bytes(data: bytes) -> str | None:
    """Detect actual MIME type from magic bytes regardless of filename/Content-Type."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"GIF8":
        return "image/gif"
    if data[:4] == b"RIFF":
        if data[8:12] == b"WEBP":
            return "image/webp"
        if data[8:12] == b"WEBM":
            return "video/webm"
    if data[:4] in (b"\x00\x00\x00\x18", b"\x00\x00\x00\x20") or data[4:8] == b"ftyp":
        return "video/mp4"
    return None


def _mime_to_extension(mime: str) -> str:
    """Map MIME type to file extension."""
    return {
        "image/jpeg": ".jpg",
        "image/png":  ".png",
        "image/gif":  ".gif",
        "image/webp": ".webp",
        "video/mp4":  ".mp4",
        "video/webm": ".webm",
    }.get(mime, "")


def _sanitize_filename(filename: str, fallback_ext: str = "") -> str:
    """
    Truncate long filenames, strip unsafe characters, ensure extension exists.
    Handles filenames like 'water-filled-pothole-153663007' (no extension).
    """
    if not filename:
        return f"upload{fallback_ext}"

    path = Path(filename)
    stem = path.stem
    ext  = path.suffix.lower() or fallback_ext

    # Truncate stem to 60 chars to avoid filesystem limits
    stem = stem[:60].strip("-_ ")

    # Remove unsafe characters — keep alphanumeric, dash, underscore, dot
    import re
    stem = re.sub(r"[^\w\-]", "_", stem)

    return f"{stem}{ext}" if stem else f"upload{ext}"


# ═════════════════════════════════════════════════════════════════════════════
# Routes
# ═════════════════════════════════════════════════════════════════════════════

@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    data: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await report_service.create_report(db, data, current_user.id)
    report = await _fetch_report_or_404(db, report.id)
    upvote_count = await report_service.get_upvote_count(db, report.id)
    response = ReportResponse.model_validate(report)
    response.upvote_count = upvote_count
    return response


@router.get("", response_model=ReportListResponse)
@limiter.limit("60/minute")
async def list_reports(
    request: Request,
    status: ReportStatus | None = Query(None),
    barangay: str | None = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reports, total = await report_service.list_reports(
        db, status=status, barangay=barangay, page=page, page_size=page_size,
    )
    results = await _build_report_list(db, reports)
    return ReportListResponse(total=total, page=page, page_size=page_size, results=results)


@router.get("/mine", response_model=ReportListResponse)
@limiter.limit("60/minute")
async def get_my_reports(
    request: Request,
    status: ReportStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reports, total = await report_service.list_reports(
        db, owner_id=current_user.id, status=status, page=page, page_size=page_size,
    )
    results = await _build_report_list(db, reports)
    return ReportListResponse(total=total, page=page, page_size=page_size, results=results)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found.")
    if comment.user_id != current_user.id and current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized.")
    await db.delete(comment)
    await db.commit()


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)
    response = ReportResponse.model_validate(report)
    response.upvote_count = await report_service.get_upvote_count(db, report.id)
    return response


@router.patch("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: int,
    data: ReportUpdate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_contractor),
):
    report = await _fetch_report_or_404(db, report_id)
    owner_id = report.owner_id
    await report_service.update_report_status(db, report, data, current_user)

    if owner_id and data.status:
        status_val = (
            data.status.value if hasattr(data.status, "value") else str(data.status)
        ).upper()
        notif_map: dict[str, tuple[NotificationType, str, str]] = {
            "VERIFIED":    (NotificationType.success, "Report Verified",     f"Your report #{report_id} has been verified by an administrator."),
            "IN_PROGRESS": (NotificationType.info,    "Report In Progress",  f"Your report #{report_id} is now being worked on."),
            "RESOLVED":    (NotificationType.success, "Report Resolved",     f"Your report #{report_id} has been resolved. Thank you!"),
            "DECLINED":    (NotificationType.warning, "Report Declined",     f"Your report #{report_id} was declined."),
        }
        notif_type, title, message = notif_map.get(
            status_val,
            (NotificationType.info, "Report Status Updated", f"Your report #{report_id} status is now {status_val}."),
        )
        background_tasks.add_task(
            notify_background,
            user_id=owner_id, title=title, message=message,
            type=notif_type, report_id=report_id,
        )

    updated = await _fetch_report_or_404(db, report_id)
    response = ReportResponse.model_validate(updated)
    response.upvote_count = await report_service.get_upvote_count(db, report_id)
    return response


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    await db.delete(report)
    await db.commit()


# ── UPLOAD MEDIA ──────────────────────────────────────────────────────────────
# Handles ALL image/video uploads including:
#   - Files with no extension (e.g. "water-filled-pothole-153663007")
#   - AI-generated images from Gemini, ChatGPT, stock sites
#   - WebP, JPEG, PNG, MP4, WebM
#   - Wrong or missing Content-Type headers

@router.post("/{report_id}/media", status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def upload_media(
    request: Request,
    report_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _fetch_report_or_404(db, report_id)

    if report.owner_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    # ── Read file first ──────────────────────────────────────────────────────
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    # ── Detect real MIME from magic bytes (ignores filename/Content-Type) ────
    detected_mime = _detect_mime_from_bytes(contents)

    # Fall back to declared Content-Type if magic bytes unrecognized
    declared_mime = (file.content_type or "").lower()
    actual_mime   = detected_mime or declared_mime

    logger.info(
        "Upload | report_id=%d | filename=%s | declared=%s | detected=%s",
        report_id, file.filename, declared_mime, detected_mime,
    )

    # ── Validate against allowed types ───────────────────────────────────────
    allowed_image = list(settings.ALLOWED_IMAGE_TYPES) + ["image/gif"]
    allowed_video = list(settings.ALLOWED_VIDEO_TYPES)

    if actual_mime in allowed_image:
        media_type = MediaType.image
    elif actual_mime in allowed_video:
        media_type = MediaType.video
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type. Detected: {actual_mime}. Allowed: {allowed_image + allowed_video}",
        )

    # ── Size guard ───────────────────────────────────────────────────────────
    size_limit_mb = settings.MAX_IMAGE_SIZE_MB if media_type == MediaType.image else settings.MAX_VIDEO_SIZE_MB
    if len(contents) > size_limit_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {size_limit_mb} MB limit.",
        )

    # ── Sanitize filename — handles no-extension and very long names ─────────
    fallback_ext  = _mime_to_extension(actual_mime)
    clean_name    = _sanitize_filename(file.filename or "", fallback_ext)
    safe_name     = f"{uuid.uuid4().hex}_{clean_name}"

    # ── Write to disk ────────────────────────────────────────────────────────
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / safe_name

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    # ── Persist DB record ────────────────────────────────────────────────────
    from app.models.media_attachment import MediaAttachment

    attachment = MediaAttachment(
        report_id=report_id,
        file_url=f"/uploads/{safe_name}",
        file_name=clean_name,
        file_size_bytes=len(contents),
        media_type=media_type,
        is_processed=True,
        is_ai_generated=report.is_flagged_fake,
        ai_generated_confidence=None,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    logger.info(
        "Media saved | report_id=%d | media_id=%d | mime=%s | size=%d bytes | file=%s",
        report_id, attachment.id, actual_mime, len(contents), safe_name,
    )

    return {
        "success": True,
        "data": {
            "media_id":    attachment.id,
            "file_url":    attachment.file_url,
            "ai_validation": {
                "is_ai_generated": report.is_flagged_fake,
                "status": "flagged" if report.is_flagged_fake else "approved",
            },
            "classification": {
                "damage_type": _enum_val(report.ai_damage_type),
                "severity":    _enum_val(report.ai_severity),
            },
        },
    }


@router.post("/{report_id}/upvote")
async def toggle_upvote(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    added = await report_service.toggle_upvote(db, report_id, current_user.id)
    count = await report_service.get_upvote_count(db, report_id)
    return {"upvoted": added, "upvote_count": count}


@router.put("/{report_id}/validate", status_code=status.HTTP_200_OK)
async def validate_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    report.status = ReportStatus.VERIFIED
    await db.commit()
    if report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Verified",
            message=f"Your report #{report_id} has been verified by an administrator.",
            type=NotificationType.success,
            report_id=report_id,
        )
    logger.info("Report %d verified by user %d", report_id, current_user.id)
    return {"message": "Report verified successfully."}


@router.put("/{report_id}/decline", status_code=status.HTTP_200_OK)
async def decline_report(
    report_id: int,
    data: DeclineRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    report = await _fetch_report_or_404(db, report_id)
    report.status = ReportStatus.DECLINED
    report.decline_reason = data.reason
    await db.commit()
    if report.owner_id:
        background_tasks.add_task(
            notify_background,
            user_id=report.owner_id,
            title="Report Declined",
            message=f"Your report #{report_id} was declined. Reason: {data.reason}",
            type=NotificationType.warning,
            report_id=report_id,
        )
    logger.info("Report %d declined by user %d | reason=%s", report_id, current_user.id, data.reason)
    return {"message": "Report declined."}


@router.get("/{report_id}/comments")
async def get_comments(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _fetch_report_or_404(db, report_id)
    result = await db.execute(
        select(Comment)
        .options(selectinload(Comment.user))
        .where(Comment.report_id == report_id)
        .order_by(Comment.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{report_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    report_id: int,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _fetch_report_or_404(db, report_id)
    comment = Comment(
        report_id=report_id,
        user_id=current_user.id,
        content=data.content.strip(),
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


@router.get("/{report_id}/nearby-cctv")
async def get_nearby_cctv(
    report_id: int,
    radius_meters: float = Query(100.0, ge=10, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import math
    report = await _fetch_report_or_404(db, report_id)

    lat_deg = radius_meters / 111_320
    lng_deg = radius_meters / (111_320 * math.cos(math.radians(report.latitude)))

    cam_result = await db.execute(
        select(CCTV).where(
            CCTV.is_active == True,  # noqa: E712
            CCTV.latitude.between(report.latitude - lat_deg, report.latitude + lat_deg),
            CCTV.longitude.between(report.longitude - lng_deg, report.longitude + lng_deg),
        )
    )
    cameras = cam_result.scalars().all()

    nearby = [
        {
            "id": cam.id, "name": cam.location_name,
            "lat": cam.latitude, "lng": cam.longitude,
            "distance_meters": round(dist, 2),
            "stream_url": cam.stream_url,
        }
        for cam in cameras
        if (dist := calculate_distance(report.latitude, report.longitude, cam.latitude, cam.longitude)) <= radius_meters
    ]
    nearby.sort(key=lambda c: c["distance_meters"])
    return nearby