from datetime import datetime, timedelta, timezone

from jose import jwt
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import defer, selectinload

from app.core.config import settings
from app.core.security import decode_token
from app.models.ai_detection_result import AIDetectionResult
from app.models.enums import ReportStatus
from app.models.media_attachment import MediaAttachment
from app.models.report import Report
from app.utils.geo import calculate_distance

NEARBY_RADIUS_METERS = 3
ACTIVE_STATUSES = (
    ReportStatus.PENDING, ReportStatus.VERIFIED,
    ReportStatus.ASSIGNED, ReportStatus.IN_PROGRESS,
)
TOKEN_TYPE = "nearby_duplicate_confirmation"


def normalize_damage_types(*values):
    return sorted({
        part.strip()
        for value in values if value
        for part in getattr(value, "value", value).lower().split("+")
        if part.strip() in {"crack", "pothole"}
    })


async def find_nearby_matches(db, owner_id, latitude, longitude, damage_types):
    if not damage_types:
        return []
    # Use a conservative latitude band, then check the exact great-circle distance.
    latitude_margin = NEARBY_RADIUS_METERS / 110_000
    # Legacy databases may lack enum members or use upper-case labels.
    status = func.lower(cast(Report.status, String))
    reports = (await db.execute(select(Report, status).where(
        Report.owner_id == owner_id,
        status.in_([active.value for active in ACTIVE_STATUSES]),
        Report.latitude.between(latitude - latitude_margin, latitude + latitude_margin),
    ).options(defer(Report.status), selectinload(Report.frame_detections)))).all()
    nearby = [
        (distance, report, stored_status)
        for report, stored_status in reports
        if (distance := calculate_distance(latitude, longitude, report.latitude, report.longitude))
        <= NEARBY_RADIUS_METERS
    ]
    if not nearby:
        return []

    detections = {}
    for report_id, label in (await db.execute(select(
        AIDetectionResult.report_id, AIDetectionResult.detected_class,
    ).outerjoin(MediaAttachment, MediaAttachment.id == AIDetectionResult.media_attachment_id).where(
        AIDetectionResult.report_id.in_([report.id for _, report, _ in nearby]),
        or_(MediaAttachment.attachment_type.is_(None), MediaAttachment.attachment_type == "submission"),
    ))).all():
        detections.setdefault(report_id, []).append(label)

    matches = []
    for distance, report, stored_status in sorted(nearby, key=lambda item: (item[0], item[1].id)):
        types = normalize_damage_types(
            report.ai_damage_type, report.secondary_damage,
            *(frame.damage_type for frame in report.frame_detections),
            *detections.get(report.id, []),
        )
        if set(damage_types).intersection(types):
            matches.append({
                "id": report.id,
                "damage_types": types,
                "status": stored_status,
                "distance_meters": round(distance, 2),
                "street_name": report.street_name,
            })
    return matches


def _claims(owner_id, latitude, longitude, damage_types, match_ids):
    return {
        "type": TOKEN_TYPE, "sub": str(owner_id), "latitude": latitude,
        "longitude": longitude, "damage_types": damage_types, "match_ids": sorted(match_ids),
    }


def confirmation_payload(owner_id, latitude, longitude, damage_types, matches):
    token = None
    if matches:
        claims = _claims(owner_id, latitude, longitude, damage_types, [match["id"] for match in matches])
        claims["exp"] = datetime.now(timezone.utc) + timedelta(minutes=10)
        token = jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return {"matches": matches, "confirmation_token": token}


def confirmation_is_valid(data, owner_id, damage_types, matches):
    if not data.duplicate_confirmed or not data.duplicate_confirmation_token:
        return False
    claims = decode_token(data.duplicate_confirmation_token)
    if not claims or claims.get("exp", 0) <= datetime.now(timezone.utc).timestamp():
        return False
    ids = data.duplicate_match_ids
    expected = _claims(owner_id, data.latitude, data.longitude, damage_types, ids)
    return all(claims.get(key) == value for key, value in expected.items()) and {
        match["id"] for match in matches
    }.issubset(ids)
