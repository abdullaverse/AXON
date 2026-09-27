from backend.database import supabase
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi import FastAPI
BASE_DIR = Path(__file__).resolve().parent.parent
from fastapi.staticfiles import StaticFiles
from backend.fusion_engine import run_fusion
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from backend.simulation_intelligence import (
    get_simulation_intelligence
)
from pydantic import BaseModel
from typing import Optional

import random
import time
from backend.digital_twin import (
    start_simulation,
    pause_simulation,
    reset_simulation,
    get_simulation_state,
    trigger_network_failure
)

# =========================================================
# AXON FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="AXON API",
    description="Multi-Hazard Disaster Intelligence and Evacuation Guidance System",
    version="2.1.0"
)
app.mount(
    "/static",
    StaticFiles(directory="frontend"),
    name="static"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# =========================================================
# GLOBAL STATE
# =========================================================

latest_data = {}

current_scenario = "NORMAL"

internet_online = True

last_tick = 0.0


# =========================================================
# SENSOR DATA MODEL
# =========================================================

class SensorData(BaseModel):

    source: str
    node_id: str
    node_type: str

    rainfall: Optional[float] = None
    soil_moisture: Optional[float] = None
    vibration: Optional[float] = None
    water_level: Optional[float] = None

    temperature: Optional[float] = None
    humidity: Optional[float] = None
    smoke: Optional[float] = None
    gas: Optional[float] = None

    pm25: Optional[float] = None
    pm10: Optional[float] = None


class ScenarioRequest(BaseModel):

    scenario: str

class FusionRequest(BaseModel):
    landslide: Optional[dict] = None
    flood: Optional[dict] = None
    fire: Optional[dict] = None
    pollution: Optional[dict] = None


# =========================================================
# UTILITIES
# =========================================================

def clamp(value):

    return max(
        0,
        min(
            1,
            value
        )
    )


# =========================================================
# DATABASE SAVE FUNCTION
# =========================================================

def save_sensor_reading(data):

    try:

        payload = {
            "node_id": data["node_id"],
            "source": data["source"],

            "rainfall": data.get("rainfall"),
            "soil_moisture": data.get("soil_moisture"),
            "vibration": data.get("vibration"),
            "water_level": data.get("water_level"),

            "temperature": data.get("temperature"),
            "humidity": data.get("humidity"),
            "smoke": data.get("smoke"),
            "gas": data.get("gas"),

            "pm25": data.get("pm25"),
            "pm10": data.get("pm10")
        }

        supabase.table(
            "sensor_readings"
        ).insert(
            payload
        ).execute()

        return True

    except Exception as error:

        print("\nDATABASE ERROR")
        print(error)

        return False


# =========================================================
# DIGITAL TWIN SIMULATOR
# =========================================================

def simulate():

    global latest_data
    global last_tick

    now = time.time()

    if now - last_tick < 1:

        return

    last_tick = now

    scenario = current_scenario


    # -----------------------------------------------------
    # NORMAL VALUES
    # -----------------------------------------------------

    hill = {
        "rainfall": random.randint(5, 18),
        "soil_moisture": random.randint(30, 48),
        "vibration": round(
            random.uniform(0.01, 0.08),
            2
        ),
        "temperature": random.randint(24, 31)
    }


    river = {
        "water_level": random.randint(24, 42),
        "rainfall": random.randint(5, 18),
        "temperature": random.randint(24, 31)
    }


    fire = {
        "temperature": random.randint(26, 33),
        "humidity": random.randint(48, 76),
        "smoke": random.randint(70, 160),
        "gas": random.randint(60, 150)
    }


    air = {
        "pm25": random.randint(18, 45),
        "pm10": random.randint(30, 80),
        "gas": random.randint(70, 160),
        "temperature": random.randint(25, 34),
        "humidity": random.randint(45, 76)
    }


    # -----------------------------------------------------
    # HEAVY RAIN
    # -----------------------------------------------------

    if scenario == "HEAVY_RAIN":

        hill.update(
            rainfall=random.randint(55, 80),
            soil_moisture=random.randint(62, 78)
        )

        river.update(
            rainfall=random.randint(55, 80),
            water_level=random.randint(48, 65)
        )


    # -----------------------------------------------------
    # LANDSLIDE
    # -----------------------------------------------------

    elif scenario == "LANDSLIDE":

        hill.update(
            rainfall=random.randint(70, 100),
            soil_moisture=random.randint(82, 98),
            vibration=round(
                random.uniform(0.65, 0.98),
                2
            )
        )


    # -----------------------------------------------------
    # FLOOD
    # -----------------------------------------------------

    elif scenario == "FLOOD":

        river.update(
            water_level=random.randint(82, 99),
            rainfall=random.randint(65, 100)
        )


    # -----------------------------------------------------
    # FOREST FIRE
    # -----------------------------------------------------

    elif scenario == "FIRE":

        fire.update(
            temperature=random.randint(44, 57),
            humidity=random.randint(10, 25),
            smoke=random.randint(760, 1250),
            gas=random.randint(520, 940)
        )

        # Fire also affects air quality
        air.update(
            pm25=random.randint(120, 260),
            pm10=random.randint(170, 360),
            gas=random.randint(300, 650)
        )


    # -----------------------------------------------------
    # POLLUTION
    # -----------------------------------------------------

    elif scenario == "POLLUTION":

        air.update(
            pm25=random.randint(180, 380),
            pm10=random.randint(250, 520),
            gas=random.randint(480, 930)
        )


    # -----------------------------------------------------
    # CASCADE
    # LANDSLIDE -> FLOOD -> POLLUTION EFFECT
    # -----------------------------------------------------

    elif scenario == "CASCADE":

        hill.update(
            rainfall=random.randint(78, 105),
            soil_moisture=random.randint(86, 99),
            vibration=round(
                random.uniform(0.72, 0.99),
                2
            )
        )

        river.update(
            water_level=random.randint(84, 99),
            rainfall=random.randint(78, 105)
        )

        air.update(
            pm25=random.randint(80, 150),
            pm10=random.randint(120, 220),
            gas=random.randint(180, 320)
        )


    # -----------------------------------------------------
    # CREATE STANDARD AXON NODE PACKETS
    # -----------------------------------------------------

    latest_data = {

        "HILL_01": {
            "source": "SIMULATION",
            "node_id": "HILL_01",
            "node_type": "LANDSLIDE",
            **hill
        },

        "RIVER_01": {
            "source": "SIMULATION",
            "node_id": "RIVER_01",
            "node_type": "FLOOD",
            **river
        },

        "FOREST_01": {
            "source": "SIMULATION",
            "node_id": "FOREST_01",
            "node_type": "FOREST_FIRE",
            **fire
        },

        "AIR_01": {
            "source": "SIMULATION",
            "node_id": "AIR_01",
            "node_type": "POLLUTION",
            **air
        }

    }


# =========================================================
# TEMPORARY RISK ENGINE
#
# IMPORTANT:
# Later this will be replaced by trained ML models.
# =========================================================

def risk_packet():

    simulate()

    hill = latest_data["HILL_01"]
    river = latest_data["RIVER_01"]
    fire = latest_data["FOREST_01"]
    air = latest_data["AIR_01"]


    landslide_risk = clamp(

        0.34
        * hill["soil_moisture"]
        / 100

        +

        0.34
        * hill["vibration"]

        +

        0.32
        * hill["rainfall"]
        / 100
    )


    flood_risk = clamp(

        0.65
        * river["water_level"]
        / 100

        +

        0.35
        * river["rainfall"]
        / 100
    )


    fire_risk = clamp(

        0.35
        * (fire["temperature"] - 20)
        / 40

        +

        0.35
        * fire["smoke"]
        / 1200

        +

        0.20
        * fire["gas"]
        / 900

        +

        0.10
        * (100 - fire["humidity"])
        / 100
    )


    pollution_risk = clamp(

        0.55
        * air["pm25"]
        / 350

        +

        0.25
        * air["pm10"]
        / 500

        +

        0.20
        * air["gas"]
        / 900
    )


    risks = {

        "landslide": round(
            landslide_risk * 100
        ),

        "flood": round(
            flood_risk * 100
        ),

        "fire": round(
            fire_risk * 100
        ),

        "pollution": round(
            pollution_risk * 100
        )

    }


    # =====================================================
    # UNSAFE ROUTE DETECTION
    # =====================================================

    unsafe_routes = []


    if risks["flood"] >= 70:

        unsafe_routes += [
            "RIVER ROAD",
            "BRIDGE R1"
        ]


    if risks["landslide"] >= 70:

        unsafe_routes += [
            "EAST HILL ROAD"
        ]


    if risks["fire"] >= 70:

        unsafe_routes += [
            "FOREST EDGE ROAD"
        ]


    # =====================================================
    # TEMPORARY EVACUATION DECISION ENGINE
    #
    # Later this will use:
    # Google Routes + local GIS + Dijkstra/A*
    # =====================================================

    if (
        risks["flood"] >= 70
        and
        risks["landslide"] >= 70
    ):

        direction = "NORTH"

        safe_point = "SP-03"

        route = "R3"

        reason = (
            "West corridor exposed to flood; "
            "east corridor exposed to slope failure."
        )


    elif risks["flood"] >= 70:

        direction = "WEST"

        safe_point = "SP-02"

        route = "R2"

        reason = (
            "Move away from low-lying river corridor."
        )


    elif risks["landslide"] >= 70:

        direction = "WEST"

        safe_point = "SP-02"

        route = "R2"

        reason = (
            "Move away from unstable eastern slope."
        )


    elif risks["fire"] >= 70:

        direction = "SOUTH"

        safe_point = "SP-04"

        route = "R4"

        reason = (
            "Move away from forest-edge fire zone."
        )


    elif risks["pollution"] >= 70:

        direction = "INDOORS"

        safe_point = "SP-01"

        route = "R1"

        reason = (
            "Move to designated lower-exposure shelter."
        )


    else:

        direction = "STANDBY"

        safe_point = "SP-01"

        route = "R1"

        reason = (
            "No critical evacuation trigger."
        )


    dominant_hazard = max(
        risks,
        key=risks.get
    ).upper()


    return {

        "scenario": current_scenario,

        "internet_online": internet_online,

        "risks": risks,

        "dominant_hazard": dominant_hazard,

        "evacuation": {

            "direction": direction,

            "safe_point": safe_point,

            "route": route,

            "unsafe_routes": unsafe_routes,

            "reason": reason

        }

    }


# =========================================================
# API ROUTES
# =========================================================

@app.get("/")
def root():

    return {

        "project": "AXON",

        "status": "running",

        "version": "2.1.0",

        "hazards": [
            "Flood",
            "Landslide",
            "Forest Fire",
            "Pollution"
        ]

    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():

    return {

        "project": "AXON",

        "status": "healthy"

    }


# =========================================================
# RECEIVE REAL / SIMULATED SENSOR DATA
# =========================================================

@app.post("/sensor-data")
def sensor(
    data: SensorData
):

    sensor_packet = data.model_dump()


    # Keep latest packet in memory
    latest_data[
        data.node_id
    ] = sensor_packet


    # Save to Supabase
    database_saved = save_sensor_reading(
        sensor_packet
    )


    return {

        "status": "received",

        "database": (
            "saved"
            if database_saved
            else
            "failed"
        ),

        "node_id": data.node_id,

        "node_type": data.node_type,

        "source": data.source

    }


# =========================================================
# GET LATEST DATA
# =========================================================

@app.get("/latest")
def latest():

    simulate()

    return latest_data


# =========================================================
# GET CURRENT RISK
# =========================================================

@app.get("/risk")
def risk():

    return risk_packet()


# =========================================================
# CHANGE DIGITAL TWIN SCENARIO
# =========================================================

@app.post("/simulation/scenario")
def set_scenario(
    req: ScenarioRequest
):

    global current_scenario


    allowed = {

        "NORMAL",

        "HEAVY_RAIN",

        "LANDSLIDE",

        "FLOOD",

        "FIRE",

        "POLLUTION",

        "CASCADE"

    }


    requested = (
        req.scenario
        .upper()
    )


    if requested in allowed:

        current_scenario = requested

    else:

        current_scenario = "NORMAL"


    return {

        "status": "ok",

        "scenario": current_scenario

    }


# =========================================================
# NETWORK FAILURE SIMULATION
# =========================================================

@app.post("/simulation/network-toggle")
def toggle_network():

    global internet_online


    internet_online = (
        not internet_online
    )


    return {

        "status": "ok",

        "internet_online":
            internet_online

    }


# =========================================================
# DASHBOARD
# =========================================================

@app.get("/dashboard")
def dashboard():
    file_path = BASE_DIR / "frontend" / "index.html"

    return FileResponse(
        file_path,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )
@app.post("/fusion")
def fusion_prediction(data: FusionRequest):
    return run_fusion(
        landslide_data=data.landslide,
        flood_data=data.flood,
        fire_data=data.fire,
        pollution_data=data.pollution
    )
@app.post("/simulation/start")
def simulation_start():
    return start_simulation("CASCADE")


@app.post("/simulation/pause")
def simulation_pause():
    return pause_simulation()


@app.post("/simulation/reset")
def simulation_reset():
    return reset_simulation()


@app.get("/simulation/state")
def simulation_state():
    return get_simulation_state()


@app.post("/simulation/network-failure")
def simulation_network_failure():
    return trigger_network_failure()
@app.get("/simulation/intelligence")
def simulation_intelligence():
    return get_simulation_intelligence()
@app.get("/hardware-sim")
def hardware_sim():
    file_path = BASE_DIR / "frontend" / "hardware-sim" / "index.html"

    if not file_path.exists():
        return {
            "error": "Hardware simulator frontend not found",
            "expected_path": str(file_path)
        }

    return FileResponse(file_path)