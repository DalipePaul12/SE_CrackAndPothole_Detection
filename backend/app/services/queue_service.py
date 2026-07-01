import asyncio
import logging
from fastapi import BackgroundTasks
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.media_attachment import MediaAttachment, ProcessingStatus
from app.models.ai_detection_result import AIDetectionResult
from app.models.enums import DamageType, SeverityLevel
from app.models.report import Report
from app.services.ml_service import run_yolo

logger = logging.getLogger(__name__)


async def enqueue_ml_task(
    background_tasks: BackgroundTasks,
    media_id: int,
    file_path: str,
    ai_result: dict,
    reanalyze: bool = False,
) -> str:
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
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(MediaAttachment).where(MediaAttachment.id == media_id)
            )
            media = result.scalar_one_or_none()

            if not media:
                logger.error(f"ML Task Failed: Media ID {media_id} not found.")
                return

            prediction = await asyncio.to_thread(run_yolo, file_path)

            if not prediction:
                media.is_processed = True
                media.processing_status = ProcessingStatus.CLASSIFIED
                await db.commit()
                return

            raw_label = prediction.get("label", "uncertain")

            # ── DamageType (with fallback) ────────────────────────────────
            try:
                detected_class = DamageType(raw_label)
            except ValueError:
                logger.warning(
                    f"Unknown YOLO label '{raw_label}' for media {media_id}. "
                    "Defaulting to DamageType.uncertain."
                )
                detected_class = DamageType.uncertain

            # ── SeverityLevel — ALWAYS runs, regardless of DamageType result ──
            # FIX: was nested inside the except ValueError block above,
            # so severity was never set on the happy path → NULL in DB.
            raw_severity = prediction.get("severity")
            severity = None
            if raw_severity:
                normalized_sev = (
                    str(raw_severity).lower().strip()
                    .replace("-", "_")
                    .replace(" ", "_")
                )
                try:
                    severity = SeverityLevel(normalized_sev)
                except ValueError:
                    logger.warning(
                        f"Unknown severity '{raw_severity}' (normalized: '{normalized_sev}') "
                        f"for media {media_id}. Valid: {[s.value for s in SeverityLevel]}"
                    )

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

            # ── Sync parent Report summary fields ─────────────────────────
            report_result = await db.execute(
                select(Report).where(Report.id == media.report_id)
            )
            report = report_result.scalar_one_or_none()
            if report:
                report.ai_damage_type = detected_class
                report.ai_severity = severity
                report.ai_confidence = prediction.get("confidence")
                await db.commit()
                logger.info(
                    f"Report {media.report_id} summary synced: "
                    f"damage={detected_class.value}, "
                    f"severity={severity.value if severity else 'none'}"
                )

            logger.info(
                f"ML Task Complete: Media ID {media_id} classified as "
                f"'{detected_class.value}' (conf={prediction['confidence']:.3f})."
            )

        except Exception as e:
            logger.exception(f"Fatal error in ML task for media {media_id}: {e}")
            try:
                await db.rollback()
                async with AsyncSessionLocal() as recovery_db:
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