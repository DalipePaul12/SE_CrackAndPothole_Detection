from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), unique=True)
    
    priority_level = Column(String, default="MEDIUM", index=True) 
    status = Column(String, default="SCHEDULED", index=True) 
    
    assigned_contractor = Column(String, nullable=True)
    estimated_cost = Column(Float, nullable=True)
    
    start_date = Column(DateTime(timezone=True), nullable=True)
    estimated_completion_date = Column(DateTime(timezone=True), nullable=True)
    actual_completion_date = Column(DateTime(timezone=True), nullable=True)
    
    completion_percentage = Column(Float, default=0.0) 
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    report = relationship("Report", back_populates="project")