from pathlib import Path
import joblib
import numpy as np
from backend.routing_engine import calculate_safe_route

BASE = Path(__file__).resolve().parent.parent

MODEL_PATHS = {
    "landslide": BASE / "ml/landslide/models/landslide_model.pkl",
    "flood": BASE / "ml/flood/models/flood_model.pkl",
    "fire": BASE / "ml/fire/models/fire_model.pkl",
    "pollution": BASE / "ml/pollution/models/pollution_model.pkl",
}


print("=" * 60)
print("AXON MULTI-HAZARD FUSION ENGINE")
print("=" * 60)

models = {}

for name, path in MODEL_PATHS.items():

    if path.exists():

        models[name] = joblib.load(path)

        print(
            f"{name.upper():12} MODEL LOADED"
        )

    else:

        print(
            f"{name.upper():12} MODEL NOT FOUND: {path}"
        )


def clamp(value, minimum=0.0, maximum=100.0):

    return float(
        max(
            minimum,
            min(maximum, value)
        )
    )


def risk_level(score):

    if score >= 80:
        return "CRITICAL"

    if score >= 60:
        return "HIGH"

    if score >= 40:
        return "MODERATE"

    if score >= 20:
        return "LOW"

    return "NORMAL"


# ============================================================
# LANDSLIDE
# ============================================================

def predict_landslide(data):

    model = models.get("landslide")

    if model is None:
        return None

    features = np.array([[
        data["rain_1day"],
        data["rain_3day"],
        data["rain_7day"],
        data["elevation_m"],
        data["slope_deg"],
    ]])

    probability = model.predict_proba(
        features
    )[0][1]

    risk = clamp(
        probability * 100
    )

    return {
        "risk": round(risk, 2),
        "level": risk_level(risk),
        "probability": round(
            float(probability),
            4
        )
    }


# ============================================================
# FLOOD
# ============================================================

def predict_flood(data):

    model = models.get("flood")

    if model is None:
        return None

    features = np.array([[
        data["level_now"],
        data["level_1h"],
        data["level_3h"],
        data["level_6h"],
        data["level_12h"],
        data["level_24h"],
        data["rise_1h"],
        data["rise_3h"],
        data["rise_6h"],
        data["rolling_mean_6h"],
        data["rolling_std_6h"],
        data["hour"],
        data["month"],
    ]])

    predicted_level = float(
        model.predict(features)[0]
    )

    warning_level = float(
        data["warning_level"]
    )

    danger_level = float(
        data["danger_level"]
    )

    # Convert forecast into normalized hazard risk.
    #
    # This is NOT ML probability.
    # It is a risk score based on the predicted level
    # relative to warning/danger thresholds.

    if predicted_level <= warning_level:

        denominator = max(
            abs(warning_level),
            0.1
        )

        risk = (
            predicted_level
            /
            denominator
        ) * 50

    else:

        denominator = max(
            danger_level - warning_level,
            0.1
        )

        risk = (
            50
            +
            (
                predicted_level
                -
                warning_level
            )
            /
            denominator
            *
            50
        )

    risk = clamp(risk)

    return {
        "risk": round(risk, 2),
        "level": risk_level(risk),

        "current_level_m":
            round(
                float(data["level_now"]),
                3
            ),

        "predicted_level_3h_m":
            round(
                predicted_level,
                3
            ),

        "warning_level_m":
            warning_level,

        "danger_level_m":
            danger_level
    }


# ============================================================
# FIRE
# ============================================================

def predict_fire(data):

    model = models.get("fire")

    if model is None:
        return None

    features = np.array([[
        data["FFMC"],
        data["DMC"],
        data["DC"],
        data["ISI"],
        data["temp"],
        data["RH"],
        data["wind"],
        data["rain"],
    ]])

    ml_probability = float(
        model.predict_proba(
            features
        )[0][1]
    )

    # Optional LIVE AXON sensor confirmation.
    # These values are not part of the historical ML model.
    smoke = float(
        data.get("smoke_index", 0)
    )

    gas = float(
        data.get("gas_index", 0)
    )

    smoke = clamp(smoke, 0, 100)
    gas = clamp(gas, 0, 100)

    # Fusion:
    # 70% historical/environmental ML
    # 20% live smoke
    # 10% live gas

    risk = (
        ml_probability * 100 * 0.70
        +
        smoke * 0.20
        +
        gas * 0.10
    )

    risk = clamp(risk)

    return {
        "risk": round(risk, 2),
        "level": risk_level(risk),

        "ml_probability":
            round(
                ml_probability,
                4
            ),

        "smoke_index":
            smoke,

        "gas_index":
            gas
    }


# ============================================================
# POLLUTION
# ============================================================

def predict_pollution(data):

    model = models.get("pollution")

    if model is None:
        return None

    features = np.array([[
        data["PM2.5"],
        data["PM10"],
        data["SO2"],
        data["NO2"],
        data["CO"],
        data["O3"],
        data["TEMP"],
        data["PRES"],
        data["DEWP"],
        data["RAIN"],
        data["WSPM"],
        data["pm25_1h"],
        data["pm25_3h"],
        data["pm25_6h"],
        data["pm25_24h"],
        data["pm25_change_1h"],
        data["hour"],
        data["month"],
    ]])

    predicted_pm25 = float(
        model.predict(features)[0]
    )

    # Prototype PM2.5 severity normalization.
    # Keep raw forecast available separately.

    if predicted_pm25 <= 30:
        risk = predicted_pm25 / 30 * 20

    elif predicted_pm25 <= 60:
        risk = (
            20
            +
            (
                predicted_pm25 - 30
            )
            /
            30
            *
            20
        )

    elif predicted_pm25 <= 120:
        risk = (
            40
            +
            (
                predicted_pm25 - 60
            )
            /
            60
            *
            20
        )

    elif predicted_pm25 <= 250:
        risk = (
            60
            +
            (
                predicted_pm25 - 120
            )
            /
            130
            *
            20
        )

    else:
        risk = (
            80
            +
            (
                predicted_pm25 - 250
            )
            /
            250
            *
            20
        )

    risk = clamp(risk)

    return {
        "risk": round(risk, 2),
        "level": risk_level(risk),

        "current_pm25":
            round(
                float(data["PM2.5"]),
                2
            ),

        "predicted_pm25_3h":
            round(
                predicted_pm25,
                2
            )
    }


# ============================================================
# CASCADE DETECTION
# ============================================================

def detect_cascade(results):

    cascades = []

    landslide = (
        results.get("landslide") or {}
    ).get("risk", 0)

    flood = (
        results.get("flood") or {}
    ).get("risk", 0)

    fire = (
        results.get("fire") or {}
    ).get("risk", 0)

    pollution = (
        results.get("pollution") or {}
    ).get("risk", 0)

    if flood >= 60 and landslide >= 60:

        cascades.append({
            "type":
                "FLOOD_LANDSLIDE",

            "severity":
                "CRITICAL",

            "message":
                "Concurrent flood and slope-failure "
                "risk detected."
        })

    if fire >= 60 and pollution >= 60:

        cascades.append({
            "type":
                "FIRE_AIR_QUALITY",

            "severity":
                "CRITICAL",

            "message":
                "Forest fire conditions may create "
                "dangerous air-quality exposure."
        })

    return cascades


# ============================================================
# EVACUATION DECISION
# ============================================================

def evacuation_decision(results):

    risks = {
        name:
            result.get("risk", 0)

        for name, result
        in results.items()

        if result is not None
    }

    if not risks:

        return {
            "required": False,
            "reason": "No hazard predictions available."
        }

    dominant = max(
        risks,
        key=risks.get
    )

    score = risks[dominant]

    required = score >= 70

    return {
        "required":
            required,

        "dominant_hazard":
            dominant.upper(),

        "dominant_risk":
            round(score, 2),

        "action":
            (
                "CALCULATE_SAFE_ROUTE"
                if required
                else "MONITOR"
            )
    }


# ============================================================
# MAIN FUSION
# ============================================================

def run_fusion(
    landslide_data=None,
    flood_data=None,
    fire_data=None,
    pollution_data=None
):

    results = {}

    if landslide_data:

        results["landslide"] = (
            predict_landslide(
                landslide_data
            )
        )

    if flood_data:

        results["flood"] = (
            predict_flood(
                flood_data
            )
        )

    if fire_data:

        results["fire"] = (
            predict_fire(
                fire_data
            )
        )

    if pollution_data:

        results["pollution"] = (
            predict_pollution(
                pollution_data
            )
        )

    cascades = detect_cascade(
        results
    )

    evacuation = evacuation_decision(
        results
    )
    route = None

    if evacuation.get("required"):
        route = calculate_safe_route(
        results
    )

    return {
    "project": "AXON",

    "engine":
        "MULTI_HAZARD_FUSION",

    "hazards":
        results,

    "cascades":
        cascades,

    "evacuation":
        evacuation,

    "safe_route":
        route
}