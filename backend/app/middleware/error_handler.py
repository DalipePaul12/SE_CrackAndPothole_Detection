"""
Global exception handlers — converts unhandled exceptions into
consistent JSON error responses instead of 500 stack traces.
Register in main.py.
"""
import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Convert Pydantic validation errors to a clean 422 response."""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": " → ".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        })
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error.", "errors": errors},
    )


async def integrity_error_handler(request: Request, exc: IntegrityError):
    """Convert DB unique-constraint violations to clean 409 responses."""
    logger.warning(f"DB IntegrityError on {request.url}: {exc.orig}")
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "A record with this data already exists."},
    )


async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all — log the full trace, return safe 500."""
    import traceback
    traceback.print_exc()          # ADD THIS — prints to stdout no matter what
    logger.error(
        f"Unhandled exception on {request.method} {request.url}",
        exc_info=exc,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected error occurred. Please try again later."},
    )