"""
SE_CrackAndPothole_Detection — FastAPI application entry point.

Startup order:
  1. Configure logging
  2. Load settings (validates env vars + YOLO model path)
  3. Register exception handlers
  4. Register middleware (CORS → Rate limiter → Audit logger)
  5. Mount static files
  6. Include all routers
  7. Pre-load YOLO model on startup
"""
import os
import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.utils.logger import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

from app.middleware.audit_middleware import AuditMiddleware
from app.middleware.error_handler import (
    validation_exception_handler,
    integrity_error_handler,
    unhandled_exception_handler,
)
from app.middleware.rate_limiter import limiter, rate_limit_exceeded_handler

# Routers
from app.routers import auth, users, reports, projects, notifications, comments, ws
from app.api.v1 import analytics, cctv, media


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="LGU Road Damage Reporting System with AI-powered pothole/crack detection.",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
)

# ── Exception handlers ─────────────────────────────────────────────────────────
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(IntegrityError, integrity_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# ── Middleware (order matters — outermost = last added) ────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(AuditMiddleware)

# ── Static files ───────────────────────────────────────────────────────────────
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ── Routers ────────────────────────────────────────────────────────────────────
PREFIX = settings.API_V1_STR

app.include_router(auth.router,          prefix=PREFIX)
app.include_router(users.router,         prefix=PREFIX)
app.include_router(reports.router,       prefix=PREFIX)
app.include_router(projects.router,      prefix=PREFIX)
app.include_router(notifications.router, prefix=PREFIX)
app.include_router(comments.router,      prefix=PREFIX)
app.include_router(analytics.router,     prefix=PREFIX)
app.include_router(cctv.router,          prefix=PREFIX)
app.include_router(media.router,         prefix=PREFIX)
app.include_router(ws.router)   # WebSocket has no /api/v1 prefix


# ── Startup / shutdown ─────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    logger.info("Starting %s [%s]", settings.PROJECT_NAME, settings.ENVIRONMENT)
    if settings.AI_ENABLED:
        try:
            from app.services.ml_service import load_model
            load_model()
            logger.info("YOLO model loaded successfully.")
        except Exception as e:
            logger.error("Failed to load YOLO model: %s", e)
            logger.warning("AI endpoints will fail until model is available.")
    logger.info("Startup complete.")


@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down.")


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "ai_enabled": settings.AI_ENABLED,
        "fake_detection_enabled": settings.AI_FAKE_DETECTION_ENABLED,
        "version": "1.0.0",
    }