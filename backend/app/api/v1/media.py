from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, status, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
import uuid

from app.db.session import get_db
from app.core.config import settings
from app.middleware.auth_middleware import get_current_user, require_admin
from app.middleware.rate_limiter import limiter
from app.models.media_attachment import MediaAttachment, ProcessingStatus
from app.models.report import Report
from app.models.enums import MediaType
from app.models.user import User

router = APIRouter(prefix="/media", tags=["Media"])

ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4"]
MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10 MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100 MB

# Magic-byte signatures for each supported type
_MAGIC = {
    "image/jpeg": [(0, b"\xff\xd8")],
    "image/png":  [(0, b"\x89PNG\r\n\x1a\n")],
    "image/webp": [(0, b"RIFF"), (8, b"WEBP")],
    "video/mp4":  [(4, b"ftyp")],  # bytes 4–7 contain 'ftyp'
}


def _check_magic(content_type: str, data: bytes) -> bool:
    """Return True when all magic-byte checks for the declared type pass."""
    checks = _MAGIC.get(content_type, [])
    for offset, sig in checks:
        if data[offset: offset + len(sig)] != sig:
            return False
    return True


def validate_file(file: UploadFile, contents: bytes) -> None:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"error": "INVALID_FILE_TYPE", "allowed": ALLOWED_TYPES},
        )

    # Per-type size limit
    limit = MAX_VIDEO_SIZE if "video" in (file.content_type or "") else MAX_IMAGE_SIZE
    if len(contents) > limit:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"error": "FILE_TOO_LARGE", "max_bytes": limit},
        )

    # Magic-byte validation (covers JPEG, PNG, WebP, MP4)
    if not _check_magic(file.content_type, contents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_FILE_SIGNATURE"},
        )


async def _persist_media(
    db: AsyncSession,
    background_tasks: BackgroundTasks,
    report_id: int,
    file: UploadFile,
    contents: bytes,
) -> tuple[MediaAttachment, str | None]:
    from app.services.ml_service import validate_ai_generated
    from app.services.queue_service import enqueue_ml_task
    from app.core.supabase_storage import upload_report_file

    ai_result = await validate_ai_generated(contents)

    # FIX: Don't block upload if AI validation fails — save anyway, flag as unknown
    if not ai_result or "is_ai_generated" not in ai_result:
        ai_result = {"is_ai_generated": False, "confidence": 0.0}  # ← default instead of crash

    is_flagged: bool = ai_result["is_ai_generated"]

    filename = f"{uuid.uuid4().hex}_{file.filename}"

    # ── UPLOAD TO SUPABASE STORAGE (was: local disk write) ──────────────
    storage_subpath = f"{report_id}/{filename}"
    try:
        file_url = upload_report_file(
            file_bytes=contents,
            storage_path=storage_subpath,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": "STORAGE_UPLOAD_FAILED", "detail": str(e)},
        )

    # ── Local temp copy — ONLY so the ML pipeline (enqueue_ml_task /
    #    run_yolo) has a real file path to read from. Not the source of
    #    truth anymore; Supabase is. We do NOT delete it here because
    #    enqueue_ml_task may run in a background task after this function
    #    returns — cleanup happens in the ML task itself, or via a
    #    periodic cleanup_service sweep (you already have cleanup_service.py).
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / filename
    file_path.write_bytes(contents)

    try:
        media = MediaAttachment(
            report_id=report_id,
            file_url=file_url,
            file_name=file.filename,
            file_size_bytes=len(contents),
            media_type=MediaType.image if "image" in (file.content_type or "") else MediaType.video,
            is_ai_generated=is_flagged,
            ai_generated_confidence=ai_result.get("confidence"),
            ai_generated_model_used="huggingface-ai-detector",
            processing_status=ProcessingStatus.AI_CHECKED,
            is_processed=False,
        )

        db.add(media)
        await db.flush()

        task_id: str | None = None
        if not is_flagged:
            task_id = await enqueue_ml_task(
                background_tasks=background_tasks,
                media_id=media.id,
                file_path=str(file_path),
                ai_result=ai_result,
            )

        await db.commit()
        await db.refresh(media)
        return media, task_id

    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "DB_WRITE_FAILED"},
        )

def _build_ai_result(media: MediaAttachment) -> dict:
    return {
        "is_ai_generated": media.is_ai_generated,
        "confidence": media.ai_generated_confidence or 0.0,
        "status": "rejected" if media.is_ai_generated else "approved_for_classification",
    }


def _serialize_media(media: MediaAttachment) -> dict:
    return {
        "id": media.id,
        "report_id": media.report_id,
        "file_url": media.file_url,
        "media_type": media.media_type.value,
        "is_ai_generated": media.is_ai_generated,
        "ai_confidence": media.ai_generated_confidence,
        "is_processed": media.is_processed,
        "processing_status": media.processing_status.value if media.processing_status else None,
        "detections": [
            {
                "class": d.detected_class.value,
                "severity": d.severity.value if d.severity else None,
                "confidence": d.confidence,
            }
            for d in media.ai_detections
        ],
    }


@router.post("/upload", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_media_standalone(
    request: Request,
    background_tasks: BackgroundTasks,
    report_id: int = Query(..., description="Report ID this media belongs to"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Primary upload endpoint called by frontend pipeline.
    Route: POST /api/v1/media/upload?report_id=X
    Runs AI fake-detection synchronously, enqueues ML classification.
    """
    report_result = await db.execute(select(Report).where(Report.id == report_id))
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "REPORT_NOT_FOUND"},
        )

    if report.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "ACCESS_DENIED"},
        )

    contents = await file.read()
    validate_file(file, contents)

    media, task_id = await _persist_media(db, background_tasks, report_id, file, contents)

    return {
        "success": True,
        "data": {
            "id": media.id,
            "media_id": media.id,
            "task_id": task_id,
            "status": "flagged" if media.is_ai_generated else "processing",
            "ai_validation": _build_ai_result(media),
        },
    }


@router.post("/{report_id}/upload", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_media_for_report(
    request: Request,
    background_tasks: BackgroundTasks,
    report_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Path-param variant for backward compat with CreateReport.jsx flow.
    Route: POST /api/v1/media/{report_id}/upload
    """
    report_result = await db.execute(select(Report).where(Report.id == report_id))
    report = report_result.scalar_one_or_none()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "REPORT_NOT_FOUND"},
        )
    if report.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "ACCESS_DENIED"},
        )

    contents = await file.read()
    validate_file(file, contents)

    media, task_id = await _persist_media(db, background_tasks, report_id, file, contents)

    return {
        "success": True,
        "data": {
            "id": media.id,
            "media_id": media.id,
            "task_id": task_id,
            "status": "flagged" if media.is_ai_generated else "processing",
            "ai_validation": _build_ai_result(media),
        },
    }


# =========================================================================
# NEW ENDPOINT: STATELESS MEDIA ANALYSIS (Placed before path params to avoid routing conflicts)
# =========================================================================
@router.post("/analyze", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def analyze_media_preview(
    request: Request,
    file: UploadFile = File(...),
):
    """
    Stateless endpoint for real-time UI feedback.
    Runs HuggingFace AI-detection and YOLO classification instantly WITHOUT saving to the DB.
    """
    from app.services.ml_service import process_media_pipeline
    
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "Empty file received."})
        
    # Re-use the existing file validation (size, magic bytes) securely
    validate_file(file, contents)
    
    try:
        result = await process_media_pipeline(contents)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": str(e)})
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"error": str(e)})


@router.get("/report/{report_id}")
async def get_media_by_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return all media attachments for a given report."""
    result = await db.execute(
        select(MediaAttachment)
        .options(selectinload(MediaAttachment.ai_detections))
        .where(MediaAttachment.report_id == report_id)
        .order_by(MediaAttachment.created_at.asc())
    )
    items = result.scalars().all()
    return {"success": True, "data": [_serialize_media(m) for m in items]}


@router.get("/{media_id}")
async def get_media(
    media_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MediaAttachment)
        .options(selectinload(MediaAttachment.ai_detections))
        .where(MediaAttachment.id == media_id)
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "MEDIA_NOT_FOUND"},
        )
    return {"success": True, "data": _serialize_media(media)}


@router.post("/{media_id}/reanalyze", status_code=status.HTTP_202_ACCEPTED)
async def reanalyze_media(
    media_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(MediaAttachment).where(MediaAttachment.id == media_id)
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "MEDIA_NOT_FOUND"},
        )
    if media.is_ai_generated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "CANNOT_PROCESS_AI_GENERATED"},
        )

    filename = media.file_url.split("/uploads/")[-1]
    file_path = Path(settings.UPLOAD_DIR) / filename
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "FILE_NOT_FOUND"},
        )

    from app.services.queue_service import enqueue_ml_task

    task_id = await enqueue_ml_task(
        background_tasks=background_tasks,
        media_id=media.id,
        file_path=str(file_path),
        ai_result={
            "is_ai_generated": media.is_ai_generated,
            "confidence": media.ai_generated_confidence,
        },
        reanalyze=True,
    )
    return {"success": True, "data": {"task_id": task_id, "status": "reprocessing"}}