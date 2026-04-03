from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, index=True)
    contact_number = Column(String, nullable=True)
    
    # --- BAGONG FIELDS ---
    country = Column(String, default="Philippines") # Default na PH
    city = Column(String, nullable=True)
    barangay = Column(String, nullable=True)
    street = Column(String, nullable=True)
    # ---------------------

    role = Column(String, default="citizen") 
    reputation_score = Column(Float, default=100.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    reports = relationship("Report", back_populates="owner")
    comments = relationship("Comment", back_populates="user")
    notifications = relationship("Notification", back_populates="user")