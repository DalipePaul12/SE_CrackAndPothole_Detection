import asyncio
import logging
from fastapi import BackgroundTasks
from sqlalchemy import select

from app.db.session import async_session
from app.models.media_attachment import MediaAttachment, ProcessingStatus
from app.models.ai_detection_result import AIDetectionResult
from app.models.enums import DamageType, SeverityLevel
from app.services.ml_service import run_yolo

logger = logging.getLogger(__name__)


async def enqueue_ml_task(
    background_tasks: BackgroundTasks,   # FIX: was missing from callers in media.py
    media_id: int,
    file_path: str,
    ai_result: dict,
    reanalyze: bool = False,
) -> str:
    """
    Safely queues the ML classification task using FastAPI's BackgroundTasks.
    background_tasks MUST be passed from the route handler — it is injected
    by FastAPI only at the route level, never inside helper functions.
    """
    task_id = f"task_{media_id}"

    background_tasks.add_task(
        _process_ml_task,
        media_id=media_id,
        file_path=file_path,
        ai_result=ai_result,
        reanalyze=reanalyze,
    )

    return task_id


async def _process_ml_task(
    media_id: int,
    file_path: str,
    ai_result: dict,
    reanalyze: bool = False,
) -> None:
    """
    Background worker that runs YOLO classification and saves the result.
    On any failure: writes ProcessingStatus.FAILED so the frontend stops polling.
    """
    async with async_session() as db:
        try:
            result = await db.execute(
                select(MediaAttachment).where(MediaAttachment.id == media_id)
            )
            media = result.scalar_one_or_none()

            if not media:
                logger.error(f"ML Task Failed: Media ID {media_id} not found.")
                return

            # FIX: run_yolo is CPU-heavy — dispatch to thread so the async event
            # loop is never blocked by model inference.
            prediction = await asyncio.to_thread(run_yolo, file_path)

            if not prediction:
                media.is_processed = True
                media.processing_status = ProcessingStatus.CLASSIFIED
                await db.commit()
                return

            # FIX: Wrap DamageType construction in try/except.
            # If YOLO returns an unknown label the entire worker no longer
            # crashes silently — it records FAILED instead.
            raw_label = prediction.get("label", "uncertain")
            try:
                detected_class = DamageType(raw_label)
            except ValueError:
                logger.warning(
                    f"Unknown YOLO label '{raw_label}' for media {media_id}. "
                    "Defaulting to DamageType.uncertain."
                )
                detected_class = DamageType.uncertain

            raw_severity = prediction.get("severity")
            severity = None
            if raw_severity:
                try:
                    severity = SeverityLevel(raw_severity)
                except ValueError:
                    logger.warning(f"Unknown severity '{raw_severity}' — ignoring.")

            detection = AIDetectionResult(
                report_id=media.report_id,
                media_attachment_id=media.id,
                detected_class=detected_class,
                severity=severity,
                confidence=prediction["confidence"],
                bounding_boxes=prediction.get("boxes"),
                model_version="yolo-reanalyze" if reanalyze else "yolo",
                inference_time_ms=prediction.get("inference_time_ms", 0),
            )

            db.add(detection)
            media.is_processed = True
            media.processing_status = ProcessingStatus.CLASSIFIED
            await db.commit()

            logger.info(
                f"ML Task Complete: Media ID {media_id} classified as "
                f"'{detected_class.value}' (conf={prediction['confidence']:.3f})."
            )

        except Exception as e:
            logger.exception(f"Fatal error in ML task for media {media_id}: {e}")
            try:
                await db.rollback()
                # FIX: Write FAILED status so /ml/classify returns 422 instead
                # of 202 forever — frontend polling will correctly stop.
                async with async_session() as recovery_db:
                    rec_result = await recovery_db.execute(
                        select(MediaAttachment).where(MediaAttachment.id == media_id)
                    )
                    failed_media = rec_result.scalar_one_or_none()
                    if failed_media:
                        failed_media.is_processed = True
                        failed_media.processing_status = ProcessingStatus.FAILED
                        await recovery_db.commit()
            except Exception as recovery_err:
                logger.error(
                    f"Could not write FAILED status for media {media_id}: {recovery_err}"
                )