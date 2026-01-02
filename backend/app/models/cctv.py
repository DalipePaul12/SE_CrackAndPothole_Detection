from sqlalchemy import Boolean, Column, Integer, String, Float
from app.db.base import Base

class CCTV(Base):
    __tablename__ = "cctvs"

    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    stream_url = Column(String)
    is_active = Column(Boolean, default=True) 
    last_maintenance = Column(DateTime, nullable=True)