from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse


def _get_identifier(request: Request) -> str:
    user = getattr(request.state, "user", None)
    if user:
        return str(user.public_id)
    return get_remote_address(request)


limiter = Limiter(key_func=_get_identifier)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please slow down.",
            "retry_after": str(exc.retry_after),
        },
        headers={"Retry-After": str(exc.retry_after)},
    )