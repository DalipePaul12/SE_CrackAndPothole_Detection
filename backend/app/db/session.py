from urllib.parse import quote, urlparse, urlunparse
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def _build_async_url(url: str) -> str:
    """
    Convert any postgres URL variant to postgresql+asyncpg://.
    - Strips all sslmode/ssl query params (asyncpg rejects sslmode; use connect_args).
    - URL-encodes dots in the username so asyncpg doesn't misparse pooler credentials
      like 'postgres.projectid' (common with Supabase).
    """
    url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
    url = url.replace("postgresql://", "postgresql+asyncpg://")
    url = url.replace("postgres://", "postgresql+asyncpg://")

    # Strip every sslmode/ssl variant — asyncpg rejects them as unknown kwargs
    for param in ("sslmode=require", "sslmode=disable", "sslmode=prefer",
                  "ssl=require", "ssl=disable", "ssl=prefer"):
        url = url.replace(f"?{param}", "").replace(f"&{param}", "").replace(f"{param}&", "")
    url = url.rstrip("?")

    # URL-encode dots in username so asyncpg receives the full username intact.
    # e.g. postgres.xyqxtftotueaenqtyrla → postgres%2Exyqxtftotueaenqtyrla
    parsed = urlparse(url)
    if parsed.username and "." in parsed.username:
        encoded_user = quote(parsed.username, safe="")
        # Rebuild netloc with encoded username, keeping password and host intact
        password_part = f":{quote(parsed.password, safe='')}" if parsed.password else ""
        host_part = parsed.hostname or ""
        port_part = f":{parsed.port}" if parsed.port else ""
        new_netloc = f"{encoded_user}{password_part}@{host_part}{port_part}"
        url = urlunparse(parsed._replace(netloc=new_netloc))

    return url


def _needs_ssl(url: str) -> bool:
    """Return True when the connection target requires SSL (e.g. Supabase/RDS)."""
    return "helium" not in url and "localhost" not in url and "127.0.0.1" not in url


_raw_url = settings.effective_database_url
DATABASE_URL = _build_async_url(_raw_url)
_connect_args = {"ssl": "require"} if _needs_ssl(_raw_url) else {}

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_timeout=30,
    pool_recycle=1800,
    connect_args=_connect_args,
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
