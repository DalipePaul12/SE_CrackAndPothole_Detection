"""
User service — CRUD operations and business logic for users.
All DB access goes through this layer; routers stay thin.
"""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
# FIX: hash_password here now delegates to passlib (core/security.py)
# via auth_service — so registration and login use the same hashing library.
from app.services.auth_service import hash_password


async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_public_id(db: AsyncSession, public_id: UUID) -> Optional[User]:
    result = await db.execute(
        select(User).where(User.public_id == public_id)
    )
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    existing = await get_by_email(db, data.email)
    if existing:
        raise ValueError("An account with this email already exists.")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),  # passlib bcrypt
        full_name=data.full_name,
        contact_number=data.contact_number,
        city=data.city,
        barangay=data.barangay,
        street=data.street,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(
    db: AsyncSession, user: User, data: UserUpdate
) -> User:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


async def record_login(db: AsyncSession, user: User) -> None:
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()


async def request_deletion(db: AsyncSession, user: User) -> None:
    """
    RA 10173 — right to erasure.
    Sets deletion_requested_at; a background job will anonymise PII.
    """
    user.deletion_requested_at = datetime.now(timezone.utc)
    user.is_active = False
    await db.commit()