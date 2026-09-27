from pathlib import Path
import zipfile
import io
import json
import joblib
import numpy as np
import pandas as pd

from xgboost import XGBRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)

ZIP_FILE = Path(
    "ml/pollution/data/beijing+multi+site+air+quality+data.zip"
)

MODEL_DIR = Path("ml/pollution/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

FEATURES = [
    "PM2.5",
    "PM10",
    "SO2",
    "NO2",
    "CO",
    "O3",
    "TEMP",
    "PRES",
    "DEWP",
    "RAIN",
    "WSPM",
    "pm25_1h",
    "pm25_3h",
    "pm25_6h",
    "pm25_24h",
    "pm25_change_1h",
    "hour",
    "month"
]

TARGET = "target_pm25_3h"


def load_dataset():

    print("[1] Opening dataset...")

    frames = []

    # Uploaded ZIP contains another ZIP
    with zipfile.ZipFile(ZIP_FILE) as outer:

        inner_name = (
            "PRSA2017_Data_20130301-20170228.zip"
        )

        inner_bytes = outer.read(inner_name)

        with zipfile.ZipFile(
            io.BytesIO(inner_bytes)
        ) as inner:

            csv_files = [
                f for f in inner.namelist()
                if f.endswith(".csv")
            ]

            print(
                "Monitoring stations:",
                len(csv_files)
            )

            for file in csv_files:

                print(
                    "Loading:",
                    Path(file).name
                )

                with inner.open(file) as f:

                    df = pd.read_csv(f)

                    frames.append(df)

    return pd.concat(
        frames,
        ignore_index=True
    )


def main():

    print("=" * 65)
    print("AXON - POLLUTION FORECASTING ENGINE")
    print("=" * 65)

    # -----------------------------------
    # LOAD
    # -----------------------------------

    df = load_dataset()

    print()
    print(
        "Raw dataset:",
        df.shape
    )

    # -----------------------------------
    # TIME
    # -----------------------------------

    print("\n[2] Building timestamps...")

    df["timestamp"] = pd.to_datetime(
        dict(
            year=df["year"],
            month=df["month"],
            day=df["day"],
            hour=df["hour"]
        ),
        errors="coerce"
    )

    # -----------------------------------
    # CLEAN
    # -----------------------------------

    print("\n[3] Cleaning pollution data...")

    numeric = [
        "PM2.5",
        "PM10",
        "SO2",
        "NO2",
        "CO",
        "O3",
        "TEMP",
        "PRES",
        "DEWP",
        "RAIN",
        "WSPM"
    ]

    for col in numeric:

        df[col] = pd.to_numeric(
            df[col],
            errors="coerce"
        )

    df = df.dropna(
        subset=[
            "timestamp",
            "station",
            "PM2.5"
        ]
    )

    # Sort BEFORE time features
    df = df.sort_values(
        ["station", "timestamp"]
    )

    # Limited interpolation within station
    for col in numeric:

        df[col] = (
            df
            .groupby("station")[col]
            .transform(
                lambda x:
                x.interpolate(
                    limit=3
                )
            )
        )

    # -----------------------------------
    # TEMPORAL FEATURES
    # -----------------------------------

    print("\n[4] Creating temporal features...")

    grouped = df.groupby(
        "station"
    )["PM2.5"]

    df["pm25_1h"] = grouped.shift(1)

    df["pm25_3h"] = grouped.shift(3)

    df["pm25_6h"] = grouped.shift(6)

    df["pm25_24h"] = grouped.shift(24)

    df["pm25_change_1h"] = (
        df["PM2.5"]
        -
        df["pm25_1h"]
    )

    # -----------------------------------
    # FUTURE TARGET
    # -----------------------------------

    print(
        "\n[5] Creating +3 hour PM2.5 target..."
    )

    df[TARGET] = (
        df
        .groupby("station")["PM2.5"]
        .shift(-3)
    )

    model_data = df.dropna(
        subset=FEATURES + [TARGET]
    ).copy()

    print(
        "ML rows:",
        len(model_data)
    )

    # -----------------------------------
    # CHRONOLOGICAL SPLIT
    # -----------------------------------

    print(
        "\n[6] Creating chronological split..."
    )

    model_data = model_data.sort_values(
        "timestamp"
    )

    split = int(
        len(model_data) * 0.80
    )

    train = model_data.iloc[:split]
    test = model_data.iloc[split:]

    X_train = train[FEATURES]
    y_train = train[TARGET]

    X_test = test[FEATURES]
    y_test = test[TARGET]

    print(
        "Train:",
        len(train)
    )

    print(
        "Test :",
        len(test)
    )

    # -----------------------------------
    # MODEL
    # -----------------------------------

    print(
        "\n[7] Training XGBoost..."
    )

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

    # -----------------------------------
    # EVALUATION
    # -----------------------------------

    print(
        "\n[8] Evaluating..."
    )

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

    # Persistence baseline
    baseline = X_test["PM2.5"]

    baseline_mae = mean_absolute_error(
        y_test,
        baseline
    )

    gain = (
        (
            baseline_mae - mae
        )
        /
        baseline_mae
        * 100
    )

    print()
    print("=" * 65)
    print("POLLUTION MODEL RESULTS")
    print("=" * 65)

    print(
        f"MAE           : {mae:.4f} ug/m3"
    )

    print(
        f"RMSE          : {rmse:.4f} ug/m3"
    )

    print(
        f"R2            : {r2:.4f}"
    )

    print(
        f"Baseline MAE  : {baseline_mae:.4f} ug/m3"
    )

    print(
        f"Baseline gain : {gain:.2f}%"
    )

    # -----------------------------------
    # SAVE
    # -----------------------------------

    joblib.dump(
        model,
        MODEL_DIR / "pollution_model.pkl"
    )

    importance = pd.DataFrame({
        "feature": FEATURES,
        "importance":
            model.feature_importances_
    }).sort_values(
        "importance",
        ascending=False
    )

    importance.to_csv(
        MODEL_DIR /
        "feature_importance.csv",
        index=False
    )

    metadata = {

        "project": "AXON",

        "model":
            "XGBoost PM2.5 Forecaster",

        "forecast_horizon":
            "3 hours",

        "features":
            FEATURES,

        "training_rows":
            len(train),

        "test_rows":
            len(test),

        "metrics": {
            "mae": float(mae),
            "rmse": float(rmse),
            "r2": float(r2),
            "baseline_mae":
                float(baseline_mae)
        }
    }

    with open(
        MODEL_DIR /
        "pollution_model_metadata.json",
        "w"
    ) as f:

        json.dump(
            metadata,
            f,
            indent=4
        )

    print()
    print("=" * 65)
    print("AXON POLLUTION MODEL COMPLETE")
    print("=" * 65)

    print(
        "Model:",
        MODEL_DIR /
        "pollution_model.pkl"
    )


if __name__ == "__main__":
    main()