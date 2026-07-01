import re
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def _build_async_url(url: str) -> str:
    """
    Convert any postgres URL variant to postgresql+asyncpg://.

    Supabase transaction-pooler URLs use the format:
        postgresql+psycopg2://postgres.{project_id}:{pwd}@{region}.pooler.supabase.com:5432/postgres
    asyncpg does not support the pooler's SCRAM handshake for that username
    format, so we rewrite to the direct host instead:
        postgresql+asyncpg://postgres:{pwd}@db.{project_id}.supabase.co:5432/postgres
    """
    # Detect Supabase pooler URL: username is postgres.<project_id>
    m = re.match(
        r"postgresql(?:\+psycopg2)?://postgres\.([^:]+):([^@]+)@[^/]+\.pooler\.supabase\.com:\d+/(.+)",
        url,
    )
    if m:
        project_id, password, dbname = m.group(1), m.group(2), m.group(3)
        return f"postgresql+asyncpg://postgres:{password}@db.{project_id}.supabase.co:5432/{dbname}"

    # Standard conversions
    url = url.replace("postgresql+psycopg2://", "postgresql://")
    url = url.replace("postgresql://", "postgresql+asyncpg://")
    url = url.replace("postgres://", "postgresql+asyncpg://")
    # Strip sslmode — asyncpg handles SSL natively
    url = url.replace("?sslmode=disable", "").replace("&sslmode=disable", "").replace("sslmode=disable&", "")
    return url


DATABASE_URL = _build_async_url(settings.effective_database_url)

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_timeout=30,
    pool_recycle=1800,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

SessionLocal = AsyncSessionLocal


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


__all__ = ["engine", "AsyncSessionLocal", "SessionLocal", "get_db"]
