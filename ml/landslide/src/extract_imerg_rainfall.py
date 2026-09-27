from pathlib import Path
from datetime import timedelta
import re

import pandas as pd
import requests
import xarray as xr
from tqdm import tqdm
session = requests.Session()
session.auth = (
    "YOUR_EARTHDATA_USERNAME",
    "YOUR_EARTHDATA_PASSWORD"
)
session.headers.update({
    "User-Agent": "AXON-NASA-Downloader/1.0"
})


BASE = Path("ml/landslide/data")

LANDSLIDE_CSV = BASE / "global_landslide_catalog.csv"
LINKS_FILE = BASE / "imerg_links.txt"
DOWNLOAD_DIR = BASE / "imerg_nc4"
OUTPUT_CSV = BASE / "landslide_with_rainfall.csv"

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def load_links():
    links = LINKS_FILE.read_text(encoding="utf-8").splitlines()

    date_to_url = {}

    for url in links:
        url = url.strip()

        if not url.endswith(".nc4"):
            continue

        match = re.search(r"3IMERG\.(\d{8})-", url)

        if match:
            date_to_url[match.group(1)] = url

    return date_to_url


def download_file(url, out_path):
    if out_path.exists():
        return True

    print(f"Downloading: {out_path.name}")

    with session.get(
        url,
        stream=True,
        allow_redirects=True,
        timeout=120
    ) as response:

        if response.status_code != 200:
            print("Download failed:", response.status_code,response.url)
            return False

        content_type = response.headers.get("content-type", "")

        if "text/html" in content_type:
            print(
                "NASA returned an HTML login page instead of data."
            )
            print(
                "We need authenticated Earthdata download setup."
            )
            return False

        with open(out_path, "wb") as file:
            for chunk in response.iter_content(
                chunk_size=1024 * 1024
            ):
                if chunk:
                    file.write(chunk)

    return True


def find_precip_variable(ds):
    candidates = [
        "precipitation",
        "precipitationCal",
        "precipitationFinal",
        "precipitationUncal",
        "precipitationQualityIndex"
    ]

    for name in candidates:
        if name in ds.data_vars:
            return name

    print("Available variables:")
    print(list(ds.data_vars))

    raise ValueError(
        "Could not automatically identify precipitation variable."
    )


def extract_point_rainfall(file_path, lat, lon):
    ds = xr.open_dataset(file_path)

    precip_var = find_precip_variable(ds)

    lat_name = "lat" if "lat" in ds.coords else "latitude"
    lon_name = "lon" if "lon" in ds.coords else "longitude"

    value = (
        ds[precip_var]
        .sel(
            {
                lat_name: float(lat),
                lon_name: float(lon)
            },
            method="nearest"
        )
        .values
    )

    ds.close()

    try:
        return float(value.squeeze())
    except Exception:
        return None


def main():
    print("=" * 65)
    print("AXON - NASA IMERG RAINFALL EXTRACTOR")
    print("=" * 65)

    links = load_links()

    print("IMERG links loaded:", len(links))

    df = pd.read_csv(LANDSLIDE_CSV)

    print("Landslide records:", len(df))

    required = [
        "event_date",
        "latitude",
        "longitude"
    ]

    for col in required:
        if col not in df.columns:
            raise ValueError(
                f"Missing required column: {col}"
            )

    df["event_date"] = pd.to_datetime(
        df["event_date"],
        errors="coerce"
    )

    df = df.dropna(
        subset=[
            "event_date",
            "latitude",
            "longitude"
        ]
    ).copy()

    # Start SMALL.
    # We test only first 10 records first.
    test_df = df.head(100).copy()

    output_rows = []

    for _, row in tqdm(
        test_df.iterrows(),
        total=len(test_df)
    ):
        event_date = row["event_date"]
        lat = row["latitude"]
        lon = row["longitude"]

        daily_rain = {}

        # Event day + previous 6 days
        for days_before in range(0, 7):
            target_date = (
                event_date
                - timedelta(days=days_before)
            )

            date_string = target_date.strftime("%Y%m%d")

            url = links.get(date_string)

            if not url:
                daily_rain[days_before] = None
                continue

            filename = url.split("/")[-1]

            local_file = (
                DOWNLOAD_DIR
                / filename
            )

            success = download_file(
                url,
                local_file
            )

            if not success:
                daily_rain[days_before] = None
                continue

            try:
                rainfall = extract_point_rainfall(
                    local_file,
                    lat,
                    lon
                )

                daily_rain[days_before] = rainfall

            except Exception as error:
                print(
                    "Extraction error:",
                    local_file.name,
                    error
                )

                daily_rain[days_before] = None

        rain_1day = daily_rain.get(0)

        vals_3 = [
            daily_rain.get(i)
            for i in range(0, 3)
            if daily_rain.get(i) is not None
        ]

        vals_7 = [
            daily_rain.get(i)
            for i in range(0, 7)
            if daily_rain.get(i) is not None
        ]

        output_rows.append(
            {
                "event_id": row.get("event_id"),
                "event_date": event_date,
                "latitude": lat,
                "longitude": lon,
                "landslide_trigger": row.get(
                    "landslide_trigger"
                ),
                "landslide_size": row.get(
                    "landslide_size"
                ),
                "rain_1day": (
                    rain_1day
                    if rain_1day is not None
                    else None
                ),
                "rain_3day": (
                    sum(vals_3)
                    if vals_3
                    else None
                ),
                "rain_7day": (
                    sum(vals_7)
                    if vals_7
                    else None
                ),
                "landslide": 1
            }
        )

    output = pd.DataFrame(
        output_rows
    )

    output.to_csv(
        OUTPUT_CSV,
        index=False
    )

    print()
    print("=" * 65)
    print("DONE")
    print("=" * 65)

    print(
        "Saved:",
        OUTPUT_CSV
    )

    print()
    print(output)


if __name__ == "__main__":
    main()