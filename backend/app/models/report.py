from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    # 1. UPDATED: May index=True na
    barangay = Column(String, nullable=True, index=True)
    street_name = Column(String, nullable=True)
    
    image_url = Column(String, nullable=False)
    description = Column(String, nullable=True)
    
    # 2. UPDATED: May index=True na
    ai_damage_type = Column(String, index=True)
    ai_severity = Column(String, index=True)
    ai_confidence = Column(Float)
    
    is_flagged_fake = Column(Boolean, default=False)
    fake_confidence = Column(Float, default=0.0)
    is_potential_duplicate = Column(Boolean, default=False)
    
    # 3. UPDATED: May index=True na
    status = Column(String, default="PENDING", index=True)
    decline_reason = Column(String, nullable=True)
    
    # 4. UPDATED: May index=True na
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # --- RELATIONSHIPS ---
    # 1. Report -> User (Many-to-One)
    owner = relationship("User", back_populates="reports")
    
    # 2. Report -> Project (One-to-One)
    project = relationship("Project", back_populates="report", uselist=False)
    
    # 3. Report -> Comments (One-to-Many)
    comments = relationship("Comment", back_populates="report", cascade="all, delete-orphan")