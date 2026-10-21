"""Create reusable EDA summaries and plots from data/movies.json."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from backend.analytics import build_catalog_analytics

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "movies.json"
OUTPUT_DIR = ROOT / "reports"


def make_plots(frame: pd.DataFrame, analytics: dict, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid", context="notebook")

    genres = analytics["genres"][:15]
    if genres:
        chart = pd.DataFrame(genres).sort_values("count", ascending=True)
        fig, ax = plt.subplots(figsize=(10, 6))
        sns.barplot(data=chart, x="count", y="genre", ax=ax)
        ax.set(title="CINEPLAY catalog: most common genres", xlabel="Title count", ylabel="")
        fig.tight_layout()
        fig.savefig(output_dir / "genre_distribution.png", dpi=160, bbox_inches="tight")
        plt.close(fig)

    ratings = pd.to_numeric(frame.get("rating", pd.Series(dtype=float)), errors="coerce").dropna()
    ratings = ratings[ratings.between(0, 10)]
    if not ratings.empty:
        fig, ax = plt.subplots(figsize=(9, 5))
        sns.histplot(ratings, bins=20, kde=True, ax=ax)
        ax.set(title="Movie rating distribution", xlabel="TMDB rating (0–10)", ylabel="Titles")
        fig.tight_layout()
        fig.savefig(output_dir / "rating_distribution.png", dpi=160, bbox_inches="tight")
        plt.close(fig)

    years = pd.to_numeric(frame.get("year", pd.Series(dtype=float)), errors="coerce")
    years = years[years.between(1870, 2100)].dropna().astype(int)
    if not years.empty:
        yearly = years.value_counts().sort_index().rename_axis("year").reset_index(name="titles")
        fig, ax = plt.subplots(figsize=(11, 5))
        sns.lineplot(data=yearly, x="year", y="titles", ax=ax)
        ax.set(title="Release-year coverage", xlabel="Release year", ylabel="Titles in catalog")
        fig.tight_layout()
        fig.savefig(output_dir / "release_year_trend.png", dpi=160, bbox_inches="tight")
        plt.close(fig)

    popularity = pd.to_numeric(frame.get("popularity", pd.Series(dtype=float)), errors="coerce")
    rating_all = pd.to_numeric(frame.get("rating", pd.Series(dtype=float)), errors="coerce")
    paired = pd.DataFrame({"rating": rating_all, "popularity": popularity}).dropna()
    if len(paired) >= 3:
        fig, ax = plt.subplots(figsize=(8, 5))
        sns.scatterplot(data=paired, x="popularity", y="rating", alpha=0.65, s=35, ax=ax)
        ax.set(title="Popularity versus rating", xlabel="TMDB popularity", ylabel="TMDB rating")
        fig.tight_layout()
        fig.savefig(output_dir / "rating_vs_popularity.png", dpi=160, bbox_inches="tight")
        plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-plots", action="store_true", help="Write tabular artifacts only.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    movies = json.loads(SOURCE.read_text(encoding="utf-8"))
    if not isinstance(movies, list):
        raise ValueError("data/movies.json must contain a JSON array.")
    analytics = build_catalog_analytics(movies)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "catalog_summary.json").write_text(
        json.dumps(analytics, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )

    frame = pd.DataFrame(movies)
    for field in ("genres", "tags"):
        if field in frame:
            frame[field] = frame[field].apply(
                lambda value: " | ".join(value) if isinstance(value, list) else value
            )
    frame.to_csv(args.output_dir / "catalog_features.csv", index=False)
    print(json.dumps({
        "catalog_size": analytics["catalog_size"],
        "quality": analytics["quality"],
        "top_genres": analytics["genres"][:5],
        "report_directory": str(args.output_dir),
    }, indent=2))
    if not args.no_plots:
        make_plots(pd.DataFrame(movies), analytics, args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
