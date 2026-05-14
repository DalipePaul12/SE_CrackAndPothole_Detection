import logging
import sys

from app.core.config import settings

logger = logging.getLogger("snap2fix")


def configure_logging() -> None:
    level = logging.DEBUG if settings.ENVIRONMENT == "development" else logging.INFO

    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    logging.basicConfig(
        level=level,
        format=fmt,
        datefmt=datefmt,
        stream=sys.stdout,
    )

    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if settings.ENVIRONMENT == "development" else logging.WARNING
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    logging.getLogger(__name__).info(
        "Logging configured | level=%s | env=%s",
        logging.getLevelName(level),
        settings.ENVIRONMENT,
    )