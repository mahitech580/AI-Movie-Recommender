"""Train/evaluate revenue regression, rating classification, clustering, and optional MLflow/XGBoost.

Dataset: public TMDB 5000 movie metadata mirror. The source CSV is cached locally and not
committed. Features are selected per task to avoid using the target rating as a predictor.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score, f1_score, mean_absolute_error, mean_squared_error,
    precision_score, r2_score, recall_score, roc_auc_score, silhouette_score,
)
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.dummy import DummyClassifier

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = (
    "https://raw.githubusercontent.com/vamshi121/TMDB-5000-Movie-Dataset/"
    "main/tmdb_5000_movies.csv"
)
CACHE_PATH = ROOT / ".cache" / "tmdb_5000_movies.csv"
REPORT_PATH = ROOT / "reports" / "predictive_model_metrics.json"


def download_dataset(source_url: str = DEFAULT_SOURCE, destination: Path = CACHE_PATH) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 100_000:
        return destination
    with httpx.Client(timeout=httpx.Timeout(45, connect=10), follow_redirects=True) as client:
        response = client.get(source_url, headers={"User-Agent": "CINEPLAY-model-pipeline/1.0"})
        response.raise_for_status()
        if len(response.content) < 100_000:
            raise ValueError("The downloaded movie dataset is unexpectedly small.")
        destination.write_bytes(response.content)
    return destination


def parse_json_list(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return value
    if not isinstance(value, str) or not value.strip():
        return []
    try:
        result = json.loads(value)
        return result if isinstance(result, list) else []
    except json.JSONDecodeError:
        return []


def load_dataset(dataset_path: Path | None = None, source_url: str = DEFAULT_SOURCE) -> pd.DataFrame:
    path = dataset_path or download_dataset(source_url)
    frame = pd.read_csv(path, low_memory=False)
    required = {"id", "title", "genres", "budget", "revenue", "runtime", "vote_average"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"TMDB dataset misses required columns: {', '.join(sorted(missing))}")
    for column in ("budget", "revenue", "runtime", "vote_average", "popularity", "vote_count"):
        if column in frame:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame["release_year"] = pd.to_datetime(frame.get("release_date"), errors="coerce").dt.year
    frame["genre_names"] = frame["genres"].apply(
        lambda cell: [str(row.get("name", "")).strip() for row in parse_json_list(cell)
                      if row.get("name")]
    )
    frame["language_feature"] = frame.get("original_language", pd.Series(["und"] * len(frame))).fillna("und")
    return frame


def build_features(frame: pd.DataFrame, numeric_columns: list[str]) -> tuple[pd.DataFrame, list[str]]:
    """One-hot genre/language features and imputed numeric metadata."""
    numeric = frame.reindex(columns=numeric_columns).copy()
    numeric = numeric.apply(pd.to_numeric, errors="coerce")
    numeric = numeric.replace([np.inf, -np.inf], np.nan)
    genre_list = sorted({genre for genres in frame["genre_names"] for genre in genres})
    for genre in genre_list:
        numeric[f"genre::{genre}"] = frame["genre_names"].apply(lambda values: float(genre in values))
    common_languages = set(frame["language_feature"].value_counts().head(15).index)
    language = frame["language_feature"].where(frame["language_feature"].isin(common_languages), "other")
    for code in sorted(set(language.astype(str))):
        numeric[f"language::{code}"] = (language.astype(str) == code).astype(float)
    numeric = numeric.apply(pd.to_numeric, errors="coerce")
    numeric = numeric.replace([np.inf, -np.inf], np.nan)
    all_missing = [column for column in numeric if numeric[column].isna().all()]
    numeric.drop(columns=all_missing, inplace=True)
    feature_names = numeric.columns.tolist()
    return numeric, feature_names


def _clean_metric(value: Any) -> float | None:
    try:
        converted = float(value)
        return round(converted, 5) if np.isfinite(converted) else None
    except (TypeError, ValueError):
        return None


def train_revenue_model(frame: pd.DataFrame) -> dict[str, Any]:
    sample = frame[
        frame["revenue"].notna() & frame["budget"].notna()
        & frame["runtime"].notna() & frame["release_year"].notna()
        & (frame["revenue"] > 0) & (frame["budget"] > 0) & (frame["runtime"] > 0)
    ].copy()
    if len(sample) < 80:
        return {"status": "skipped", "reason": "Not enough complete budget/revenue rows", "rows": len(sample)}
    features, feature_names = build_features(sample, ["budget", "runtime", "release_year"])
    y = np.log1p(sample["revenue"].astype(float).to_numpy())
    x_train, x_test, y_train, y_test = train_test_split(
        features, y, test_size=0.2, random_state=42
    )
    baseline = DummyRegressor(strategy="median").fit(x_train, y_train)
    baseline_pred = np.expm1(baseline.predict(x_test)).clip(0, None)
    search = GridSearchCV(
        RandomForestRegressor(random_state=42, n_jobs=1),
        param_grid={"n_estimators": [80, 140], "max_depth": [12, None], "min_samples_leaf": [2, 4]},
        scoring="neg_mean_absolute_error", cv=3, n_jobs=-1, refit=True,
    )
    search.fit(x_train, y_train)
    predicted = np.expm1(search.best_estimator_.predict(x_test)).clip(0, None)
    actual = np.expm1(y_test).clip(0, None)
    importances = getattr(search.best_estimator_, "feature_importances_", np.zeros(len(feature_names)))
    result = {
        "status": "trained", "rows": len(sample), "train_rows": len(x_train), "test_rows": len(x_test),
        "target": "revenue (trained on log1p revenue; scored in original currency units)",
        "best_params": search.best_params_,
        "baseline": {
            "mae": _clean_metric(mean_absolute_error(actual, baseline_pred)),
            "rmse": _clean_metric(np.sqrt(mean_squared_error(actual, baseline_pred))),
            "r2": _clean_metric(r2_score(actual, baseline_pred)),
        },
        "random_forest": {
            "mae": _clean_metric(mean_absolute_error(actual, predicted)),
            "rmse": _clean_metric(np.sqrt(mean_squared_error(actual, predicted))),
            "r2": _clean_metric(r2_score(actual, predicted)),
            "top_features": [
                {"feature": feature_names[int(i)], "importance": _clean_metric(importances[int(i)])}
                for i in np.argsort(importances)[::-1][:15]
            ],
        },
    }
    try:
        from xgboost import XGBRegressor
        model = XGBRegressor(
            n_estimators=220, max_depth=4, learning_rate=0.05, subsample=0.9,
            colsample_bytree=0.9, reg_lambda=2.0, objective="reg:squarederror",
            random_state=42, n_jobs=2,
        )
        model.fit(x_train, y_train)
        xgb_pred = np.expm1(model.predict(x_test)).clip(0, None)
        result["xgboost"] = {
            "status": "trained",
            "mae": _clean_metric(mean_absolute_error(actual, xgb_pred)),
            "rmse": _clean_metric(np.sqrt(mean_squared_error(actual, xgb_pred))),
            "r2": _clean_metric(r2_score(actual, xgb_pred)),
        }
    except ImportError:
        result["xgboost"] = {"status": "optional dependency not installed"}
    return result


def train_rating_classifier(frame: pd.DataFrame) -> dict[str, Any]:
    sample = frame[frame["vote_average"].between(0.01, 10)].copy()
    sample["high_rated"] = (sample["vote_average"] >= 7.0).astype(int)
    if sample["high_rated"].nunique() < 2 or sample["high_rated"].value_counts().min() < 4:
        return {"status": "skipped", "reason": "Insufficient examples in both rating classes", "rows": len(sample)}
    # vote_average is a label only and is intentionally excluded from predictor columns.
    features, feature_names = build_features(
        sample, ["budget", "runtime", "release_year", "popularity", "vote_count"]
    )
    target = sample["high_rated"].to_numpy()
    x_train, x_test, y_train, y_test = train_test_split(
        features, target, test_size=0.2, random_state=42, stratify=target
    )
    baseline = DummyClassifier(strategy="most_frequent").fit(x_train, y_train)
    search = GridSearchCV(
        RandomForestClassifier(
            random_state=42, class_weight="balanced", n_jobs=1
        ),
        param_grid={"n_estimators": [80, 140], "max_depth": [12, None], "min_samples_leaf": [2, 4]},
        scoring="f1", cv=3, n_jobs=-1, refit=True,
    )
    search.fit(x_train, y_train)
    predicted = search.best_estimator_.predict(x_test)
    probs = search.best_estimator_.predict_proba(x_test)[:, 1]
    result = {
        "status": "trained", "rows": len(sample), "train_rows": len(x_train), "test_rows": len(x_test),
        "target": "high-rated movie (TMDB vote_average >= 7.0)",
        "positive_rate": _clean_metric(float(target.mean())),
        "best_params": search.best_params_,
        "baseline": {"accuracy": _clean_metric(accuracy_score(y_test, baseline.predict(x_test)))},
        "random_forest": {
            "accuracy": _clean_metric(accuracy_score(y_test, predicted)),
            "precision": _clean_metric(precision_score(y_test, predicted, zero_division=0)),
            "recall": _clean_metric(recall_score(y_test, predicted, zero_division=0)),
            "f1": _clean_metric(f1_score(y_test, predicted, zero_division=0)),
            "roc_auc": _clean_metric(roc_auc_score(y_test, probs)),
            "top_features": [
                {"feature": feature_names[int(i)],
                 "importance": _clean_metric(search.best_estimator_.feature_importances_[int(i)])}
                for i in np.argsort(search.best_estimator_.feature_importances_)[::-1][:15]
            ],
        },
    }
    return result


def train_movie_clusters(frame: pd.DataFrame) -> dict[str, Any]:
    sample = frame.copy()
    sample = sample[sample["title"].fillna("").astype(str).str.strip().ne("")]
    if len(sample) < 10:
        return {"status": "skipped", "reason": "Not enough titles", "rows": len(sample)}
    features, feature_names = build_features(
        sample, ["budget", "runtime", "release_year", "popularity", "vote_average", "vote_count"]
    )
    imputed = SimpleImputer(strategy="median").fit_transform(features)
    scaled = StandardScaler().fit_transform(imputed)
    clusters = min(8, max(2, len(sample) // 5))
    estimator = KMeans(n_clusters=clusters, random_state=42, n_init=10)
    labels = estimator.fit_predict(scaled)
    silhouette = None
    if len(sample) > clusters and len(set(labels)) > 1:
        sample_size = min(1000, len(sample))
        silhouette = _clean_metric(silhouette_score(
            scaled, labels, sample_size=sample_size, random_state=42
        ))
    summaries = []
    for cluster_id in sorted(set(labels.tolist())):
        mask = labels == cluster_id
        genre_counts: dict[str, int] = {}
        for genres in sample.loc[mask, "genre_names"]:
            for genre in genres:
                genre_counts[genre] = genre_counts.get(genre, 0) + 1
        summaries.append({
            "cluster": int(cluster_id), "titles": int(mask.sum()),
            "mean_rating": _clean_metric(sample.loc[mask, "vote_average"].mean()),
            "mean_popularity": _clean_metric(sample.loc[mask, "popularity"].mean()),
            "top_genres": [name for name, _ in sorted(genre_counts.items(), key=lambda row: -row[1])[:5]],
        })
    return {
        "status": "trained", "rows": len(sample), "clusters": clusters,
        "silhouette_score": silhouette, "feature_count": len(feature_names), "summaries": summaries,
    }


def log_mlflow(report: dict[str, Any]) -> str | None:
    if os.getenv("CINEPLAY_LOG_MLFLOW", "").lower() not in {"1", "true", "yes"}:
        return None
    try:
        import mlflow
    except ImportError:
        return "MLflow was requested but is not installed."
    mlflow.set_tracking_uri(os.getenv("MLFLOW_TRACKING_URI", "file:./.cache/mlruns"))
    mlflow.set_experiment("cineplay-movie-intelligence")
    with mlflow.start_run(run_name="tabular-movie-models"):
        mlflow.log_params({"dataset": "TMDB-5000", "seed": 42, "rating_threshold": 7.0})
        for task, content in report.items():
            if isinstance(content, dict):
                for model_name, model_metrics in content.items():
                    if isinstance(model_metrics, dict):
                        for metric, value in model_metrics.items():
                            if isinstance(value, (int, float)) and np.isfinite(value):
                                mlflow.log_metric(f"{task}.{model_name}.{metric}", float(value))
    return "tracked"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-path", type=Path)
    parser.add_argument("--source-url", default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()

    start = time.perf_counter()
    frame = load_dataset(args.dataset_path, args.source_url)
    report = {
        "dataset": {
            "name": "TMDB 5000 Movie Dataset",
            "source_url": args.source_url,
            "rows": int(len(frame)),
            "unique_movie_ids": int(frame["id"].nunique()),
            "evaluated_at_utc": pd.Timestamp.utcnow().isoformat(),
            "license_note": "Use according to source and TMDB terms; metadata-only training snapshot.",
        },
        "revenue_regression": train_revenue_model(frame),
        "high_rating_classification": train_rating_classifier(frame),
        "movie_clustering": train_movie_clusters(frame),
    }
    report["mlflow"] = {"status": log_mlflow(report)}
    report["duration_seconds"] = round(time.perf_counter() - start, 2)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
