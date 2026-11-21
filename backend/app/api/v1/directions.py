import asyncio
import json
from math import isfinite
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.middleware.auth_middleware import require_admin, require_contractor
from app.middleware.rate_limiter import limiter
from app.models.project import Project
from app.models.report import Report
from app.models.user import User

router = APIRouter(prefix="/directions", tags=["Directions"])


class RouteOrigin(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False, strict=True)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False, strict=True)


def fetch_route(origin, destination, key):
    params = urlencode({
        "waypoints": f"{origin.latitude},{origin.longitude}|{destination[0]},{destination[1]}",
        "mode": "drive",
        "apiKey": key,
    })
    # The URL contains the GPS fix and key. Do not log the request or upstream exceptions.
    with urlopen(f"https://api.geoapify.com/v1/routing?{params}", timeout=8) as response:
        features = json.load(response)["features"]
    if not features:
        raise HTTPException(404, "No driving route was found for this starting point.")

    feature = features[0]
    geometry = feature["geometry"]
    properties = feature["properties"]
    lines = geometry["coordinates"]
    if geometry["type"] == "LineString":
        lines = [lines]
    points = []
    steps = []
    for index, line in enumerate(lines):
        offset = len(points)
        points.extend([lat, lng] for lng, lat, *_ in line)
        for step in properties["legs"][index]["steps"]:
            instructions = (step.get("instruction") or {}).get("text")
            start = step["from_index"]
            if isinstance(instructions, str) and isinstance(start, int) and 0 <= start < len(line):
                steps.append({"index": offset + start, "text": instructions})
    distance, duration = properties["distance"], properties["time"]
    if len(points) < 2 or not all(isfinite(value) and value >= 0 for value in (distance, duration)):
        raise ValueError("Invalid route")
    if not all(-90 <= lat <= 90 and -180 <= lng <= 180 for lat, lng in points):
        raise ValueError("Invalid route points")
    return {"points": points, "steps": steps, "distance": distance, "duration": duration}


async def route_for_report(report, origin):
    if report is None:
        raise HTTPException(404, "The report or assignment is unavailable.")
    lat, lng = report.latitude, report.longitude
    if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(422, "No map pin saved.")
    if not settings.GEOAPIFY_ROUTING_KEY:
        raise HTTPException(503, "Directions are not configured.")

    try:
        route = await asyncio.to_thread(fetch_route, origin, (lat, lng), settings.GEOAPIFY_ROUTING_KEY)
    except HTTPError as exc:
        if exc.code == 429:
            raise HTTPException(429, "Directions are temporarily unavailable due to the routing limit.") from None
        if exc.code in (400, 404):
            raise HTTPException(404, "No driving route was found for this starting point.") from None
        raise HTTPException(502, "The routing service is temporarily unavailable.") from None
    except (OSError, ValueError, KeyError, TypeError, IndexError, AttributeError):
        raise HTTPException(502, "The routing service is temporarily unavailable.") from None
    return JSONResponse(route, headers={"Cache-Control": "no-store"})


@router.post("/reports/{report_id}")
@limiter.limit("6/minute")
async def report_directions(
    request: Request, report_id: int, origin: RouteOrigin,
    db: AsyncSession = Depends(get_db), _user: User = Depends(require_admin),
):
    return await route_for_report(await db.get(Report, report_id), origin)


@router.post("/projects/{project_id}")
@limiter.limit("6/minute")
async def project_directions(
    request: Request, project_id: int, origin: RouteOrigin,
    db: AsyncSession = Depends(get_db), user: User = Depends(require_contractor),
):
    report = await db.scalar(select(Report).join(Project, Project.report_id == Report.id).where(
        Project.id == project_id, Project.contractor_id == user.id,
    ))
    return await route_for_report(report, origin)
