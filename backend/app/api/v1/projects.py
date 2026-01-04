
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from pydantic import BaseModel
from app.db.session import get_db
from app.models.project import Project
from app.models.report import Report
from app.models.user import User
from app.api.v1.auth import get_current_user
router = APIRouter()
# --- SCHEMAS ---
class ProjectCreate(BaseModel):
    report_id: int
    priority: str
    contractor: str
    estimated_cost: float
    start_date: datetime
class ProjectUpdate(BaseModel):
    status: str
    completion_percentage: float
# --- ENDPOINTS ---
@router.post("/")
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin: Create a repair project from a report."""
    # 1. Auth Check
    if current_user.role not in ["lgu_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    # 2. Check if Report Exists
    report = db.query(Report).filter(Report.id == data.report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report ID not found")
    # 3. Check if Project already exists
    existing = db.query(Project).filter(Project.report_id == data.report_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Project already exists for this report")
    # 4. Create Project
    new_project = Project(
        report_id=data.report_id,
        priority_level=data.priority,
        assigned_contractor=data.contractor,
        estimated_cost=data.estimated_cost,
        start_date=data.start_date,
        status="SCHEDULED",
        completion_percentage=0.0
    )
    
    # 5. Update Report Status automatically
    report.status = "IN_PROGRESS"
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project
@router.get("/")
def get_projects(db: Session = Depends(get_db)):
    """
    Get all projects WITH report details (joinedload).
    This allows the frontend to see the location/image of the project.
    """
    return db.query(Project).options(joinedload(Project.report)).all()
@router.put("/{project_id}/status")
def update_project_status(
    project_id: int,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update project progress (e.g. 50% -> 100%)."""
    if current_user.role not in ["lgu_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    project.status = data.status
    project.completion_percentage = data.completion_percentage
    
    # If the project is marked as COMPLETED
    if data.status == "COMPLETED" or data.completion_percentage == 100.0:
        project.status = "COMPLETED" 
        project.actual_completion_date = datetime.now()
        
        report = db.query(Report).filter(Report.id == project.report_id).first()
        if report:
            report.status = "COMPLETED"
    db.commit()
    return {"message": "Project updated", "status": project.status}
@router.get("/{project_id}")
def get_project_details(
    project_id: int,
    db: Session = Depends(get_db)
):
    """Get project details by ID."""
    project = db.query(Project).options(joinedload(Project.report)).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin: Delete a project by ID."""
    if current_user.role not in ["lgu_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    db.delete(project)
    db.commit()
    return {"message": "Project deleted"}
