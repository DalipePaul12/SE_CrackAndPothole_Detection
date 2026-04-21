import os
import logging

from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user
from app.models.media_attachment import MediaAttachment
from app.models.ai_detection_result import AIDetectionResult
from app.models.user import User

from app.routers import auth, users, reports, projects, notifications, comments, ws
from app.api.v1 import ml
from app.api.v1 import analytics, cctv, media


# ── FIX-1: lifespan replaces deprecated @app.on_event ────────────────────────
# @app.on_event("startup") is deprecated in FastAPI 0.93+ and will be removed.
# All original startup/shutdown logic is preserved — only the pattern changes.

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting %s [%s]", settings.PROJECT_NAME, settings.ENVIRONMENT)
    if settings.AI_ENABLED:
        try:
            from app.services.ml_service import load_models
            load_models()
            logger.info("Both YOLO models loaded successfully.")
        except Exception as e:
            logger.error("Failed to load YOLO models: %s", e)
            logger.warning("AI endpoints will fail until models are available.")
    logger.info("Startup complete.")

    yield  # app runs here

    # Shutdown
    logger.info("Shutting down.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="LGU Road Damage Reporting System with AI-powered pothole/crack detection.",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,   # FIX-1
)


# Exception handlers — must be registered before middleware
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(IntegrityError, integrity_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


# ── FIX-2: CORS reads from settings.cors_origins instead of hardcoded list ───
# The hardcoded ["http://localhost:5173", ...] means any domain you add to
# BACKEND_CORS_ORIGINS in .env (e.g. staging URL) is silently ignored.
# settings.cors_origins (built in config.py) merges BACKEND_CORS_ORIGINS +
# FRONTEND_URLS and always guarantees the two local dev origins are present.
#
# ⚠️  CORS must stay as the FIRST add_middleware call — do not reorder.

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,   # FIX-2
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(AuditMiddleware)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# ── AI Validation Router ───────────────────────────────────────────────────────

class AIValidateRequest(BaseModel):
    media_id: int


ai_router = APIRouter(prefix="/ai", tags=["AI Validation"])


@ai_router.post("/validate")
async def ai_validate(
    payload: AIValidateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MediaAttachment).where(MediaAttachment.id == payload.media_id)
    )
    media = result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    if media.is_ai_generated is None:
        raise HTTPException(status_code=status.HTTP_202_ACCEPTED, detail="AI validation still processing")

    return {
        "success": True,
        "data": {
            "is_ai_generated": media.is_ai_generated,
            "confidence": media.ai_generated_confidence or 0.0,
            "status": "rejected" if media.is_ai_generated else "approved_for_classification",
        },
    }


# ── ML Classification Router ──────────────────────────────────────────────────

class MLClassifyRequest(BaseModel):
    media_id: int


ml_router = APIRouter(prefix="/ml", tags=["ML Classification"])


@ml_router.post("/classify")
async def ml_classify(
    payload: MLClassifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.media_attachment import ProcessingStatus

    media_result = await db.execute(
        select(MediaAttachment).where(MediaAttachment.id == payload.media_id)
    )
    media = media_result.scalar_one_or_none()

    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")

    if media.is_ai_generated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Media flagged as AI-generated — classification blocked",
        )

    if media.processing_status == ProcessingStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ML classification failed — model could not process this media",
        )

    det_result = await db.execute(
        select(AIDetectionResult)
        .where(AIDetectionResult.media_attachment_id == payload.media_id)
        .order_by(AIDetectionResult.confidence.desc())
    )
    detections = det_result.scalars().all()

    if not detections:
        if not media.is_processed:
            raise HTTPException(status_code=status.HTTP_202_ACCEPTED, detail="ML classification still processing")
        return {"success": True, "data": {"label": "none", "confidence": 0.0, "severity": None}}

    best = detections[0]
    return {
        "success": True,
        "data": {
            "label": best.detected_class.value,
            "confidence": round(best.confidence, 4),
            "severity": best.severity.value if best.severity else None,
        },
    }


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
app.include_router(ml.router,            prefix=PREFIX)
app.include_router(ws.router)


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