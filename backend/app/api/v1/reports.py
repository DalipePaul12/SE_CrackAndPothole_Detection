
import os
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Request, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel 
from app.db.session import get_db
from app.models.report import Report
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.user import User
from app.models.comment import Comment 
from app.models.cctv import CCTV  # Siguraduhing nagawa mo na ito sa models
from app.api.v1.auth import get_current_user
# --- UTILS IMPORTS ---
from app.utils.image import save_upload_file
from app.utils.ai import analyze_image
from app.utils.geo import calculate_distance # Import para sa CCTV proximity check
router = APIRouter()
# --- SCHEMAS ---
class CommentCreate(BaseModel):
    content: str
# --- ENDPOINTS ---
@router.post("/submit")
async def submit_report(
    request: Request,
    latitude: float = Form(...),
    longitude: float = Form(...),
    description: str = Form(...),
    barangay: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. SAVE IMAGE
    try:
        filename = save_upload_file(file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")
    # 2. GENERATE URL
    base_url = str(request.base_url)
    image_url = f"{base_url}uploads/{filename}"
    # 3. AI ANALYSIS (YOLOv8 + Fake Detection)
    file_path = f"uploads/{filename}"
    ai_result = analyze_image(file_path)
    
    damage_type = ai_result.get("damage_type", "Unknown")
    severity = ai_result.get("severity", "Low")
    confidence = ai_result.get("confidence", 0.0)
    is_valid = ai_result.get("valid", True)
    
    # 4. SAVE TO DB
    new_report = Report(
        owner_id=current_user.id,
        latitude=latitude,
        longitude=longitude,
        barangay=barangay,
        description=description,
        image_url=image_url,
        ai_damage_type=damage_type,
        ai_severity=severity,
        ai_confidence=confidence,
        is_flagged_fake=not is_valid, # Flagged kung suspicious
        status="PENDING"
    )
    
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    
    # Ibabalik ang report kasama ang AI analysis para sa Frontend Warning
    return {
        "report": new_report,
        "ai_analysis": ai_result 
    }
# --- NEW: CCTV NEARBY CHECK (Para sa Admin Map View) ---
@router.get("/{report_id}/nearby-cctv")
def get_nearby_cctv(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Kukuha ng listahan ng mga aktibong CCTV malapit sa report radius (100m).
    """
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    # Kukunin lahat ng CCTV na active
    cameras = db.query(CCTV).filter(CCTV.is_active == True).all()
    
    nearby_list = []
    for cam in cameras:
        # Gamit ang geo util function
        dist = calculate_distance(report.latitude, report.longitude, cam.latitude, cam.longitude)
        
        # Isama kung malapit (100 meters)
        if dist <= 100:
            nearby_list.append({
                "id": cam.id,
                "name": cam.location_name,
                "lat": cam.latitude,
                "lng": cam.longitude,
                "distance_meters": round(dist, 2),
                "stream_url": cam.stream_url # Ito ang iki-click sa map
            })
            
    return nearby_list
@router.get("/")
def get_reports(status: str = None, db: Session = Depends(get_db)):
    query = db.query(Report)
    if status:
        query = query.filter(Report.status == status)
    return query.all()
@router.get("/my-reports")
def get_my_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Report).filter(Report.owner_id == current_user.id).all()
@router.put("/{report_id}/validate")
def validate_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ["lgu_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.status = "VALIDATED"
    report.updated_at = datetime.now()
    
    notif = Notification(
        user_id=report.owner_id,
        title="Report Validated",
        message=f"Your report in {report.barangay} has been validated.",
        type="success"
    )
    db.add(notif)
    log = AuditLog(
        user_id=current_user.id,
        action="VALIDATE_REPORT",
        target_resource=f"Report ID {report_id}",
        details="Report marked as validated via CCTV/Field verification."
    )
    db.add(log)
    
    db.commit()
    return {"message": "Report validated successfully"}
@router.put("/{report_id}/decline")
def decline_report(
    report_id: int, 
    reason: str = Form(...), 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["lgu_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.status = "DECLINED"
    report.decline_reason = reason
    report.updated_at = datetime.now()
    
    notif = Notification(
        user_id=report.owner_id,
        title="Report Declined",
        message=f"Reason: {reason}",
        type="warning"
    )
    db.add(notif)
    
    log = AuditLog(
        user_id=current_user.id,
        action="DECLINE_REPORT",
        target_resource=f"Report ID {report_id}",
        details=f"Reason: {reason}"
    )
    db.add(log)
    db.commit()
    return {"message": "Report declined"}
# --- COMMENTS ---
@router.post("/{report_id}/comments")
def add_comment(report_id: int, comment_data: CommentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    new_comment = Comment(
        report_id=report_id,
        user_id=current_user.id,
        content=comment_data.content
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    return new_comment
@router.get("/{report_id}/comments")
def get_comments(report_id: int, db: Session = Depends(get_db)):
    return db.query(Comment)\
        .options(joinedload(Comment.user))\
        .filter(Comment.report_id == report_id)\
        .order_by(Comment.created_at.asc())\
        .all()
@router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id and current_user.role not in ["lgu_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
    db.delete(comment)
    db.commit()
    return {"message": "Comment deleted"}

@router.get("/{report_id}")
def get_report_details(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report
@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ["lgu_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    # Optionally delete the image file from storage
    image_path = report.image_url.replace(str(request.base_url) + "uploads/", "uploads/")
    if os.path.exists(image_path):
        os.remove(image_path)
    db.delete(report)
    db.commit()
    return {"message": "Report deleted"}
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    