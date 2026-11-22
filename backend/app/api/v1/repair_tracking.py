from datetime import date, datetime, timezone, timedelta
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.db.session import get_db
from app.middleware.auth_middleware import get_current_user, require_admin
from app.models.enums import ReportStatus, UserRole
from app.models.media_attachment import MediaAttachment
from app.models.project import Project
from app.models.repair_tracking import RepairInspection, RepeatDecision, ReportFollow
from app.models.report import Report
from app.models.user import User
from app.services import prior_repairs, repair_service
from app.services.duplicate_detection import ACTIVE_STATUSES

router = APIRouter(prefix="/repair-tracking", tags=["Repair tracking"])


class Schedule(BaseModel):
    scheduled_date: date | None


class Visit(BaseModel):
    visit_date: date


class Decision(BaseModel):
    decision: Literal["returned", "different"]


@router.put("/{report_id}/follow")
async def follow(report_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    report = await repair_service.lock_report(db, report_id)
    if user.role != UserRole.citizen or report.owner_id == user.id:
        raise HTTPException(403, "Only another resident can follow this report.")
    if report.status not in ACTIVE_STATUSES:
        raise HTTPException(409, "This report is closed.")
    if not await db.get(ReportFollow, (report_id, user.id)):
        db.add(ReportFollow(report_id=report_id, user_id=user.id))
    await db.commit()
    return {"following": True}


@router.delete("/{report_id}/follow")
async def unfollow(report_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await db.execute(delete(ReportFollow).where(ReportFollow.report_id == report_id, ReportFollow.user_id == user.id))
    await db.commit()
    return {"following": False}


@router.get("/following")
async def following(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(Report.id, Report.street_name, Report.barangay, Report.status,
                                    Project.scheduled_date).join(ReportFollow, ReportFollow.report_id == Report.id)
                             .outerjoin(Project, Project.report_id == Report.id)
                             .where(ReportFollow.user_id == user.id).order_by(Report.id.desc()))).mappings().all()
    proofs = {}
    for rid, url in await db.execute(select(MediaAttachment.report_id, MediaAttachment.file_url)
                                     .where(MediaAttachment.report_id.in_([r.id for r in rows if r.status == ReportStatus.RESOLVED]),
                                            MediaAttachment.attachment_type == "completion_proof").order_by(MediaAttachment.id)):
        proofs.setdefault(rid, []).append(url)
    return [dict(r, photos=proofs.get(r.id, [])) for r in rows]


@router.get("/schedule")
async def schedule(db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)):
    today = datetime.now(timezone(timedelta(hours=8))).date()
    return (await db.execute(select(Report.id, Report.barangay, Report.street_name, Project.scheduled_date)
                             .join(Project, Project.report_id == Report.id)
                             .where(Project.scheduled_date >= today, Report.status.in_(ACTIVE_STATUSES))
                             .order_by(Project.scheduled_date, Report.barangay, Report.street_name, Report.id))).mappings().all()


@router.put("/{report_id}/schedule")
async def save_schedule(report_id: int, data: Schedule, tasks: BackgroundTasks, db: AsyncSession = Depends(get_db),
                        _admin: User = Depends(require_admin)):
    report = await repair_service.lock_report(db, report_id)
    project = await db.scalar(select(Project).where(Project.report_id == report_id))
    if not project or report.status not in ACTIVE_STATUSES:
        raise HTTPException(409, "An active repair project is required.")
    if project.scheduled_date != data.scheduled_date:
        project.scheduled_date = data.scheduled_date
        recipients = set(await db.scalars(select(ReportFollow.user_id).where(ReportFollow.report_id == report_id)))
        recipients.add(report.owner_id)
        change = f"scheduled for {data.scheduled_date}" if data.scheduled_date else "removed from the schedule"
        for recipient in recipients:
            repair_service.add_notification(db, tasks, recipient, report_id, "Repair schedule changed",
                                            f"Repair for report #{report_id} was {change}.", "info")
    await db.commit()
    return data


@router.put("/{report_id}/prior/{prior_id}")
async def decide(report_id: int, prior_id: int, data: Decision, db: AsyncSession = Depends(get_db),
                 admin: User = Depends(require_admin)):
    await repair_service.lock_report(db, report_id)
    candidates = await prior_repairs.list_prior_repairs(db, report_id)
    if not any(row["report_id"] == prior_id for row in candidates):
        raise HTTPException(409, "This repair is no longer a candidate.")
    existing = await db.get(RepeatDecision, (report_id, prior_id))
    if existing and existing.decision != data.decision:
        raise HTTPException(409, "Another review decision already exists.")
    if not existing:
        db.add(RepeatDecision(report_id=report_id, prior_id=prior_id, reviewer_id=admin.id, decision=data.decision))
    await db.commit()
    return data


@router.get("/{report_id}/details")
async def details(report_id: int, db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)):
    project = await db.scalar(select(Project).where(Project.report_id == report_id))
    visits = (await db.scalars(select(RepairInspection).where(RepairInspection.report_id == report_id)
                              .order_by(RepairInspection.id.desc()))).all()
    source = await db.scalar(select(RepairInspection.report_id).where(RepairInspection.followup_id == report_id))
    return {"has_project": project is not None, "scheduled_date": project.scheduled_date if project else None,
            "source_report": source, "inspections": [
                {"id": v.id, "visit_date": v.visit_date, "result": v.result, "notes": v.notes,
                 "photos": v.photos or [], "completed_at": v.completed_at, "followup_id": v.followup_id}
                for v in visits]}


@router.post("/{report_id}/inspections")
async def plan_inspection(report_id: int, data: Visit, db: AsyncSession = Depends(get_db),
                          _admin: User = Depends(require_admin)):
    report = await repair_service.lock_report(db, report_id)
    if report.status != ReportStatus.RESOLVED:
        raise HTTPException(409, "Only resolved repairs can be inspected.")
    visit = await db.scalar(select(RepairInspection).where(RepairInspection.report_id == report_id,
                                                           RepairInspection.result.is_(None)))
    if visit:
        visit.visit_date = data.visit_date
    else:
        db.add(RepairInspection(report_id=report_id, visit_date=data.visit_date))
    await db.commit()
    return data


@router.post("/{report_id}/inspections/{visit_id}/result")
async def finish_inspection(report_id: int, visit_id: int, result: Literal["passed", "needs_work"] = Form(...),
                            notes: str = Form(..., max_length=2000), photos: list[UploadFile] = File(default=[]),
                            db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    report = await repair_service.lock_report(db, report_id)
    visit = await db.get(RepairInspection, visit_id)
    if not visit or visit.report_id != report.id:
        raise HTTPException(404, "Inspection not found.")
    if visit.result:
        if visit.result != result:
            raise HTTPException(409, "Inspection already completed.")
        return {"followup_id": visit.followup_id}
    if not notes.strip() or len(photos) > 5:
        raise HTTPException(422, "Enter inspection notes and choose at most five photos.")
    if report.status != ReportStatus.RESOLVED:
        raise HTTPException(409, "This report is no longer resolved.")
    evidence = [await repair_service.read_proof(photo) for photo in photos]
    paths, urls = [], []
    try:
        for contents, mime in evidence:
            path = f"{report_id}/inspection_{uuid4().hex}.{repair_service.IMAGE_EXTENSIONS[mime]}"
            paths.append(path)
            urls.append(await run_in_threadpool(repair_service.upload_report_file, contents, path, mime))
        if result == "needs_work":
            followup = Report(created_at=datetime.now(timezone.utc), owner_id=report.owner_id, latitude=report.latitude, longitude=report.longitude,
                              city=report.city, street_name=report.street_name, barangay=report.barangay,
                              report_type=report.report_type, ai_damage_type=report.ai_damage_type,
                              secondary_damage=report.secondary_damage, ai_severity=report.ai_severity,
                              description=f"Inspection follow-up for report #{report_id}: {notes.strip()}",
                              status=ReportStatus.VERIFIED)
            db.add(followup)
            await db.flush()
            visit.followup_id = followup.id
        visit.result, visit.notes, visit.photos = result, notes.strip(), urls
        visit.inspector_id, visit.completed_at = admin.id, datetime.now(timezone.utc)
        await db.flush()
    except Exception:
        await repair_service.discard_proof(paths)
        raise
    await db.commit()
    return {"followup_id": visit.followup_id}
