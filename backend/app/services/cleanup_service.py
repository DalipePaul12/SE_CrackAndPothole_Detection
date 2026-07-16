"""
backend/app/services/cleanup_service.py
────────────────────────────────────────
Lightweight background data-retention cleanup.

Runs once every 24 hours (same lifespan pattern as _load_models_background).
Deletes resolved reports whose updated_at (i.e. time of resolution) is older
than data_retention_days, as configured in the AdminSettings singleton row.

Note: Report has no resolved_at column; updated_at is the best available proxy
for when a report was last moved to RESOLVED status.

Non-resolved reports are never touched.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select as sa_select

logger = logging.getLogger(__name__)

_INTERVAL_SECONDS = 86_400  # 24 hours
_DEFAULT_RETENTION_DAYS = 365


async def _run_cleanup() -> int:
    """
    Delete resolved reports older than data_retention_days.
    Returns the number of rows deleted.
    """
    # Import here to avoid circular-import issues at module load time.
    from app.db.session import AsyncSessionLocal  # type: ignore[attr-defined]
    from app.models.admin_settings import AdminSettings
    from app.models.enums import ReportStatus
    from app.models.report import Report

    async with AsyncSessionLocal() as db:
        # Fetch retention window from settings singleton.
        result = await db.execute(sa_select(AdminSettings).where(AdminSettings.id == 1))
        settings_row = result.scalar_one_or_none()
        retention_days = (
            settings_row.data_retention_days
            if settings_row and settings_row.data_retention_days is not None
            else _DEFAULT_RETENTION_DAYS
        )

        if retention_days == 0:
            logger.debug("Data-retention cleanup: retention_days=0, purge disabled.")
            return 0

        # Age is measured from updated_at (proxy for resolved_at — Report has no
        # resolved_at column; updated_at reflects the last status transition).
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=retention_days)

        # ── Step 1: collect IDs that are about to be purged ──────────────────
        id_rows = await db.execute(
            sa_select(Report.id)
            .where(Report.status == ReportStatus.RESOLVED)
            .where(Report.updated_at < cutoff)
        )
        candidate_ids: list[int] = [r[0] for r in id_rows.all()]

        if not candidate_ids:
            return 0

        logger.info(
            "Data-retention cleanup: purging %d resolved report(s) resolved before %s. "
            "IDs: %s",
            len(candidate_ids),
            cutoff.date().isoformat(),
            candidate_ids,
        )

        # ── Step 2: delete by ID so the batch is exactly what was logged ─────
        del_result = await db.execute(
            delete(Report)
            .where(Report.id.in_(candidate_ids))
            .execution_options(synchronize_session=False)
        )
        deleted = del_result.rowcount or 0
        await db.commit()

    return deleted


async def start_cleanup_loop() -> None:
    """
    Fire-and-forget loop: sleep 24 h, then purge old resolved reports.
    Designed to be launched with asyncio.create_task() inside the app lifespan
    — mirrors the _load_models_background pattern so the port binds immediately.
    """
    while True:
        await asyncio.sleep(_INTERVAL_SECONDS)
        try:
            deleted = await _run_cleanup()
            if deleted:
                logger.info(
                    "Data-retention cleanup: deleted %d resolved report(s).", deleted
                )
            else:
                logger.debug("Data-retention cleanup: no expired reports found.")
        except Exception:
            logger.exception("Data-retention cleanup failed — will retry in 24 h.")
