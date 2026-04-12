"""
CCTV router — camera management endpoints.

POST   /cctv/          — add camera (admin)
GET    /cctv/          — list cameras (admin/contractor)
GET    /cctv/{id}      — get camera details
PUT    /cctv/{id}      — update camera (admin)
DELETE /cctv/{id}      — remove camera (admin)
PATCH  /cctv/{id}/toggle — toggle active status (admin)
"""
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, AnyUrl
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import (
    get_current_user, require_admin, require_admin_or_contractor,
)
from app.models.user import User
from app.services import cctv_service

router = APIRouter(prefix="/cctv", tags=["CCTV"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class CCTVCreate(BaseModel):
    location_name: str
    latitude: float
    longitude: float
    stream_url: str        # rtsp:// or http:// validated at service level
    barangay: Optional[str] = None
    city: Optional[str] = None


class CCTVUpdate(BaseModel):
    location_name: Optional[str] = None
    stream_url: Optional[str] = None
    barangay: Optional[str] = None
    city: Optional[str] = None
    is_active: Optional[bool] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def add_cctv(
    data: CCTVCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin only — register a new CCTV camera."""
    # Validate Philippines bounding box
    if not (4.5 <= data.latitude <= 21.5):
        raise HTTPException(status_code=400, detail="Latitude must be within the Philippines.")
    if not (116.0 <= data.longitude <= 127.0):
        raise HTTPException(status_code=400, detail="Longitude must be within the Philippines.")

    cctv = await cctv_service.create_cctv(
        db,
        location_name=data.location_name,
        latitude=data.latitude,
        longitude=data.longitude,
        stream_url=data.stream_url,
        added_by_id=current_user.id,
        barangay=data.barangay,
        city=data.city,
    )
    return cctv


@router.get("/")
async def list_cctvs(
    active_only: bool = False,
    barangay: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin_or_contractor),
):
    """Admin/contractor — list all cameras, optionally filtered."""
    return await cctv_service.list_cctvs(db, active_only=active_only, barangay=barangay)


@router.get("/{cctv_id}")
async def get_cctv(
    cctv_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin_or_contractor),
):
    cctv = await cctv_service.get_cctv(db, cctv_id)
    if not cctv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found.")
    return cctv


@router.put("/{cctv_id}")
async def update_cctv(
    cctv_id: int,
    data: CCTVUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    cctv = await cctv_service.get_cctv(db, cctv_id)
    if not cctv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found.")

    return await cctv_service.update_cctv(db, cctv, **data.model_dump(exclude_none=True))


@router.patch("/{cctv_id}/toggle")
async def toggle_cctv(
    cctv_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin — flip the is_active flag."""
    cctv = await cctv_service.get_cctv(db, cctv_id)
    if not cctv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found.")

    cctv.is_active = not cctv.is_active
    if cctv.is_active:
        cctv.last_maintenance = datetime.now(timezone.utc)
    await db.commit()
    return {"id": cctv.id, "is_active": cctv.is_active}


@router.delete("/{cctv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cctv(
    cctv_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    cctv = await cctv_service.get_cctv(db, cctv_id)
    if not cctv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found.")
    await cctv_service.delete_cctv(db, cctv)