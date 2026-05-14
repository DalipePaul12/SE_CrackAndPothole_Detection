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

    DATABASE_URL: str

    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5

    REDIS_URL: str = "redis://localhost:6379/0"

    AI_ENABLED: bool = True
    POTHOLE_MODEL_PATH: str = str(BASE_DIR / "app" / "Pothole_best.pt")
    CRACK_MODEL_PATH: str = str(BASE_DIR / "app" / "Crack_best.pt")
    AI_CONFIDENCE_THRESHOLD: float = 0.35
    AI_FAKE_DETECTION_ENABLED: bool = True
    HF_API_TOKEN: Optional[str] = None

    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_PORT: int = 465
    RESEND_API_KEY: Optional[str] = None

    MAX_IMAGE_SIZE_MB: int = 50
    MAX_VIDEO_SIZE_MB: int = 150
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    ALLOWED_VIDEO_TYPES: List[str] = ["video/mp4", "video/quicktime"]
    UPLOAD_DIR: str = str(BASE_DIR / "uploads")

    BACKEND_CORS_ORIGINS: str = ""
    FRONTEND_URLS: str = "http://localhost:5173,http://127.0.0.1:5173"

    RATE_LIMIT_PER_MINUTE: int = 60

    cors_origins: List[str] = []

    @model_validator(mode="after")
    def _build_cors_origins_and_validate_models(self) -> "Settings":
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

        for dev_origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
            if dev_origin not in seen:
                merged.append(dev_origin)

        self.cors_origins = merged

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