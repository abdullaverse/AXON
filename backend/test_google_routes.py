import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

if not API_KEY:
    raise SystemExit("GOOGLE_MAPS_API_KEY not found")

print("✅ API KEY LOADED")

url = "https://routes.googleapis.com/directions/v2:computeRoutes"

headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": API_KEY,
    "X-Goog-FieldMask":
        "routes.duration,"
        "routes.distanceMeters,"
        "routes.polyline.encodedPolyline"
}

body = {
    "origin": {
        "location": {
            "latLng": {
                "latitude": 11.4089,
                "longitude": 76.8740
            }
        }
    },

    "destination": {
        "location": {
            "latLng": {
                "latitude": 11.4200,
                "longitude": 76.8600
            }
        }
    },

    "travelMode": "DRIVE",

    "routingPreference": "TRAFFIC_AWARE",

    "computeAlternativeRoutes": True
}

print("Requesting Google Routes API...")

response = requests.post(
    url,
    headers=headers,
    json=body,
    timeout=30
)

print("HTTP:", response.status_code)

if response.status_code != 200:
    print("❌ ROUTES API ERROR")
    print(response.text)
    raise SystemExit

data = response.json()

routes = data.get("routes", [])

print("✅ GOOGLE ROUTES API CONNECTED")
print("Routes received:", len(routes))

for i, route in enumerate(routes, 1):

    distance_m = route.get(
        "distanceMeters",
        0
    )

    duration = route.get(
        "duration",
        "unknown"
    )

    polyline = (
        route
        .get("polyline", {})
        .get("encodedPolyline")
    )

    print()
    print("ROUTE", i)
    print(
        "Distance:",
        round(distance_m / 1000, 2),
        "km"
    )
    print(
        "Duration:",
        duration
    )
    print(
        "Polyline available:",
        bool(polyline)
    )