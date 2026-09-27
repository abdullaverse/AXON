from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)

from xgboost import XGBRegressor


DATA_FILE = Path("ml/flood/data/cwc_water_level.csv")
MODEL_DIR = Path("ml/flood/models")
OUTPUT_DIR = Path("ml/flood/data")

MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Exact CWC columns
TIME_COL = "Data Acquisition Time"
LEVEL_COL = "River Water Level Telemetry Hourly (meter)"
STATION_COL = "Station"


def main():

    print("=" * 65)
    print("AXON - FLOOD FORECASTING ENGINE")
    print("=" * 65)

    # --------------------------------------------------
    # 1. LOAD CWC DATA
    # --------------------------------------------------

    print("\n[1] Loading CWC dataset...")

    df = pd.read_csv(
        DATA_FILE,
        low_memory=False
    )

    print("Raw rows:", len(df))
    print("Raw columns:", len(df.columns))

    # --------------------------------------------------
    # 2. CLEAN
    # --------------------------------------------------

    print("\n[2] Cleaning data...")

    df[TIME_COL] = pd.to_datetime(
        df[TIME_COL],
        dayfirst=True,
        errors="coerce"
    )

    df[LEVEL_COL] = pd.to_numeric(
        df[LEVEL_COL],
        errors="coerce"
    )

    df = df.dropna(
        subset=[
            TIME_COL,
            LEVEL_COL,
            STATION_COL
        ]
    )

    # Remove obvious impossible/extreme corrupted values
    df = df[
        df[LEVEL_COL].between(-20, 100)
    ]

    df = df.sort_values(
        [STATION_COL, TIME_COL]
    )

    print("Clean rows:", len(df))
    print(
        "Stations:",
        df[STATION_COL].nunique()
    )

    # --------------------------------------------------
    # 3. HOURLY RESAMPLING PER STATION
    # --------------------------------------------------

    print("\n[3] Building hourly station time-series...")

    frames = []

    for station, group in df.groupby(STATION_COL):

        group = group[
            [TIME_COL, LEVEL_COL]
        ].copy()

        group = (
            group
            .drop_duplicates(TIME_COL)
            .set_index(TIME_COL)
            .sort_index()
        )

        # CWC telemetry can contain sub-hour readings.
        # Convert to hourly median level.
        group = group.resample("1h").median()

        # Only interpolate short gaps
        group[LEVEL_COL] = (
            group[LEVEL_COL]
            .interpolate(
                method="time",
                limit=3
            )
        )

        group[STATION_COL] = station

        group = group.reset_index()

        frames.append(group)

    data = pd.concat(
        frames,
        ignore_index=True
    )

    print("Hourly rows:", len(data))

    # --------------------------------------------------
    # 4. FEATURE ENGINEERING
    # --------------------------------------------------

    print("\n[4] Creating flood features...")

    data = data.sort_values(
        [STATION_COL, TIME_COL]
    )

    groups = data.groupby(
        STATION_COL
    )[LEVEL_COL]

    # Current / historical water level
    data["level_now"] = data[LEVEL_COL]

    data["level_1h"] = groups.shift(1)
    data["level_3h"] = groups.shift(3)
    data["level_6h"] = groups.shift(6)
    data["level_12h"] = groups.shift(12)
    data["level_24h"] = groups.shift(24)

    # Rate of rise
    data["rise_1h"] = (
        data["level_now"]
        -
        data["level_1h"]
    )

    data["rise_3h"] = (
        data["level_now"]
        -
        data["level_3h"]
    ) / 3.0

    data["rise_6h"] = (
        data["level_now"]
        -
        data["level_6h"]
    ) / 6.0

    # Recent range / variability
    data["rolling_mean_6h"] = (
        groups
        .rolling(6)
        .mean()
        .reset_index(level=0, drop=True)
    )

    data["rolling_std_6h"] = (
        groups
        .rolling(6)
        .std()
        .reset_index(level=0, drop=True)
    )

    # Time features
    data["hour"] = data[TIME_COL].dt.hour
    data["month"] = data[TIME_COL].dt.month

    # --------------------------------------------------
    # 5. TARGET
    # --------------------------------------------------
    #
    # Prototype target:
    # water level 3 hours ahead.
    #
    # Later AXON can also train 1h / 6h horizons.
    # --------------------------------------------------

    print("\n[5] Creating +3 hour forecast target...")

    data["target_level_3h"] = (
        data
        .groupby(STATION_COL)[LEVEL_COL]
        .shift(-3)
    )

    FEATURES = [
        "level_now",
        "level_1h",
        "level_3h",
        "level_6h",
        "level_12h",
        "level_24h",
        "rise_1h",
        "rise_3h",
        "rise_6h",
        "rolling_mean_6h",
        "rolling_std_6h",
        "hour",
        "month"
    ]

    TARGET = "target_level_3h"

    model_data = data.dropna(
        subset=FEATURES + [TARGET]
    ).copy()

    print(
        "ML rows:",
        len(model_data)
    )

    # --------------------------------------------------
    # 6. TIME-BASED TRAIN / TEST SPLIT
    # --------------------------------------------------

    print("\n[6] Creating chronological train/test split...")

    model_data = model_data.sort_values(
        TIME_COL
    )

    split_index = int(
        len(model_data) * 0.80
    )

    train = model_data.iloc[
        :split_index
    ]

    test = model_data.iloc[
        split_index:
    ]

    X_train = train[FEATURES]
    y_train = train[TARGET]

    X_test = test[FEATURES]
    y_test = test[TARGET]

    print("Train:", len(train))
    print("Test :", len(test))

    print(
        "Train end:",
        train[TIME_COL].max()
    )

    print(
        "Test start:",
        test[TIME_COL].min()
    )

    # --------------------------------------------------
    # 7. XGBOOST
    # --------------------------------------------------

    print("\n[7] Training XGBoost flood model...")

    model = XGBRegressor(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=-1
    )

    model.fit(
        X_train,
        y_train
    )

    # --------------------------------------------------
    # 8. EVALUATE
    # --------------------------------------------------

    print("\n[8] Evaluating...")

    predictions = model.predict(
        X_test
    )

    mae = mean_absolute_error(
        y_test,
        predictions
    )

    rmse = np.sqrt(
        mean_squared_error(
            y_test,
            predictions
        )
    )

    r2 = r2_score(
        y_test,
        predictions
    )

    # Persistence baseline:
    # assume future level = current level
    baseline = X_test["level_now"]

    baseline_mae = mean_absolute_error(
        y_test,
        baseline
    )

    print()
    print("=" * 65)
    print("FLOOD MODEL RESULTS")
    print("=" * 65)

    print(
        f"MAE             : {mae:.4f} m"
    )

    print(
        f"RMSE            : {rmse:.4f} m"
    )

    print(
        f"R2              : {r2:.4f}"
    )

    print(
        f"Baseline MAE    : {baseline_mae:.4f} m"
    )

    improvement = (
        (
            baseline_mae - mae
        )
        /
        baseline_mae
        *
        100
        if baseline_mae > 0
        else 0
    )

    print(
        f"Baseline gain   : {improvement:.2f}%"
    )

    # --------------------------------------------------
    # 9. FEATURE IMPORTANCE
    # --------------------------------------------------

    importance = pd.DataFrame({
        "feature": FEATURES,
        "importance": model.feature_importances_
    }).sort_values(
        "importance",
        ascending=False
    )

    print("\nFeature importance:")
    print(importance.to_string(index=False))

    importance.to_csv(
        MODEL_DIR / "feature_importance.csv",
        index=False
    )

    # --------------------------------------------------
    # 10. SAVE MODEL
    # --------------------------------------------------

    joblib.dump(
        model,
        MODEL_DIR / "flood_model.pkl"
    )

    metadata = {

        "project": "AXON",

        "model":
            "XGBoost River Water Level Forecaster",

        "target":
            "river water level 3 hours ahead",

        "forecast_horizon_hours":
            3,

        "features":
            FEATURES,

        "training_rows":
            len(train),

        "test_rows":
            len(test),

        "metrics": {
            "mae_m": float(mae),
            "rmse_m": float(rmse),
            "r2": float(r2),
            "baseline_mae_m":
                float(baseline_mae)
        },

        "warning":
            "Prototype forecasting model. "
            "Operational flood warning requires "
            "station-specific warning/danger levels, "
            "rainfall and independent validation."
    }

    with open(
        MODEL_DIR / "flood_model_metadata.json",
        "w"
    ) as file:

        json.dump(
            metadata,
            file,
            indent=4
        )

    # Save small processed sample, not entire giant dataframe
    model_data.head(5000).to_csv(
        OUTPUT_DIR / "flood_processed_sample.csv",
        index=False
    )

    print()
    print("=" * 65)
    print("AXON FLOOD MODEL COMPLETE")
    print("=" * 65)

    print(
        "Model:",
        MODEL_DIR / "flood_model.pkl"
    )

    print(
        "Metadata:",
        MODEL_DIR / "flood_model_metadata.json"
    )


if __name__ == "__main__":
    main()