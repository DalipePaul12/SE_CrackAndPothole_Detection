"""Authoritative jurisdiction checks for report coordinates."""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import Point, shape

_BOUNDARY_PATH = Path(__file__).resolve().parent.parent / "data" / "malabon_boundary.geojson"

with _BOUNDARY_PATH.open("r", encoding="utf-8") as boundary_file:
    _boundary_payload = json.load(boundary_file)

_MALABON_BOUNDARY = shape(_boundary_payload["features"][0]["geometry"])


def is_inside_malabon(latitude: float, longitude: float) -> bool:
    """Return True when (latitude, longitude) falls inside Malabon's boundary."""
    return _MALABON_BOUNDARY.covers(Point(longitude, latitude))
