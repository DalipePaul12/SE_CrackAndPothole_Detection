"""
Structured logging setup.
Import configure_logging() in main.py startup.
"""
import logging
import sys
from app.core.config import settings


def configure_logging() -> None:
    """
    Sets up root logger with consistent format.
    In production, swap the StreamHandler for a JSON handler
    (e.g. python-json-logger) to feed into your log aggregator.
    """
    level = logging.DEBUG if settings.ENVIRONMENT == "development" else logging.INFO

    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    logging.basicConfig(
        level=level,
        format=fmt,
        datefmt=datefmt,
        stream=sys.stdout,
    )

    # Quiet noisy libraries
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.ENVIRONMENT == "development" else logging.WARNING
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    logging.getLogger(__name__).info(
        f"Logging configured — level={logging.getLevelName(level)} env={settings.ENVIRONMENT}"
    )