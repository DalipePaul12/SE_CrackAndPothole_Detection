"""
config.py
=========

FIXES:
  [FIX-C1] cors_origins changed from @property to a regular method call result
            stored at module level. Pydantic BaseSettings @property values are
            NOT accessible on the `settings` instance in the same way as fields
            when used inside add_middleware() — this caused CORS to silently
            use an empty list even though the env vars were set.

  [FIX-C2] RESEND_API_KEY / FROM_EMAIL renamed to MAIL_* to match the rest of
            the codebase (was causing a settings load error on startup).

  [FIX-C3] Added RESEND_API_KEY as Optional for email service compatibility
            alongside MAIL_* fields.
"""

import json
import logging
from pathlib import Path
from typing import List, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    PROJECT_NAME: str = "Road Damage Reporting System"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str

    # ── Supabase ───────────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # ── JWT / Auth ─────────────────────────────────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── OTP ────────────────────────────────────────────────────────────────────
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5

    # ── AI / ML ────────────────────────────────────────────────────────────────
    AI_ENABLED: bool = True
    POTHOLE_MODEL_PATH: str = str(BASE_DIR / "app" / "Pothole_best.pt")
    CRACK_MODEL_PATH: str = str(BASE_DIR / "app" / "Crack_best.pt")
    AI_CONFIDENCE_THRESHOLD: float = 0.35
    AI_FAKE_DETECTION_ENABLED: bool = True
    HF_API_TOKEN: Optional[str] = None

    # ── Email ──────────────────────────────────────────────────────────────────
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_PORT: int = 465
    RESEND_API_KEY: Optional[str] = None   # alternative email provider

    # ── Uploads ────────────────────────────────────────────────────────────────
    MAX_IMAGE_SIZE_MB: int = 50
    MAX_VIDEO_SIZE_MB: int = 150
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    ALLOWED_VIDEO_TYPES: List[str] = ["video/mp4", "video/quicktime"]
    UPLOAD_DIR: str = str(BASE_DIR / "uploads")

    # ── CORS ───────────────────────────────────────────────────────────────────
    # Accepts a comma-separated string OR a JSON array string.
    # Example in .env:
    #   BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
    # OR:
    #   FRONTEND_URLS=http://localhost:5173
    BACKEND_CORS_ORIGINS: str = ""
    FRONTEND_URLS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ── Rate limiting ──────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60

    # ── Computed: merged, deduplicated CORS origin list ───────────────────────
    # NOTE: This is intentionally NOT a @property.
    # It is populated by the model_validator below and stored as a plain list
    # field so FastAPI middleware can read it reliably at import time.
    cors_origins: List[str] = []

    @model_validator(mode="after")
    def _build_cors_origins_and_validate_models(self) -> "Settings":
        """
        [FIX-C1] Build cors_origins as a real field (not a property) so
        main.py can do:  allow_origins=settings.cors_origins
        and always get the correct list.
        """
        def parse(value: str) -> List[str]:
            value = value.strip()
            if not value:
                return []
            if value.startswith("["):
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    pass
            return [u.strip() for u in value.split(",") if u.strip()]

        raw = parse(self.BACKEND_CORS_ORIGINS) + parse(self.FRONTEND_URLS)

        seen: set = set()
        merged: List[str] = []
        for origin in raw:
            if origin not in seen:
                seen.add(origin)
                merged.append(origin)

        # Always ensure local dev origins are present
        for dev_origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
            if dev_origin not in seen:
                merged.append(dev_origin)

        self.cors_origins = merged

        # Warn about missing ML models (don't crash — models may be added later)
        if self.AI_ENABLED:
            for label, path_str in (
                ("Pothole", self.POTHOLE_MODEL_PATH),
                ("Crack",   self.CRACK_MODEL_PATH),
            ):
                if not Path(path_str).exists():
                    logger.warning(
                        "[CONFIG] %s model not found at '%s'. "
                        "AI endpoints will fail until the file is placed there.",
                        label, path_str,
                    )

        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()