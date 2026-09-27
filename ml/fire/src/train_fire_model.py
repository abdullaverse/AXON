from pathlib import Path
import joblib
import json
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report
)
from xgboost import XGBClassifier


DATA_FILE = Path("ml/fire/data/forestfires.csv")
MODEL_DIR = Path("ml/fire/models")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

FEATURES = [
    "FFMC",
    "DMC",
    "DC",
    "ISI",
    "temp",
    "RH",
    "wind",
    "rain"
]


def evaluate(name, model, X_test, y_test):

    pred = model.predict(X_test)
    prob = model.predict_proba(X_test)[:, 1]

    result = {
        "accuracy": accuracy_score(y_test, pred),
        "precision": precision_score(y_test, pred, zero_division=0),
        "recall": recall_score(y_test, pred, zero_division=0),
        "f1": f1_score(y_test, pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, prob)
    }

    print("\n" + "=" * 60)
    print(name)
    print("=" * 60)

    for key, value in result.items():
        print(f"{key:12}: {value:.4f}")

    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, pred))

    print("\nClassification Report:")
    print(classification_report(y_test, pred, zero_division=0))

    return result


def main():

    print("=" * 60)
    print("AXON - FOREST FIRE ML ENGINE")
    print("=" * 60)

    df = pd.read_csv(DATA_FILE)

    print("Dataset:", df.shape)

    # Prototype target:
    # area > 0 means a recorded burned area.
    df["fire"] = (df["area"] > 0).astype(int)

    print("\nClass distribution:")
    print(df["fire"].value_counts())

    data = df[FEATURES + ["fire"]].dropna()

    X = data[FEATURES]
    y = data["fire"]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.25,
        random_state=42,
        stratify=y
    )

    print("\nTrain:", len(X_train))
    print("Test :", len(X_test))

    # RANDOM FOREST

    rf = RandomForestClassifier(
        n_estimators=400,
        max_depth=8,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )

    rf.fit(X_train, y_train)

    rf_results = evaluate(
        "RANDOM FOREST",
        rf,
        X_test,
        y_test
    )

    # XGBOOST

    negatives = (y_train == 0).sum()
    positives = (y_train == 1).sum()

    xgb = XGBClassifier(
        n_estimators=400,
        max_depth=4,
        learning_rate=0.04,
        subsample=0.85,
        colsample_bytree=0.85,
        scale_pos_weight=negatives / positives,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1
    )

    xgb.fit(X_train, y_train)

    xgb_results = evaluate(
        "XGBOOST",
        xgb,
        X_test,
        y_test
    )

    print("\n" + "=" * 60)
    print("MODEL COMPARISON")
    print("=" * 60)

    print(
        f"Random Forest ROC-AUC : "
        f"{rf_results['roc_auc']:.4f}"
    )

    print(
        f"XGBoost ROC-AUC       : "
        f"{xgb_results['roc_auc']:.4f}"
    )

    if xgb_results["roc_auc"] >= rf_results["roc_auc"]:
        winner = xgb
        winner_name = "XGBoost"
        winner_results = xgb_results
    else:
        winner = rf
        winner_name = "Random Forest"
        winner_results = rf_results

    joblib.dump(
        winner,
        MODEL_DIR / "fire_model.pkl"
    )

    metadata = {
        "project": "AXON",
        "model": winner_name,
        "features": FEATURES,
        "target": "recorded burned area > 0",
        "dataset_rows": len(data),
        "metrics": winner_results,
        "note":
            "Prototype historical fire-risk model. "
            "Live AXON deployment additionally uses local "
            "smoke/gas sensing and external fire observations."
    }

    with open(
        MODEL_DIR / "fire_model_metadata.json",
        "w"
    ) as file:
        json.dump(metadata, file, indent=4)

    print("\nWINNER:", winner_name)

    print(
        "Saved:",
        MODEL_DIR / "fire_model.pkl"
    )


if __name__ == "__main__":
    main()