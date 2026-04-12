from pathlib import Path
from typing import List, Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── App ────────────────────────────────────────────────────────────────────
    PROJECT_NAME: str = "Road Damage Reporting System"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str

    # ── Supabase Storage ───────────────────────────────────────────────────────
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str

    # ── JWT Auth ───────────────────────────────────────────────────────────────
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── OTP ────────────────────────────────────────────────────────────────────
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5

    # ── AI / ML ────────────────────────────────────────────────────────────────
    AI_ENABLED: bool = False
    YOLO_MODEL_PATH: str = "yolov11s.pt"
    AI_CONFIDENCE_THRESHOLD: float = 0.5
    AI_FAKE_DETECTION_ENABLED: bool = False
    HIVE_API_KEY: Optional[str] = None

    # ── Email ──────────────────────────────────────────────────────────────────
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_PORT: int = 465

    # ── File Upload ────────────────────────────────────────────────────────────
    MAX_IMAGE_SIZE_MB: int = 10
    MAX_VIDEO_SIZE_MB: int = 100
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/png", "image/webp"]
    ALLOWED_VIDEO_TYPES: List[str] = ["video/mp4", "video/quicktime"]
    UPLOAD_DIR: str = "uploads"          # kept as fallback for local dev only

    # ── CORS ───────────────────────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Rate Limiting ──────────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60

    @model_validator(mode="after")
    def yolo_model_must_exist_if_enabled(self) -> "Settings":
        if self.AI_ENABLED and not Path(self.YOLO_MODEL_PATH).exists():
            raise ValueError(
                f"YOLO model file not found: '{self.YOLO_MODEL_PATH}'. "
                "Set YOLO_MODEL_PATH in .env, or set AI_ENABLED=False."
            )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",       # all unknown .env keys (MAP_PROVIDER, etc.) are silently ignored
    )


settings = Settings()