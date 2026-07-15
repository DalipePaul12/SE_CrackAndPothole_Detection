"""
Users router.
GET    /users/me                — get own profile
PATCH  /users/me                — update own profile
POST   /users/me/password       — change password
DELETE /users/me                — request account deletion (RA 10173)
GET    /users/{public_id}       — get public profile (admin or self)
PATCH  /users/{public_id}/role  — admin: change user role
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user, require_admin
from app.middleware.rate_limiter import limiter
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import PasswordChangeRequest, UserPublic, UserResponse, UserUpdate
from app.services import auth_service, user_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await user_service.update_user(db, current_user, data)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
async def change_password(
    request: Request,
    data: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not auth_service.verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    current_user.hashed_password = auth_service.hash_password(data.new_password)
    await db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def request_account_deletion(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """RA 10173 — marks account for deletion. PII anonymised by background job."""
    await user_service.request_deletion(db, current_user)


@router.get("/{public_id}", response_model=UserPublic)
async def get_user_public_profile(
    public_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only the profile owner or an admin/superadmin may view a profile.
    _ADMIN_ROLES = (UserRole.admin, UserRole.superadmin)
    is_own_profile = current_user.public_id == public_id
    is_admin = current_user.role in _ADMIN_ROLES
    if not is_own_profile and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view this profile.",
        )
    user = await user_service.get_by_public_id(db, public_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.patch("/{public_id}/role", response_model=UserResponse)
async def change_user_role(
    public_id: UUID,
    role: UserRole,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin only — change a user's role."""
    user = await user_service.get_by_public_id(db, public_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.role = role
    await db.commit()
    await db.refresh(user)
    return user