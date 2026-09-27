import time
from threading import Lock

lock = Lock()

simulation = {
    "running": False,
    "paused": False,
    "scenario": "NORMAL",
    "started_at": None,
    "elapsed": 0.0,
    "stage": "NORMAL",
    "network_failed": False,
    "sensors": {
        "rainfall": 5.0,
        "water_level_m": 1.2,
        "soil_moisture": 30.0,
        "vibration": 0.04,
        "temperature": 28.0,
        "humidity": 65.0,
        "smoke": 5.0,
        "gas": 10.0,
        "pm25": 25.0,
        "pm10": 40.0
    }
}


CASCADE_KEYFRAMES = [
    {
        "t": 0,
        "stage": "NORMAL",
        "rainfall": 5,
        "water_level_m": 1.2,
        "soil_moisture": 30,
        "vibration": 0.04
    },
    {
        "t": 5,
        "stage": "HEAVY_RAIN",
        "rainfall": 28,
        "water_level_m": 1.35,
        "soil_moisture": 42,
        "vibration": 0.06
    },
    {
        "t": 10,
        "stage": "SOIL_SATURATION",
        "rainfall": 46,
        "water_level_m": 1.55,
        "soil_moisture": 55,
        "vibration": 0.10
    },
    {
        "t": 15,
        "stage": "SLOPE_INSTABILITY",
        "rainfall": 62,
        "water_level_m": 1.80,
        "soil_moisture": 69,
        "vibration": 0.22
    },
    {
        "t": 20,
        "stage": "LANDSLIDE_WARNING",
        "rainfall": 75,
        "water_level_m": 2.05,
        "soil_moisture": 79,
        "vibration": 0.45
    },
    {
        "t": 25,
        "stage": "ROAD_FAILURE",
        "rainfall": 84,
        "water_level_m": 2.35,
        "soil_moisture": 86,
        "vibration": 0.70
    },
    {
        "t": 30,
        "stage": "FLOOD_RISING",
        "rainfall": 91,
        "water_level_m": 2.75,
        "soil_moisture": 89,
        "vibration": 0.76
    },
    {
        "t": 35,
        "stage": "ROUTE_INVALIDATED",
        "rainfall": 94,
        "water_level_m": 3.10,
        "soil_moisture": 91,
        "vibration": 0.80
    },
    {
        "t": 40,
        "stage": "SAFE_ROUTE_RECALCULATED",
        "rainfall": 96,
        "water_level_m": 3.30,
        "soil_moisture": 92,
        "vibration": 0.82
    },
    {
        "t": 45,
        "stage": "COMMUNITY_ALERT",
        "rainfall": 96,
        "water_level_m": 3.35,
        "soil_moisture": 93,
        "vibration": 0.83
    }
]


def interpolate(a, b, ratio):
    return a + (b - a) * ratio


def get_simulation_state():

    with lock:

        if not simulation["running"]:
            return simulation.copy()

        if simulation["paused"]:
            elapsed = simulation["elapsed"]
        else:
            elapsed = time.time() - simulation["started_at"]

        simulation["elapsed"] = elapsed

        frames = CASCADE_KEYFRAMES

        if elapsed >= frames[-1]["t"]:
            frame = frames[-1]

            simulation["stage"] = frame["stage"]

            for key in [
                "rainfall",
                "water_level_m",
                "soil_moisture",
                "vibration"
            ]:
                simulation["sensors"][key] = frame[key]

            return simulation.copy()

        left = frames[0]
        right = frames[1]

        for i in range(len(frames) - 1):

            if frames[i]["t"] <= elapsed <= frames[i + 1]["t"]:
                left = frames[i]
                right = frames[i + 1]
                break

        span = right["t"] - left["t"]

        ratio = (
            (elapsed - left["t"]) / span
            if span > 0
            else 0
        )

        simulation["stage"] = left["stage"]

        for key in [
            "rainfall",
            "water_level_m",
            "soil_moisture",
            "vibration"
        ]:

            simulation["sensors"][key] = round(
                interpolate(
                    left[key],
                    right[key],
                    ratio
                ),
                3
            )

        return simulation.copy()


def start_simulation(scenario="CASCADE"):

    with lock:

        simulation["running"] = True
        simulation["paused"] = False
        simulation["scenario"] = scenario
        simulation["started_at"] = time.time()
        simulation["elapsed"] = 0
        simulation["stage"] = "NORMAL"
        simulation["network_failed"] = False

    return get_simulation_state()


def pause_simulation():

    state = get_simulation_state()

    with lock:

        simulation["paused"] = True
        simulation["elapsed"] = state["elapsed"]

    return simulation.copy()


def reset_simulation():

    with lock:

        simulation["running"] = False
        simulation["paused"] = False
        simulation["scenario"] = "NORMAL"
        simulation["started_at"] = None
        simulation["elapsed"] = 0
        simulation["stage"] = "NORMAL"
        simulation["network_failed"] = False

        simulation["sensors"].update({
            "rainfall": 5.0,
            "water_level_m": 1.2,
            "soil_moisture": 30.0,
            "vibration": 0.04,
            "temperature": 28.0,
            "humidity": 65.0,
            "smoke": 5.0,
            "gas": 10.0,
            "pm25": 25.0,
            "pm10": 40.0
        })

    return simulation.copy()


def trigger_network_failure():

    with lock:
        simulation["network_failed"] = True

    return simulation.copy()