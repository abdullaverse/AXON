from pathlib import Path
from datetime import timedelta
import re

import pandas as pd
import xarray as xr


BASE = Path("ml/landslide/data")

POSITIVE_FILE = BASE / "landslide_with_slope.csv"
LINKS_FILE = BASE / "imerg_links.txt"
NC4_DIR = BASE / "imerg_nc4"

OUTPUT_FILE = BASE / "landslide_training.csv"


def load_links():
    date_to_file = {}

    for line in LINKS_FILE.read_text(
        encoding="utf-8"
    ).splitlines():

        url = line.strip()

        match = re.search(
            r"3IMERG\.(\d{8})-",
            url
        )

        if not match:
            continue

        date = match.group(1)
        filename = url.split("/")[-1]

        path = NC4_DIR / filename

        if path.exists():
            date_to_file[date] = path

    return date_to_file


def rainfall_at_point(path, lat, lon):

    try:
        ds = xr.open_dataset(path)

        variable = None

        for candidate in [
            "precipitation",
            "precipitationCal",
            "precipitationFinal"
        ]:
            if candidate in ds.data_vars:
                variable = candidate
                break

        if variable is None:
            ds.close()
            return None

        lat_name = (
            "lat"
            if "lat" in ds.coords
            else "latitude"
        )

        lon_name = (
            "lon"
            if "lon" in ds.coords
            else "longitude"
        )

        value = (
            ds[variable]
            .sel(
                {
                    lat_name: lat,
                    lon_name: lon
                },
                method="nearest"
            )
            .values
        )

        ds.close()

        return float(value.squeeze())

    except Exception:
        return None


def get_rainfall_features(
    control_date,
    lat,
    lon,
    files
):

    values = []

    for day in range(7):

        date = (
            control_date
            - timedelta(days=day)
        )

        key = date.strftime("%Y%m%d")

        path = files.get(key)

        if path is None:
            return None

        rain = rainfall_at_point(
            path,
            lat,
            lon
        )

        if rain is None:
            return None

        values.append(rain)

    return {
        "rain_1day": values[0],
        "rain_3day": sum(values[:3]),
        "rain_7day": sum(values)
    }


def main():

    print("=" * 60)
    print("AXON - CONTROL SAMPLE GENERATOR")
    print("=" * 60)

    positives = pd.read_csv(
        POSITIVE_FILE
    )

    positives["event_date"] = pd.to_datetime(
        positives["event_date"]
    )

    files = load_links()

    print(
        "Positive samples:",
        len(positives)
    )

    print(
        "Cached IMERG dates:",
        len(files)
    )

    controls = []

    # Try dates before each event.
    # Because our rainfall files are cached,
    # try several offsets and use the first
    # one for which all 7 days exist.

    offsets = [
        30,
        21,
        14,
        10,
        7
    ]

    for index, row in positives.iterrows():

        found = False

        for offset in offsets:

            control_date = (
                row["event_date"]
                - timedelta(days=offset)
            )

            rainfall = get_rainfall_features(
                control_date,
                row["latitude"],
                row["longitude"],
                files
            )

            if rainfall is None:
                continue

            controls.append({
                "event_id":
                    f"CONTROL_{row['event_id']}",

                "event_date":
                    control_date,

                "latitude":
                    row["latitude"],

                "longitude":
                    row["longitude"],

                "landslide_trigger":
                    "control",

                "landslide_size":
                    "control",

                "rain_1day":
                    rainfall["rain_1day"],

                "rain_3day":
                    rainfall["rain_3day"],

                "rain_7day":
                    rainfall["rain_7day"],

                "elevation_m":
                    row["elevation_m"],

                "slope_deg":
                    row["slope_deg"],

                "landslide":
                    0
            })

            found = True
            break

        print(
            f"[{index + 1}/{len(positives)}] "
            f"{'CONTROL OK' if found else 'NO CACHED CONTROL'}"
        )

    controls = pd.DataFrame(
        controls
    )

    print()
    print(
        "Controls generated:",
        len(controls)
    )

    training = pd.concat(
        [
            positives,
            controls
        ],
        ignore_index=True
    )

    training.to_csv(
        OUTPUT_FILE,
        index=False
    )

    print()
    print("=" * 60)
    print("TRAINING DATASET CREATED")
    print("=" * 60)

    print(
        "Total:",
        len(training)
    )

    print()
    print(
        training["landslide"].value_counts()
    )

    print()
    print(
        "Saved:",
        OUTPUT_FILE
    )


if __name__ == "__main__":
    main()