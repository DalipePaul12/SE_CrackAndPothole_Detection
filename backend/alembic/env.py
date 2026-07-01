"""
Alembic async migration environment.
Reads DATABASE_URL from settings so no credentials are hardcoded.

Usage:
    alembic revision --autogenerate -m "description"
    alembic upgrade head
"""
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# ── Load app settings ──────────────────────────────────────────────────────────
from app.core.config import settings

# Import all models so Alembic can detect them
from app.db.init_db import *  # noqa: F401, F403
from app.db.base import Base
import app.models 

# ── Alembic config ─────────────────────────────────────────────────────────────
config = context.config

# Set the DB URL from settings (overrides the empty value in alembic.ini)
def _build_async_url(url: str) -> str:
    url = url.replace("postgresql+psycopg2://", "postgresql://")
    url = url.replace("postgresql://", "postgresql+asyncpg://")
    url = url.replace("postgres://", "postgresql+asyncpg://")
    url = url.replace("?sslmode=disable", "").replace("&sslmode=disable", "").replace("sslmode=disable&", "")
    return url

config.set_main_option("sqlalchemy.url", _build_async_url(settings.DATABASE_URL))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def include_object(object, name, type_, reflected, compare_to):
    """Exclude PostGIS system tables from migrations."""
    if type_ == "table" and name in ("spatial_ref_sys", "geometry_columns", "geography_columns", "raster_columns", "raster_overviews"):
        return False
    return True
# ── Run migrations ─────────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()