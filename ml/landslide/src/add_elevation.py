import pandas as pd
import requests
import time

INPUT_FILE = "ml/landslide/data/landslide_with_rainfall.csv"
OUTPUT_FILE = "ml/landslide/data/landslide_with_elevation.csv"

API_URL = "https://api.opentopodata.org/v1/srtm90m"


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

        results = data.get("results", [])

        if not results:
            return None

        return results[0].get("elevation")

    except Exception as error:
        print(
            "Elevation error:",
            lat,
            lon,
            error
        )

        return None


def main():

    print("=" * 60)
    print("AXON - TERRAIN ELEVATION EXTRACTOR")
    print("=" * 60)

    df = pd.read_csv(INPUT_FILE)

    print("Rows:", len(df))

    elevations = []

    for index, row in df.iterrows():

        lat = row["latitude"]
        lon = row["longitude"]

        print(
            f"[{index + 1}/{len(df)}] "
            f"{lat}, {lon}"
        )

        elevation = get_elevation(
            lat,
            lon
        )

        elevations.append(
            elevation
        )

        # Be gentle with the free API
        time.sleep(1)

    df["elevation_m"] = elevations

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
                "rain_1day",
                "rain_3day",
                "rain_7day",
                "elevation_m",
                "landslide"
            ]
        ].head(10)
    )


if __name__ == "__main__":
    main()