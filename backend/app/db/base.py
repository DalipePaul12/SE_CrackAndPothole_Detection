"""
Single shared SQLAlchemy Base for ALL models.
Every model must inherit from this class so Alembic can detect them.
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass