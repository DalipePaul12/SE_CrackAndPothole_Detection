
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import get_db
from app.models.report import Report
from app.models.user import User
router = APIRouter()
@router.get("/dashboard-summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    """
    Kinukuha ang summary numbers para sa Admin Dashboard cards.
    """
    total_reports = db.query(Report).count()
    total_pending = db.query(Report).filter(Report.status == "PENDING").count()
    total_validated = db.query(Report).filter(Report.status == "VALIDATED").count()
    total_completed = db.query(Report).filter(Report.status == "COMPLETED").count()
    
    total_users = db.query(User).filter(User.is_active == True).count()
    
    return {
        "total_reports": total_reports,
        "pending": total_pending,
        "validated": total_validated,
        "completed": total_completed,
        "active_users": total_users
    }
@router.get("/severity-stats")
def get_severity_stats(db: Session = Depends(get_db)):
    stats = db.query(
        Report.ai_severity, func.count(Report.id)
    ).group_by(Report.ai_severity).all()
    
    result = {severity or "Unknown": count for severity, count in stats}
    return result
@router.get("/barangay-ranking")
def get_barangay_ranking(db: Session = Depends(get_db)):
    stats = db.query(
        Report.barangay, func.count(Report.id)
    ).group_by(Report.barangay).order_by(func.count(Report.id).desc()).limit(5).all()
    
    return [{"barangay": bgy or "Unidentified", "count": count} for bgy, count in stats]
@router.get("/monthly-reports")
def get_monthly_reports(db: Session = Depends(get_db)):
    stats = db.query(
        func.to_char(Report.created_at, 'YYYY-MM').label("month"), 
        func.count(Report.id)
    ).group_by("month").order_by("month").all()
    
    return [{"month": month, "count": count} for month, count in stats]
@router.get("/confidence-stats")
def get_confidence_stats(db: Session = Depends(get_db)):    
    stats = db.query(
        func.floor(Report.ai_confidence * 10) / 10.0, func.count(Report.id)
    ).group_by(func.floor(Report.ai_confidence * 10) / 10.0).all()
    
    result = {f"{confidence:.1f}": count for confidence, count in stats}
    return result
@router.get("/damage-type-stats")
def get_damage_type_stats(db: Session = Depends(get_db)):    
    stats = db.query(
        Report.ai_damage_type, func.count(Report.id)
    ).group_by(Report.ai_damage_type).all()
    
    result = {damage_type or "Unknown": count for damage_type, count in stats}
    return result
@router.get("/report-status-stats")
def get_report_status_stats(db: Session = Depends(get_db)):    
    stats = db.query(
        Report.status, func.count(Report.id)
    ).group_by(Report.status).all()
    
    result = {status: count for status, count in stats}
    return result
@router.get("/top-active-users")
def get_top_active_users(db: Session = Depends(get_db)):
    stats = db.query(
        User.id, User.username, func.count(Report.id)
    ).join(Report, Report.reported_by_id == User.id
    ).group_by(User.id, User.username
    ).order_by(func.count(Report.id).desc()
    ).limit(5).all()
    
    return [{"user_id": user_id, "username": username, "report_count": count} for user_id, username, count in stats]
@router.get("/cctv-activity-stats")
def get_cctv_activity_stats(db: Session = Depends(get_db)):
    from app.models.cctv import CCTV
    active_cctvs = db.query(CCTV).filter(CCTV.is_active == True).count()
    inactive_cctvs = db.query(CCTV).filter(CCTV.is_active == False).count()
    
    return {
        "active_cctvs": active_cctvs,
        "inactive_cctvs": inactive_cctvs
    }
    
@router.get("/reports-by-cctv")
def get_reports_by_cctv(db: Session = Depends(get_db)):
    from app.models.cctv import CCTV
    stats = db.query(
        CCTV.location_name, func.count(Report.id)
    ).join(Report, Report.cctv_id == CCTV.id
    ).group_by(CCTV.location_name
    ).order_by(func.count(Report.id).desc()
    ).all()
    
    return [{"cctv_location": location or "Unknown", "report_count": count} for location, count in stats]
   
