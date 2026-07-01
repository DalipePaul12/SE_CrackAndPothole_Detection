"""
Alembic sync migration environment (psycopg2).
Reads DATABASE_URL from settings so no credentials are hardcoded.

Usage:
    alembic revision --autogenerate -m "description"
    alembic upgrade head
"""
import re
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# ── Load app settings ──────────────────────────────────────────────────────────
from app.core.config import settings

# Import all models so Alembic can detect them
from app.db.init_db import *  # noqa: F401, F403
from app.db.base import Base
import app.models  # noqa: F401


def _build_sync_url(url: str) -> str:
    """
    Convert to a psycopg2-compatible synchronous URL for Alembic migrations.
    Supabase pooler URLs (postgres.<project_id>@*.pooler.supabase.com) work
    fine with psycopg2 — just ensure the scheme is postgresql+psycopg2://.
    """
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("postgres://", "postgresql://")
    # Normalise to psycopg2 driver
    if "postgresql://" in url and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://")
    # Strip asyncpg-incompatible params that psycopg2 handles via libpq
    url = url.replace("?sslmode=disable", "").replace("&sslmode=disable", "").replace("sslmode=disable&", "")
    return url


# ── Alembic config ─────────────────────────────────────────────────────────────
config = context.config

config.set_main_option("sqlalchemy.url", _build_sync_url(settings.effective_database_url))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """Exclude PostGIS system tables from migrations."""
    if type_ == "table" and name in (
        "spatial_ref_sys", "geometry_columns", "geography_columns",
        "raster_columns", "raster_overviews",
    ):
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
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
