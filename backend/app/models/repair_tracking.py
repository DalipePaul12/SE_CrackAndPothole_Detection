from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, String, func
from app.db.base import Base


class ReportFollow(Base):
    __tablename__ = "report_follows"
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)


class RepeatDecision(Base):
    __tablename__ = "repeat_decisions"
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True)
    prior_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), primary_key=True)
    decision = Column(String, nullable=False)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RepairInspection(Base):
    __tablename__ = "repair_inspections"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    visit_date = Column(Date, nullable=False)
    result = Column(String)
    notes = Column(String)
    photos = Column(JSON)
    inspector_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    completed_at = Column(DateTime(timezone=True))
    followup_id = Column(Integer, ForeignKey("reports.id", ondelete="SET NULL"), unique=True)
