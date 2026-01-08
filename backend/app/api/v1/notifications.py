
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.notification import Notification
from app.models.user import User
from app.api.v1.auth import get_current_user

router = APIRouter()

@router.get("/")
def get_my_notifications(
    skip: int = 0, 
    limit: int = 20, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Fetch logged-in user's notifications."""
    return db.query(Notification)\
        .filter(Notification.user_id == current_user.id)\
        .order_by(Notification.created_at.desc())\
        .offset(skip).limit(limit).all()
@router.put("/read-all")
def mark_all_as_read(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications as read."""
    db.query(Notification)\
        .filter(Notification.user_id == current_user.id, Notification.is_read == False)\
        .update({"is_read": True})
        
    db.commit()
    return {"message": "All notifications marked as read"}
@router.put("/{notification_id}/read")
def mark_notification_as_read(
    notification_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Mark a specific notification as read."""
    notif = db.query(Notification).filter(
        Notification.id == notification_id, 
        Notification.user_id == current_user.id
    ).first()
    
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notif.is_read = True
    db.commit()
    return {"message": "Marked as read"}
@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Delete a specific notification."""
    notif = db.query(Notification).filter(
        Notification.id == notification_id, 
        Notification.user_id == current_user.id
    ).first()
    
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    db.delete(notif)
    db.commit()
    return {"message": "Notification deleted"}  
@router.delete("/clear-all")
def clear_all_notifications(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Delete all notifications for the logged-in user."""
    db.query(Notification)\
        .filter(Notification.user_id == current_user.id)\
        .delete()
    db.commit()
    return {"message": "All notifications cleared"}

