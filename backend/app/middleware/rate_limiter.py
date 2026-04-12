"""
Rate limiter middleware using slowapi (built on limits library).
Protects all endpoints from abuse and brute-force attacks.

Install: pip install slowapi
"""
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse


def _get_identifier(request: Request) -> str:
    """
    Uses authenticated user public_id if available, otherwise falls back
    to IP address. This prevents IP-sharing from unfairly blocking users.
    """
    user = getattr(request.state, "user", None)
    if user:
        return str(user.public_id)
    return get_remote_address(request)


# Global limiter instance — imported in main.py
limiter = Limiter(key_func=_get_identifier)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom response for rate limit violations."""
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please slow down.",
            "retry_after": str(exc.retry_after),
        },
        headers={"Retry-After": str(exc.retry_after)},
    )


# ── Preset limiters for different sensitivity levels ──────────────────────────
#
# Use these as decorators on route functions:
#
#   @router.post("/auth/login")
#   @limiter.limit("5/minute")      # strict — auth endpoint
#   async def login(request: Request, ...):
#
#   @router.post("/reports")
#   @limiter.limit("20/minute")     # moderate — report submission
#   async def create_report(request: Request, ...):
#
# Limits reference:
#   "5/minute"   — auth endpoints (login, OTP request)
#   "20/minute"  — write endpoints (create report, upload media)
#   "60/minute"  — read endpoints (list reports, get profile)
#   "3/minute"   — sensitive endpoints (password reset, delete account)