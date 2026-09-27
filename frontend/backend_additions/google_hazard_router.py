import math
import os
from typing import List, Optional

import requests
from fastapi import APIRouter
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()
router = APIRouter()

class Point(BaseModel):
    lat: float
    lng: float

class HazardZone(BaseModel):
    type: str
    lat: float
    lng: float
    radius_m: float = Field(gt=0, le=10000)

class SafeRouteRequest(BaseModel):
    origin: Point
    destination: Point
    hazards: List[HazardZone] = []


def decode_polyline(encoded: str):
    points, index, lat, lng = [], 0, 0, 0
    while index < len(encoded):
        result = shift = 0
        while True:
            b = ord(encoded[index]) - 63; index += 1
            result |= (b & 0x1f) << shift; shift += 5
            if b < 0x20: break
        dlat = ~(result >> 1) if result & 1 else result >> 1
        lat += dlat
        result = shift = 0
        while True:
            b = ord(encoded[index]) - 63; index += 1
            result |= (b & 0x1f) << shift; shift += 5
            if b < 0x20: break
        dlng = ~(result >> 1) if result & 1 else result >> 1
        lng += dlng
        points.append((lat / 1e5, lng / 1e5))
    return points


def haversine_m(a_lat, a_lng, b_lat, b_lng):
    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat); dl = math.radians(b_lng - a_lng)
    x = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.atan2(math.sqrt(x), math.sqrt(1-x))


def exposure_for_route(polyline: str, hazards: List[HazardZone]):
    pts = decode_polyline(polyline)
    exposure = []
    for hz in hazards:
        if any(haversine_m(lat, lng, hz.lat, hz.lng) <= hz.radius_m for lat, lng in pts):
            exposure.append(hz.type.upper())
    return exposure


def compute_google_routes(req: SafeRouteRequest):
    key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not key:
        raise RuntimeError('GOOGLE_MAPS_API_KEY missing in .env')
    url = 'https://routes.googleapis.com/directions/v2:computeRoutes'
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    }
    body = {
        'origin': {'location': {'latLng': {'latitude': req.origin.lat, 'longitude': req.origin.lng}}},
        'destination': {'location': {'latLng': {'latitude': req.destination.lat, 'longitude': req.destination.lng}}},
        'travelMode': 'DRIVE',
        'routingPreference': 'TRAFFIC_AWARE',
        'computeAlternativeRoutes': True,
    }
    r = requests.post(url, headers=headers, json=body, timeout=30)
    r.raise_for_status()
    return r.json().get('routes', [])

@router.post('/routing/google-safe-route')
def google_safe_route(req: SafeRouteRequest):
    raw = compute_google_routes(req)
    candidates = []
    for i, route in enumerate(raw, 1):
        polyline = route.get('polyline', {}).get('encodedPolyline', '')
        exposure = exposure_for_route(polyline, req.hazards) if polyline else []
        safe = len(exposure) == 0
        duration_s = int(str(route.get('duration', '0s')).rstrip('s') or 0)
        candidates.append({
            'id': f'G{i}',
            'distance_km': round(route.get('distanceMeters', 0) / 1000, 2),
            'duration_min': round(duration_s / 60, 1),
            'polyline': polyline,
            'safe': safe,
            'hazard_exposure': exposure,
            'reason': 'SAFE — no configured hazard-zone intersection' if safe else f"REJECTED — intersects {', '.join(exposure)} hazard zone",
        })
    safe_candidates = [c for c in candidates if c['safe']]
    selected = min(safe_candidates, key=lambda c: c['duration_min']) if safe_candidates else None
    return {
        'source': 'GOOGLE_ROUTES',
        'candidates': candidates,
        'selected': selected['id'] if selected else None,
        'reason': 'Safest viable traffic-aware route selected' if selected else 'No Google candidate route avoids configured hazard zones',
    }
