from pathlib import Path
import json

import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix,
)

from xgboost import XGBClassifier


DATA_FILE = Path("ml/landslide/data/landslide_training.csv")

MODEL_DIR = Path("ml/landslide/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

FEATURES = [
    "rain_1day",
    "rain_3day",
    "rain_7day",
    "elevation_m",
    "slope_deg",
]

TARGET = "landslide"


def evaluate(name, model, X_test, y_test):

    prediction = model.predict(X_test)
    probability = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": accuracy_score(y_test, prediction),
        "precision": precision_score(
            y_test,
            prediction,
            zero_division=0
        ),
        "recall": recall_score(
            y_test,
            prediction,
            zero_division=0
        ),
        "f1": f1_score(
            y_test,
            prediction,
            zero_division=0
        ),
        "roc_auc": roc_auc_score(
            y_test,
            probability
        ),
    }

    print("\n" + "=" * 60)
    print(name)
    print("=" * 60)

    for key, value in metrics.items():
        print(f"{key:12}: {value:.4f}")

    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, prediction))

    print("\nClassification Report:")
    print(
        classification_report(
            y_test,
            prediction,
            zero_division=0
        )
    )

    return metrics


def main():

    print("=" * 60)
    print("AXON - LANDSLIDE ML TRAINING")
    print("=" * 60)

    df = pd.read_csv(DATA_FILE)

    print("Dataset:", df.shape)

    print("\nClass distribution:")
    print(df[TARGET].value_counts())

    # Keep only required ML columns
    data = df[
        FEATURES + [TARGET]
    ].copy()

    data = data.dropna()

    X = data[FEATURES]
    y = data[TARGET]

    print("\nFeatures:")
    for feature in FEATURES:
        print(" -", feature)

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        random_state=42,
        stratify=y
    )

    print("\nTrain samples:", len(X_train))
    print("Test samples :", len(X_test))

    # -----------------------------
    # RANDOM FOREST
    # -----------------------------

    rf = RandomForestClassifier(
        n_estimators=300,
        max_depth=8,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )

    rf.fit(
        X_train,
        y_train
    )

    rf_metrics = evaluate(
        "RANDOM FOREST",
        rf,
        X_test,
        y_test
    )

    # -----------------------------
    # XGBOOST
    # -----------------------------

    negative = (y_train == 0).sum()
    positive = (y_train == 1).sum()

    scale_pos_weight = (
        negative / positive
        if positive > 0
        else 1
    )

    xgb = XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        eval_metric="logloss",
        random_state=42
    )

    xgb.fit(
        X_train,
        y_train
    )

    xgb_metrics = evaluate(
        "XGBOOST",
        xgb,
        X_test,
        y_test
    )

    # -----------------------------
    # SELECT WINNER
    # -----------------------------

    print("\n" + "=" * 60)
    print("MODEL COMPARISON")
    print("=" * 60)

    print(
        f"Random Forest ROC-AUC: "
        f"{rf_metrics['roc_auc']:.4f}"
    )

    print(
        f"XGBoost ROC-AUC      : "
        f"{xgb_metrics['roc_auc']:.4f}"
    )

    if xgb_metrics["roc_auc"] >= rf_metrics["roc_auc"]:

        winner = xgb
        winner_name = "XGBoost"

    else:

        winner = rf
        winner_name = "Random Forest"

    joblib.dump(
        winner,
        MODEL_DIR / "landslide_model.pkl"
    )

    metadata = {
        "model": winner_name,
        "features": FEATURES,
        "training_rows": len(data),
        "warning": (
            "Prototype model trained using catalog-screened "
            "temporal controls; requires larger independent "
            "validation before operational deployment."
        )
    }

    with open(
        MODEL_DIR / "landslide_model_metadata.json",
        "w"
    ) as file:

        json.dump(
            metadata,
            file,
            indent=4
        )

    print()
    print("WINNER:", winner_name)

    print(
        "Saved:",
        MODEL_DIR / "landslide_model.pkl"
    )


if __name__ == "__main__":
    main()