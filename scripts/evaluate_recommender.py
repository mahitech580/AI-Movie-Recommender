"""Evaluate top-N ranking against a temporal holdout of real interaction events.

CSV columns: user_id,movie_id,event_type,value,created_at. For meaningful metrics,
export real consented events. This script never invents an evaluation score.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import pandas as pd

from backend.recommender import HybridRecommender

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "data" / "interactions.csv"
DEFAULT_OUTPUT = ROOT / "reports" / "recommender_evaluation.json"
RELEVANT_EVENTS = {"play", "list"}


def precision_at_k(ranked: list[int], relevant: set[int], k: int) -> float:
    if k <= 0:
        raise ValueError("k must be positive")
    return sum(movie_id in relevant for movie_id in ranked[:k]) / k


def recall_at_k(ranked: list[int], relevant: set[int], k: int) -> float:
    if k <= 0:
        raise ValueError("k must be positive")
    return sum(movie_id in relevant for movie_id in ranked[:k]) / len(relevant) if relevant else 0.0


def dcg_at_k(ranked: list[int], relevant: set[int], k: int) -> float:
    return sum(
        1.0 / math.log2(rank + 1)
        for rank, movie_id in enumerate(ranked[:k], start=1)
        if movie_id in relevant
    )


def ndcg_at_k(ranked: list[int], relevant: set[int], k: int) -> float:
    if not relevant:
        return 0.0
    ideal_dcg = sum(1.0 / math.log2(rank + 1) for rank in range(1, min(len(relevant), k) + 1))
    return dcg_at_k(ranked, relevant, k) / ideal_dcg if ideal_dcg else 0.0


def load_events(path: Path) -> list[dict[str, Any]]:
    frame = pd.read_csv(path)
    required = {"user_id", "movie_id", "event_type"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Interaction CSV is missing columns: {', '.join(sorted(missing))}")
    if "value" not in frame:
        frame["value"] = 1.0
    if "created_at" not in frame:
        frame["created_at"] = [str(index).zfill(12) for index in range(len(frame))]
    frame = frame.dropna(subset=["user_id", "movie_id", "event_type"])
    events = []
    for _, row in frame.iterrows():
        try:
            movie_id = int(row["movie_id"])
            value = float(row["value"]) if pd.notna(row["value"]) else 1.0
        except (TypeError, ValueError):
            continue
        event_type = str(row["event_type"]).strip().lower()
        if event_type not in {"open", "search", "list", "similar", "play", "mood"}:
            continue
        events.append({
            "user_id": str(row["user_id"]), "movie_id": movie_id,
            "event_type": event_type, "value": max(0.0, min(5.0, value)),
            "created_at": str(row["created_at"]),
        })
    return events


def evaluate(movies: list[dict[str, Any]], events: list[dict[str, Any]], k: int = 10) -> dict[str, Any]:
    if k <= 0:
        raise ValueError("k must be positive")
    known_ids = {int(movie["id"]) for movie in movies}
    events = [event for event in events if int(event["movie_id"]) in known_ids]
    by_user: dict[str, list[dict[str, Any]]] = {}
    for event in events:
        by_user.setdefault(str(event["user_id"]), []).append(event)

    training: list[dict[str, Any]] = []
    testing: dict[str, list[dict[str, Any]]] = {}
    for user_id, rows in by_user.items():
        rows.sort(key=lambda event: event["created_at"])
        if len(rows) < 3:
            training.extend(rows)
            continue
        holdout_size = min(len(rows) - 2, max(1, math.ceil(len(rows) * 0.2)))
        training.extend(rows[:-holdout_size])
        testing[user_id] = rows[-holdout_size:]

    model = HybridRecommender(movies)
    precision_values, recall_values, ndcg_values, hit_values = [], [], [], []
    exposed: set[int] = set()
    evaluated = 0
    for user_id, held_out in testing.items():
        relevant = {
            int(event["movie_id"]) for event in held_out
            if event["event_type"] in RELEVANT_EVENTS and float(event.get("value", 1)) > 0
        }
        if not relevant:
            continue
        ranked = model.recommend(user_id, training, None, k)
        ranked_ids = [int(movie["id"]) for movie in ranked]
        exposed.update(ranked_ids)
        precision_values.append(precision_at_k(ranked_ids, relevant, k))
        recall_values.append(recall_at_k(ranked_ids, relevant, k))
        ndcg_values.append(ndcg_at_k(ranked_ids, relevant, k))
        hit_values.append(float(bool(set(ranked_ids) & relevant)))
        evaluated += 1

    def mean(values: list[float]) -> float | None:
        return round(sum(values) / len(values), 4) if values else None

    return {
        "evaluation_method": "temporal per-user holdout; play/list events count as relevant",
        "k": k,
        "users_with_events": len(by_user),
        "users_evaluated": evaluated,
        "events_used": len(events),
        "precision_at_k": mean(precision_values),
        "recall_at_k": mean(recall_values),
        "ndcg_at_k": mean(ndcg_values),
        "hit_rate_at_k": mean(hit_values),
        "catalog_coverage": round(len(exposed) / len(known_ids), 4) if known_ids else 0.0,
        "unique_titles_recommended": len(exposed),
        "catalog_size": len(known_ids),
        "note": "Metrics are meaningful only with real interaction data and enough history per profile.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interactions", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--k", type=int, default=10)
    args = parser.parse_args()
    if not args.interactions.exists():
        parser.error(
            f"{args.interactions} not found. Export authorized interactions with user_id, movie_id, "
            "event_type, value, created_at. Do not commit private user data."
        )
    movies = json.loads((ROOT / "data" / "movies.json").read_text(encoding="utf-8"))
    metrics = evaluate(movies, load_events(args.interactions), args.k)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
