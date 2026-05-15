from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from app import models  # noqa: F401 — ensures all models are registered with Base

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError          # ✅ FIX: was missing
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.middleware.audit_middleware import AuditMiddleware
from app.middleware.error_handler import (
    integrity_error_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.middleware.rate_limiter import limiter, rate_limit_exceeded_handler
from app.utils.logger import configure_logging

# ── Logging must be configured before any module-level loggers fire ──────────
configure_logging()
logger = logging.getLogger(__name__)

# ── Routers — imported after logging so their module-level loggers work ──────
from app.api.v1 import auth, analytics, cctv, media, ml, notifications, projects, reports, users
from app.routers import comments, ws


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s [%s]", settings.PROJECT_NAME, settings.ENVIRONMENT)

    if settings.AI_ENABLED:
        try:
            from app.services.ml_service import load_models
            load_models()
            logger.info("ML models loaded and ready.")
        except FileNotFoundError as exc:
            logger.critical("Model weights missing: %s — ML endpoints will fail.", exc)
        except Exception as exc:
            logger.error("Failed to preload ML models: %s", exc)
    else:
        logger.info("AI_ENABLED=False — skipping model preload.")

    logger.info("Startup complete.")
    yield
    logger.info("Shutting down %s.", settings.PROJECT_NAME)


# ── App factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="LGU Road Damage Reporting System with AI-powered pothole/crack detection.",
    docs_url="/docs"        if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc"      if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# ── Exception handlers (must be registered on `app`, never on APIRouter) ─────
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(IntegrityError,         integrity_error_handler)
app.add_exception_handler(Exception,              unhandled_exception_handler)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(AuditMiddleware)


# ── Static file serving ───────────────────────────────────────────────────────
# No auth on /uploads — browsers load <img src> without Authorization headers.
# UUID-prefixed filenames make paths unguessable, which is sufficient protection.
@app.get("/uploads/{file_path:path}", include_in_schema=False)
async def serve_media(file_path: str):
    upload_dir = Path(settings.UPLOAD_DIR)
    full_path  = upload_dir / file_path

    # Path-traversal guard
    try:
        full_path.resolve().relative_to(upload_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path.")

    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")

    return FileResponse(full_path)


# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = settings.API_V1_STR

app.include_router(auth.router,          prefix=PREFIX)
app.include_router(users.router,         prefix=PREFIX)
app.include_router(reports.router,       prefix=PREFIX)
app.include_router(notifications.router, prefix=PREFIX)
app.include_router(projects.router,      prefix=PREFIX)
app.include_router(comments.router,      prefix=PREFIX)
app.include_router(analytics.router,     prefix=PREFIX)
app.include_router(cctv.router,          prefix=PREFIX)
app.include_router(media.router,         prefix=PREFIX)
app.include_router(ml.router,            prefix=PREFIX)
app.include_router(ws.router)            # WebSocket — no API prefix


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {
        "status":                   "ok",
        "environment":              settings.ENVIRONMENT,
        "ai_enabled":               settings.AI_ENABLED,
        "fake_detection_enabled":   settings.AI_FAKE_DETECTION_ENABLED,
        "version":                  "1.0.0",
    }