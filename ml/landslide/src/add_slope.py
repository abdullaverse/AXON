import pandas as pd
import requests
import math
import time


INPUT_FILE = "ml/landslide/data/landslide_with_elevation.csv"
OUTPUT_FILE = "ml/landslide/data/landslide_with_slope.csv"

API_URL = "https://api.opentopodata.org/v1/srtm90m"


# Approximate distance represented by latitude offset
OFFSET = 0.001

# Roughly ~111 meters in latitude
DISTANCE_METERS = 111


def get_elevation(lat, lon):

    try:

        response = requests.get(
            API_URL,
            params={
                "locations": f"{lat},{lon}"
            },
            timeout=20
        )

        response.raise_for_status()

        data = response.json()

        results = data.get(
            "results",
            []
        )

        if not results:
            return None

        return results[0].get(
            "elevation"
        )

    except Exception as error:

        print(
            "Elevation error:",
            lat,
            lon,
            error
        )

        return None


def calculate_slope(lat, lon, center_elevation):

    # Nearby locations
    nearby_points = [

        # North
        (
            lat + OFFSET,
            lon
        ),

        # South
        (
            lat - OFFSET,
            lon
        ),

        # East
        (
            lat,
            lon + OFFSET
        ),

        # West
        (
            lat,
            lon - OFFSET
        )

    ]

    slopes = []


    for nearby_lat, nearby_lon in nearby_points:

        nearby_elevation = get_elevation(
            nearby_lat,
            nearby_lon
        )

        if nearby_elevation is None:
            continue


        elevation_difference = abs(
            nearby_elevation
            -
            center_elevation
        )


        # slope angle:
        #
        # tan(theta)
        # =
        # vertical change / horizontal distance

        slope_radians = math.atan(
            elevation_difference
            /
            DISTANCE_METERS
        )


        slope_degrees = math.degrees(
            slope_radians
        )


        slopes.append(
            slope_degrees
        )


        # Free API protection
        time.sleep(0.5)


    if not slopes:

        return None


    # Use the steepest nearby direction
    return max(slopes)


def main():

    print("=" * 60)
    print("AXON - TERRAIN SLOPE EXTRACTOR")
    print("=" * 60)


    df = pd.read_csv(
        INPUT_FILE
    )


    print(
        "Rows:",
        len(df)
    )


    slopes = []


    for index, row in df.iterrows():

        lat = row["latitude"]

        lon = row["longitude"]

        elevation = row["elevation_m"]


        print(
            f"[{index + 1}/{len(df)}] "
            f"lat={lat}, lon={lon}, "
            f"elevation={elevation}"
        )


        if pd.isna(elevation):

            slopes.append(
                None
            )

            continue


        slope = calculate_slope(
            lat,
            lon,
            elevation
        )


        if slope is not None:

            slope = round(
                slope,
                2
            )


        slopes.append(
            slope
        )


    df["slope_deg"] = slopes


    df.to_csv(
        OUTPUT_FILE,
        index=False
    )


    print()

    print("=" * 60)
    print("DONE")
    print("=" * 60)


    print(
        "Saved:",
        OUTPUT_FILE
    )


    print()


    print(
        df[
            [
                "latitude",
                "longitude",
                "elevation_m",
                "slope_deg",
                "rain_1day",
                "rain_3day",
                "rain_7day",
                "landslide"
            ]
        ].head(10)
    )


if __name__ == "__main__":
    main()