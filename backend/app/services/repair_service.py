import io
import logging
import uuid

from fastapi import HTTPException, UploadFile
from PIL import Image
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.supabase_storage import get_supabase_client, upload_report_file
from app.models.enums import MediaType, ReportStatus
from app.models.media_attachment import MediaAttachment
from app.models.notification import Notification
from app.models.project import Project
from app.models.repair_review import RepairReview
from app.models.report import Report
from app.services.notification_service import deliver_saved_notification
from app.utils.image_validator import validate_image_bytes

logger = logging.getLogger(__name__)
IMAGE_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
PENDING_REVIEW = "pending"
RETAKE_REQUESTED = "retake_requested"
APPROVED = "approved"
WITHDRAWN = "withdrawn"
CLOSED_REPORT_STATUSES = {ReportStatus.RESOLVED, ReportStatus.COMPLETED, ReportStatus.CANCELLED,
                          ReportStatus.REJECTED, ReportStatus.DECLINED}


async def lock_report(db, report_id):
    report = await db.scalar(select(Report).where(Report.id == report_id)
                             .with_for_update().execution_options(populate_existing=True))
    if report is None:
        raise HTTPException(404, "Report not found")
    return report


async def lock_project(db, project_id):
    report_id = await db.scalar(select(Project.report_id).where(Project.id == project_id))
    if report_id is None:
        raise HTTPException(404, "Project not found")
    # Always lock Report first. Manual close also works before a project exists.
    report = await lock_report(db, report_id)
    project = await db.scalar(select(Project).where(Project.id == project_id)
                              .with_for_update().execution_options(populate_existing=True))
    if project is None:
        raise HTTPException(404, "Project not found")
    return project, report


async def require_unassigned(db, report):
    project = await db.scalar(select(Project).where(Project.report_id == report.id))
    if (project and project.contractor_id is not None) or report.assigned_to:
        raise HTTPException(409, "Assigned repairs must be closed through contractor proof review.")
    if project:
        await require_no_pending_review(db, project.id)
    return project


def latest_review(project_id):
    return select(RepairReview).where(RepairReview.project_id == project_id).order_by(RepairReview.id.desc()).limit(1)


async def require_no_pending_review(db, project_id):
    review = await db.scalar(latest_review(project_id))
    if review and review.status == PENDING_REVIEW:
        raise HTTPException(409, "Decide the pending repair review first.")


async def require_no_pending_report_review(db, report_id):
    project_id = await db.scalar(select(Project.id).where(Project.report_id == report_id))
    if project_id is not None:
        await require_no_pending_review(db, project_id)


async def read_proof(photo: UploadFile, limit: int | None = None) -> tuple[bytes, str]:
    limit = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024 if limit is None else limit
    contents = await photo.read(limit + 1)
    if len(contents) > limit:
        raise HTTPException(413, "Repair proof exceeds the upload limit.")
    valid, error = await run_in_threadpool(validate_image_bytes, contents)
    if not valid:
        raise HTTPException(422, error)
    with Image.open(io.BytesIO(contents)) as image:
        content_type = image.get_format_mimetype()
    if content_type not in IMAGE_EXTENSIONS:
        raise HTTPException(422, "Repair photos must be JPEG, PNG, or WebP.")
    return contents, content_type


async def publish_proof(db, report_id, photos):
    paths = []
    try:
        for contents, content_type in photos:
            filename = f"completion_{uuid.uuid4().hex}.{IMAGE_EXTENSIONS[content_type]}"
            path = f"{report_id}/{filename}"
            paths.append(path)
            url = await run_in_threadpool(upload_report_file, contents, path, content_type)
            db.add(MediaAttachment(report_id=report_id, file_url=url, file_name=filename,
                                   file_size_bytes=len(contents), media_type=MediaType.image,
                                   attachment_type="completion_proof"))
    except Exception as exc:
        await discard_proof(paths)
        logger.exception("Repair proof upload failed for report %s", report_id)
        raise HTTPException(502, "Could not upload repair proof. Please retry.") from exc
    return paths


async def discard_proof(paths):
    if paths:
        try:
            await run_in_threadpool(lambda: get_supabase_client().storage.from_(settings.SUPABASE_BUCKET).remove(paths))
        except Exception:
            logger.exception("Could not clean up unpublished repair proof files")


async def commit_with_proof(db, paths):
    try:
        # Flush first so a database write failure can safely remove the uploaded objects.
        await db.flush()
    except Exception:
        await discard_proof(paths)
        raise
    await db.commit()


def add_notification(db, background_tasks, user_id, report_id, title, message, notification_type):
    if user_id is not None:
        notification = Notification(user_id=user_id, report_id=report_id, title=title,
                                    message=message, type=notification_type)
        db.add(notification)
        background_tasks.add_task(deliver_saved_notification, notification)
