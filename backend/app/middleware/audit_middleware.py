"""
AuditMiddleware — logs every mutating request (POST/PUT/PATCH/DELETE)
to the audit_logs table for security and traceability.

Skips: GET, HEAD, OPTIONS, health check, docs endpoints.
DB failures are caught and logged so they never surface to the client.
"""
import logging
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.db.session import AsyncSessionLocal
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# Endpoints we never audit (noise / not meaningful)
_SKIP_PATHS = {"/health", "/docs", "/redoc", "/openapi.json", "/favicon.ico"}

# Only audit state-changing methods
_AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _extract_resource(path: str) -> Optional[str]:
    """
    Best-effort parse of the resource name from a path.
    /api/v1/reports/42  ->  "reports"
    /api/v1/users       ->  "users"
    """
    parts = [p for p in path.split("/") if p]
    # Strip leading "api" / "v1" prefix segments
    for skip in ("api", "v1"):
        if parts and parts[0] == skip:
            parts.pop(0)
    return parts[0] if parts else None


def _extract_target_id(path: str) -> Optional[int]:
    """Return the last numeric segment of the path as the target id."""
    for part in reversed(path.rstrip("/").split("/")):
        if part.isdigit():
            return int(part)
    return None


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Only log mutating requests to non-trivial paths
        if request.method not in _AUDIT_METHODS:
            return response
        if request.url.path in _SKIP_PATHS:
            return response

        try:
            await self._write_log(request, response.status_code)
        except Exception:
            # Audit failure must NEVER break the request or propagate upward
            logger.exception("AuditMiddleware failed to write log")

        return response

    async def _write_log(self, request: Request, status_code: int) -> None:
        # Grab authenticated user if auth middleware already attached it
        user    = getattr(request.state, "user", None)
        user_id: Optional[int] = user.id if user else None

        # Build action string — e.g. "POST /api/v1/reports -> 201"
        action    = f"{request.method} {request.url.path} -> {status_code}"
        resource  = _extract_resource(request.url.path)
        target_id = _extract_target_id(request.url.path)

        ip = request.headers.get(
            "X-Forwarded-For",
            request.client.host if request.client else None,
        )
        user_agent = request.headers.get("User-Agent")

        try:
            async with AsyncSessionLocal() as db:
                async with db.begin():
                    db.add(AuditLog(
                        user_id=user_id,
                        action=action,
                        target_resource=resource,
                        target_id=target_id,
                        details={"query_params": str(request.query_params) or None},
                        ip_address=ip,
                        user_agent=user_agent,
                    ))
        except Exception as exc:
            # Log but swallow — a stale DB connection must not crash the app
            logger.warning(
                "AuditMiddleware: DB write skipped due to connection error: %s", exc
            )