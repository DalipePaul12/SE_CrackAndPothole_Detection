"""
Users router.
GET    /users                  — admin: list/search all users (paginated)
GET    /users/me               — get own profile
PATCH  /users/me               — update own profile
POST   /users/me/password      — change password
DELETE /users/me               — request account deletion (RA 10173)
GET    /users/{public_id}      — get public profile (admin or self)
PATCH  /users/{public_id}/role    — superadmin: change user role (privilege-escalation guarded)
PATCH  /users/{public_id}/suspend — admin: toggle is_active
DELETE /users/{public_id}         — superadmin: hard-delete a user
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth_middleware import (
    get_current_user,
    require_admin,
    require_superadmin,
)
from app.middleware.rate_limiter import limiter
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import (
    AdminUserListResponse,
    AdminUserResponse,
    PasswordChangeRequest,
    UserPublic,
    UserResponse,
    UserUpdate,
)
from app.services import auth_service, user_service

router = APIRouter(prefix="/users", tags=["Users"])


# ── Admin: list all users ─────────────────────────────────────────────────────

@router.get("", response_model=AdminUserListResponse)
@limiter.limit("30/minute")
async def list_users(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[UserRole] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = Query(None, max_length=200),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin only — paginated, filterable list of all users."""
    filters = []
    if role is not None:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active == is_active)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            (User.full_name.ilike(term)) | (User.email.ilike(term))
        )

    count_q = select(func.count()).select_from(User)
    if filters:
        count_q = count_q.where(*filters)
    total = await db.scalar(count_q)

    rows_q = select(User).order_by(User.created_at.desc())
    if filters:
        rows_q = rows_q.where(*filters)
    rows_q = rows_q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(rows_q)
    users = result.scalars().all()

    return AdminUserListResponse(
        total=total or 0,
        page=page,
        page_size=page_size,
        results=users,
    )


# ── Self-service endpoints ────────────────────────────────────────────────────

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


# ── Public profile ────────────────────────────────────────────────────────────

@router.get("/{public_id}", response_model=UserPublic)
async def get_user_public_profile(
    public_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = await user_service.get_by_public_id(db, public_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


# ── Admin: role change ────────────────────────────────────────────────────────

@router.patch("/{public_id}/role", response_model=AdminUserResponse)
async def change_user_role(
    public_id: UUID,
    role: UserRole,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Admin only — change a user's role.

    Privilege-escalation guards:
    • An admin cannot modify their own role.
    • Only a superadmin can assign the superadmin role.
    • The last superadmin cannot be demoted.
    """
    # Cannot change own role
    if admin.public_id == public_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot modify your own role.",
        )

    # Only superadmin may assign superadmin
    if role == UserRole.superadmin and admin.role != UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superadmin can assign the superadmin role.",
        )

    user = await user_service.get_by_public_id(db, public_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Cannot demote the last superadmin
    if user.role == UserRole.superadmin and role != UserRole.superadmin:
        count = await db.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.superadmin)
        )
        if (count or 0) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last superadmin.",
            )

    user.role = role
    await db.commit()
    await db.refresh(user)
    return user


# ── Admin: suspend / reactivate ───────────────────────────────────────────────

@router.patch("/{public_id}/suspend", response_model=AdminUserResponse)
async def toggle_user_suspension(
    public_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin only — toggle a user's is_active flag (suspend / reactivate)."""
    if admin.public_id == public_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot suspend your own account.",
        )

    user = await user_service.get_by_public_id(db, public_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user.is_active = not user.is_active
    await db.commit()
    await db.refresh(user)
    return user


# ── Superadmin: hard-delete a user ────────────────────────────────────────────

@router.delete("/{public_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_user(
    public_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_superadmin),
):
    """Superadmin only — permanently delete a user record."""
    if admin.public_id == public_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )

    user = await user_service.get_by_public_id(db, public_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Guard: cannot delete the last superadmin
    if user.role == UserRole.superadmin:
        count = await db.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.superadmin)
        )
        if (count or 0) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last superadmin.",
            )

    await db.delete(user)
    await db.commit()
