from __future__ import annotations

import asyncio
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
from app.services.cleanup_service import start_cleanup_loop
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
from app.api.v1 import auth, analytics, audit_logs, cctv, chatbot, contractor, media, ml, notifications, projects, reports, users
from app.api.v1 import settings as settings_router
from app.routers import comments, ws


# ── Lifespan ─────────────────────────────────────────────────────────────────
# Model weights are baked into the Docker image at build time (see Dockerfile),
# so load_models() finds them on disk instantly — no download, no long startup.
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s [%s]", settings.PROJECT_NAME, settings.ENVIRONMENT)

    if settings.AI_ENABLED:
        # Load models BEFORE yield so the download finishes during
        # container startup (which gets full CPU for free on Cloud Run),
        # instead of as a background task that stalls once CPU throttles.
        app.state.models_ready = False
        app.state.models_error = None
        try:
            from app.services.ml_service import load_models
            await asyncio.to_thread(load_models)
            app.state.models_ready = True
            logger.info("ML models loaded and ready.")
        except FileNotFoundError as exc:
            app.state.models_error = str(exc)
            logger.critical("Model weights missing: %s — ML endpoints will fail.", exc)
        except Exception as exc:
            app.state.models_error = str(exc)
            logger.error("Failed to load ML models: %s", exc)
    else:
        app.state.models_ready = False
        app.state.models_error = None
        logger.info("AI_ENABLED=False — skipping model preload.")

    asyncio.create_task(start_cleanup_loop())
    logger.info("Data-retention cleanup loop scheduled.")

    logger.info("Startup complete — server is accepting connections.")
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
app.include_router(contractor.router,    prefix=PREFIX)
app.include_router(comments.router,      prefix=PREFIX)
app.include_router(analytics.router,     prefix=PREFIX)
app.include_router(audit_logs.router,    prefix=PREFIX)
app.include_router(cctv.router,          prefix=PREFIX)
app.include_router(media.router,         prefix=PREFIX)
app.include_router(ml.router,            prefix=PREFIX)
app.include_router(chatbot.router,       prefix=PREFIX)
app.include_router(settings_router.router, prefix=PREFIX)
app.include_router(ws.router)            # WebSocket — no API prefix


# ── Health check ──────────────────────────────────────────────────────────────
# NOTE: Render's health check just needs a 200 + open port — it should NOT
# depend on models_ready, or you'll be back to the same timeout problem.
@app.get("/health", tags=["Health"])
async def health():
    return {
        "status":                   "ok",
        "environment":              settings.ENVIRONMENT,
        "ai_enabled":               settings.AI_ENABLED,
        "models_ready":             getattr(app.state, "models_ready", False),
        "models_error":             getattr(app.state, "models_error", None),
        "fake_detection_enabled":   settings.AI_FAKE_DETECTION_ENABLED,
        "version":                  "1.0.0",
    }