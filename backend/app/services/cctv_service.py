"""
CCTV service — CRUD for CCTV camera management.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cctv import CCTV


async def list_cctvs(
    db: AsyncSession,
    active_only: bool = False,
    barangay: Optional[str] = None,
) -> list[CCTV]:
    query = select(CCTV)
    if active_only:
        query = query.where(CCTV.is_active == True)
    if barangay:
        query = query.where(CCTV.barangay.ilike(f"%{barangay}%"))
    query = query.order_by(CCTV.location_name)
    result = await db.execute(query)
    return result.scalars().all()


async def get_cctv(db: AsyncSession, cctv_id: int) -> Optional[CCTV]:
    return await db.get(CCTV, cctv_id)


async def create_cctv(
    db: AsyncSession,
    location_name: str,
    latitude: float,
    longitude: float,
    stream_url: str,
    added_by_id: int,
    barangay: Optional[str] = None,
    city: Optional[str] = None,
) -> CCTV:
    cctv = CCTV(
        location_name=location_name,
        latitude=latitude,
        longitude=longitude,
        stream_url=stream_url,
        added_by_id=added_by_id,
        barangay=barangay,
        city=city,
        is_active=True,
    )
    db.add(cctv)
    await db.commit()
    await db.refresh(cctv)
    return cctv


async def update_cctv(
    db: AsyncSession,
    cctv: CCTV,
    **fields,
) -> CCTV:
    for key, value in fields.items():
        if value is not None and hasattr(cctv, key):
            setattr(cctv, key, value)
    await db.commit()
    await db.refresh(cctv)
    return cctv


async def delete_cctv(db: AsyncSession, cctv: CCTV) -> None:
    await db.delete(cctv)
    await db.commit()