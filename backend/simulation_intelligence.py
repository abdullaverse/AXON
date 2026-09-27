from backend.digital_twin import get_simulation_state
from backend.fusion_engine import run_fusion


# ============================================================
# AXON DIGITAL TWIN → ML FEATURE ADAPTER
# ============================================================

SITE_CONTEXT = {
    # Prototype Aravenu hill deployment context
    "elevation_m": 1500.0,
    "slope_deg": 35.0
}


def build_landslide_features(state):

    sensors = state["sensors"]

    rainfall = float(
        sensors["rainfall"]
    )

    # --------------------------------------------------------
    # IMPORTANT:
    # The Digital Twin runs in seconds, while the trained
    # landslide model expects historical rainfall windows.
    #
    # These are SIMULATED ENVIRONMENTAL HISTORY features.
    # They are NOT claimed to be live NASA rainfall.
    # --------------------------------------------------------

    rain_1day = rainfall

    rain_3day = (
        rainfall * 2.25
    )

    rain_7day = (
        rainfall * 3.75
    )

    return {
        "rain_1day":
            round(rain_1day, 3),

        "rain_3day":
            round(rain_3day, 3),

        "rain_7day":
            round(rain_7day, 3),

        "elevation_m":
            SITE_CONTEXT["elevation_m"],

        "slope_deg":
            SITE_CONTEXT["slope_deg"]
    }


def get_simulation_intelligence():

    state = get_simulation_state()

    landslide_features = (
        build_landslide_features(
            state
        )
    )

    # --------------------------------------------------------
    # REAL TRAINED LANDSLIDE MODEL
    #
    # Flood / Fire / Pollution remain disconnected here until
    # their complete feature-history adapters are added.
    # --------------------------------------------------------

    fusion = run_fusion(
        landslide_data=
            landslide_features,

        flood_data=None,
        fire_data=None,
        pollution_data=None
    )

    return {
        "project": "AXON",

        "mode":
            "DIGITAL_TWIN",

        "simulation": state,

        "feature_adapter": {
            "landslide": {
                "status":
                    "CONNECTED",

                "provenance":
                    "SIMULATED_ENVIRONMENTAL_HISTORY",

                "features":
                    landslide_features
            },

            "flood": {
                "status":
                    "PENDING_FEATURE_ADAPTER"
            },

            "fire": {
                "status":
                    "PENDING_FEATURE_ADAPTER"
            },

            "pollution": {
                "status":
                    "PENDING_FEATURE_ADAPTER"
            }
        },

        "intelligence":
            fusion
    }