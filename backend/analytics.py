"""Testable Pandas/NumPy analytics shared by the API and report generator."""
from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np
import pandas as pd


def build_catalog_analytics(movies: list[dict[str, Any]]) -> dict[str, Any]:
    """Return JSON-safe descriptive statistics, distributions, and data-quality checks."""
    if not movies:
        return {
            "catalog_size": 0,
            "quality": {"duplicate_ids": 0, "duplicate_titles": 0, "poster_coverage": 0.0},
            "genres": [], "ratings": [], "languages": [],
        }

    frame = pd.DataFrame(movies).copy()
    for column in ("title", "overview", "language", "poster", "backdrop"):
        if column not in frame:
            frame[column] = ""
        frame[column] = frame[column].fillna("").astype(str)
    for column in ("year", "rating", "votes", "popularity"):
        if column not in frame:
            frame[column] = np.nan
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    year = frame["year"].where(frame["year"].between(1870, 2100))
    ratings = frame["rating"].where(frame["rating"].between(0, 10)).dropna()
    popularity = frame["popularity"].where(frame["popularity"] >= 0)
    paired = pd.DataFrame({"rating": frame["rating"], "popularity": popularity}).dropna()
    correlation = None
    if len(paired) >= 3 and paired["rating"].nunique() > 1 and paired["popularity"].nunique() > 1:
        value = float(np.corrcoef(paired["rating"].to_numpy(), paired["popularity"].to_numpy())[0, 1])
        correlation = round(value, 4) if np.isfinite(value) else None

    genre_counts: Counter[str] = Counter()
    for genres in frame.get("genres", pd.Series([[] for _ in range(len(frame))])):
        if isinstance(genres, list):
            genre_counts.update(str(g).strip() for g in genres if str(g).strip())
        elif isinstance(genres, str) and genres.strip():
            genre_counts.update(g.strip() for g in genres.split(",") if g.strip())
    languages = Counter(x.strip().lower() for x in frame["language"].tolist() if x.strip())

    counts, edges = np.histogram(ratings.to_numpy(dtype=float), bins=[0, 2, 4, 6, 8, 10.000001])
    rating_bins = []
    for idx, count in enumerate(counts.tolist()):
        low = int(edges[idx])
        high = 10 if idx == len(counts) - 1 else int(edges[idx + 1])
        rating_bins.append({"range": f"{low}-{high}", "count": int(count)})

    numeric_summary = {}
    for key, values in (
        ("year", year), ("rating", ratings), ("votes", frame["votes"].dropna()),
        ("popularity", popularity.dropna()),
    ):
        values = pd.to_numeric(values, errors="coerce").dropna()
        numeric_summary[key] = {
            "count": int(values.count()),
            "mean": round(float(values.mean()), 3) if not values.empty else None,
            "median": round(float(values.median()), 3) if not values.empty else None,
            "std": round(float(values.std(ddof=0)), 3) if not values.empty else None,
            "min": round(float(values.min()), 3) if not values.empty else None,
            "max": round(float(values.max()), 3) if not values.empty else None,
        }

    duplicate_ids = int(frame["id"].duplicated().sum()) if "id" in frame else 0
    normalized_titles = frame["title"].str.casefold().str.replace(r"\s+", " ", regex=True).str.strip()
    duplicate_titles = int(normalized_titles[normalized_titles.ne("")].duplicated().sum())
    quality = {
        "duplicate_ids": duplicate_ids,
        "duplicate_titles": duplicate_titles,
        "missing_overviews": int(frame["overview"].str.strip().eq("").sum()),
        "missing_posters": int(frame["poster"].str.strip().eq("").sum()),
        "missing_backdrops": int(frame["backdrop"].str.strip().eq("").sum()),
        "poster_coverage": round(float(frame["poster"].str.strip().ne("").mean()), 4),
        "backdrop_coverage": round(float(frame["backdrop"].str.strip().ne("").mean()), 4),
        "overview_coverage": round(float(frame["overview"].str.strip().ne("").mean()), 4),
        "missing_or_invalid_year": int(year.isna().sum()),
        "missing_or_invalid_rating": int((~frame["rating"].between(0, 10)).sum()),
    }
    return {
        "catalog_size": len(frame),
        "numeric_summary": numeric_summary,
        "rating_popularity_correlation": correlation,
        "genres": [{"genre": name, "count": int(n)} for name, n in genre_counts.most_common(20)],
        "ratings": rating_bins,
        "languages": [{"language": name, "count": int(n)} for name, n in languages.most_common(15)],
        "quality": quality,
    }
