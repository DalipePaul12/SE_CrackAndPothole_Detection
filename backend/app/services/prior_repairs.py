from math import asin, pi, sin, sqrt

from sqlalchemy import and_, case, func, or_, select, true
from sqlalchemy.orm import aliased

from app.models.enums import DamageType, MediaType, ProjectStatus, ReportStatus
from app.models.media_attachment import MediaAttachment
from app.models.project import Project
from app.models.report import Report

EARTH_RADIUS_METERS = 6_371_000
MATCH_RADIUS_METERS = 15
RADIANS = pi / 180
LATITUDE_MARGIN = MATCH_RADIUS_METERS / 110_000
# Sub-micrometer tolerance keeps points on the boundary inclusive after coordinate rounding.
MAX_HAVERSINE = sin((MATCH_RADIUS_METERS + 1e-8) / (2 * EARTH_RADIUS_METERS)) ** 2


def _matches():
    prior = aliased(Report)
    proof_date = (
        select(func.max(MediaAttachment.created_at))
        .where(MediaAttachment.report_id == prior.id, MediaAttachment.attachment_type == "completion_proof",
               MediaAttachment.media_type == MediaType.image)
        .correlate(prior).scalar_subquery()
    )
    repaired_at = case((Project.id.is_not(None), Project.actual_completion_date), else_=proof_date)
    dlat = func.sin((prior.latitude - Report.latitude) * (RADIANS / 2))
    dlon = func.sin((prior.longitude - Report.longitude) * (RADIANS / 2))
    distance = dlat * dlat + (
        func.cos(Report.latitude * RADIANS) * func.cos(prior.latitude * RADIANS) * dlon * dlon
    )
    same_damage = or_(*(
        and_(or_(Report.ai_damage_type == damage, Report.secondary_damage == damage),
             or_(prior.ai_damage_type == damage, prior.secondary_damage == damage))
        for damage in (DamageType.crack, DamageType.pothole)
    ))
    # shortcut: latitude bounds and existing status index serve the city queue. Profile before adding a spatial index.
    return (
        select(prior.id.label("report_id"), repaired_at.label("repaired_at"), distance.label("distance"))
        .select_from(prior)
        .outerjoin(Project, and_(Project.report_id == prior.id, Project.status == ProjectStatus.COMPLETED))
        .where(
            prior.id != Report.id,
            prior.status == ReportStatus.RESOLVED,
            prior.latitude.between(Report.latitude - LATITUDE_MARGIN, Report.latitude + LATITUDE_MARGIN),
            same_damage,
            distance <= MAX_HAVERSINE,
            repaired_at < Report.created_at,
        )
    )


def has_match():
    return _matches().correlate(Report).exists()


async def matching_report_ids(db, report_ids):
    if not report_ids:
        return set()
    result = await db.execute(select(Report.id).where(Report.id.in_(report_ids), has_match()))
    return set(result.scalars())


async def list_prior_repairs(db, report_id):
    query = _matches()
    query = (query.join(Report, true()).where(Report.id == report_id)
             .order_by(query.selected_columns.distance, query.selected_columns.repaired_at.desc(),
                       query.selected_columns.report_id).limit(3))
    rows = (await db.execute(query)).all()
    if not rows:
        return []

    photos_by_report = {row.report_id: [] for row in rows}
    photos = await db.execute(
        select(MediaAttachment.report_id, MediaAttachment.id, MediaAttachment.file_url)
        .where(MediaAttachment.report_id.in_(photos_by_report),
               MediaAttachment.attachment_type == "completion_proof", MediaAttachment.media_type == MediaType.image)
        .order_by(MediaAttachment.id)
    )
    for prior_id, photo_id, url in photos:
        photos_by_report[prior_id].append({"id": photo_id, "file_url": url})
    return [
        {"report_id": row.report_id, "repaired_at": row.repaired_at,
         "distance_meters": round(2 * EARTH_RADIUS_METERS * asin(sqrt(max(0, row.distance))), 2),
         "repair_photos": photos_by_report[row.report_id]}
        for row in rows
    ]
