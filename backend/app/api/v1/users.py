
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.db.session import get_db
from app.models.user import User
from app.api.v1.auth import get_current_user   
router = APIRouter()
# --- SCHEMAS (Validation) ---
class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    contact_number: Optional[str] = None
    # 1. NEW: Allow updating address
    city: Optional[str] = None
    barangay: Optional[str] = None
    country: Optional[str] = None
class AdminUserUpdate(BaseModel):
    role: str 
    is_active: bool
# --- ENDPOINTS ---
@router.get("/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    """Fetches the current logged-in user's profile."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "reputation_score": current_user.reputation_score,
        "contact_number": current_user.contact_number,
        # 2. NEW: Return location info
        "country": current_user.country,
        "city": current_user.city,
        "barangay": current_user.barangay,
        "is_active": current_user.is_active
    }
@router.put("/me")
def update_my_profile(
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Allow user to update their name, contact, or address."""
    if data.full_name:
        current_user.full_name = data.full_name
    if data.contact_number:
        current_user.contact_number = data.contact_number
    
    # 3. NEW: Logic update address
    if data.city:
        current_user.city = data.city
    if data.barangay:
        current_user.barangay = data.barangay
    if data.country:
        current_user.country = data.country
    
    db.commit()
    db.refresh(current_user)
    return {"message": "Profile updated successfully", "user": read_users_me(current_user)}
@router.get("/")
def read_all_users(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Admin Only: View all registered users."""
    if current_user.role not in ["lgu_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    users = db.query(User).offset(skip).limit(limit).all()
    
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "barangay": u.barangay, 
            "city": u.city,
            "created_at": u.created_at
        } for u in users
    ]
@router.put("/{user_id}/role-status")
def admin_update_user(
    user_id: int,
    data: AdminUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only Super Admins can manage roles")
    user_to_edit = db.query(User).filter(User.id == user_id).first()
    if not user_to_edit:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user_to_edit.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot edit your own role here.")
    user_to_edit.role = data.role
    user_to_edit.is_active = data.is_active
    
    db.commit()
    return {"message": f"User {user_to_edit.email} updated: Role={data.role}, Active={data.is_active}"}

