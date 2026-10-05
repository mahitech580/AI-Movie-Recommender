from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from backend.config import settings, cors_list
from backend.db import SessionLocal, Interaction, MovieRecord, get_db, init_db, seed_movies
from backend.mongo import log_event, mongo_status
from backend.recommender import HybridRecommender

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "movies.json"

app = FastAPI(title=settings.app_name, version="1.0.0", docs_url="/docs", redoc_url="/redoc")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_list() or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MOVIES: list[dict[str, Any]] = []
MODEL: HybridRecommender | None = None

class InteractionIn(BaseModel):
    user_id: str = Field(min_length=2, max_length=180)
    movie_id: int
    event_type: str = Field(pattern="^(open|search|list|similar|play|mood)$")
    value: float = Field(default=1.0, ge=0, le=5)

class BulkEventIn(BaseModel):
    events: list[InteractionIn] = Field(min_length=1, max_length=100)

def load_catalog() -> list[dict[str, Any]]:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))

@app.on_event("startup")
def startup() -> None:
    global MOVIES, MODEL
    MOVIES = load_catalog()
    init_db()
    with SessionLocal() as db:
        seed_movies(db, MOVIES)
    MODEL = HybridRecommender(MOVIES)

@app.get("/")
def root():
    return {"name": settings.app_name, "status": "online", "docs": "/docs"}

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    try:
        movie_count = db.execute(select(func.count(MovieRecord.id))).scalar_one()
        event_count = db.execute(select(func.count(Interaction.id))).scalar_one()
        sql = {
            "connected": True,
            "engine": settings.database_url.split(":", 1)[0],
            "movies": movie_count,
            "events": event_count,
        }
    except Exception as exc:
        sql = {"connected": False, "engine": "unknown", "error": str(exc)}

    return {
        "status": "ok" if MODEL is not None and sql["connected"] else "degraded",
        "sql": sql,
        "mongodb": mongo_status(),
        "ml": {
            "ready": MODEL is not None,
            "algorithm": "TF-IDF + KNN + hybrid content/collaborative ranking",
            "catalog_size": len(MOVIES),
        },
    }

@app.get("/api/movies")
def get_movies(limit: int = Query(40, ge=1, le=200)):
    return {"results": MOVIES[:limit], "total": len(MOVIES)}

@app.get("/api/search")
def search(q: str = Query(min_length=1), limit: int = Query(20, ge=1, le=50)):
    query = q.strip().lower()
    hits = []
    for movie in MOVIES:
        haystack = " ".join([
            movie.get("title", ""),
            " ".join(movie.get("genres", [])),
            " ".join(movie.get("tags", [])),
            movie.get("overview", ""),
        ]).lower()
        if query in haystack:
            hits.append(movie)
    return {"results": hits[:limit], "total": len(hits)}

def interaction_dict(row: Interaction) -> dict[str, Any]:
    return {
        "user_id": row.user_id,
        "movie_id": row.movie_id,
        "event_type": row.event_type,
        "value": row.value,
    }

@app.get("/api/recommend/{user_id}")
def recommend(
    user_id: str,
    seed_movie_id: int | None = None,
    limit: int = Query(12, ge=1, le=40),
    db: Session = Depends(get_db),
):
    if MODEL is None:
        raise HTTPException(status_code=503, detail="ML model is not ready")

    rows = db.query(Interaction).order_by(Interaction.created_at.asc()).all()
    events = [interaction_dict(row) for row in rows]

    return {
        "user_id": user_id,
        "model": "hybrid-tfidf-knn-collaborative",
        "results": MODEL.recommend(user_id, events, seed_movie_id, limit),
    }

@app.post("/api/events")
def create_event(payload: InteractionIn, db: Session = Depends(get_db)):
    exists = next((m for m in MOVIES if int(m["id"]) == payload.movie_id), None)
    if exists is None:
        raise HTTPException(status_code=404, detail="Movie not found in catalog")

    row = Interaction(
        user_id=payload.user_id,
        movie_id=payload.movie_id,
        event_type=payload.event_type,
        value=payload.value,
    )
    db.add(row)
    db.commit()

    mongo_ok = log_event(payload.model_dump())
    return {
        "ok": True,
        "stored": {"sql": True, "mongodb": mongo_ok},
        "event": interaction_dict(row),
    }

@app.post("/api/events/bulk")
def create_bulk_events(payload: BulkEventIn, db: Session = Depends(get_db)):
    rows = []
    for event in payload.events:
        if not any(int(m["id"]) == event.movie_id for m in MOVIES):
            continue
        rows.append(Interaction(
            user_id=event.user_id,
            movie_id=event.movie_id,
            event_type=event.event_type,
            value=event.value,
        ))
    if rows:
        db.add_all(rows)
        db.commit()
        for row in rows:
            log_event(interaction_dict(row))
    return {"ok": True, "stored": len(rows)}

@app.get("/api/profile/{user_id}")
def profile(user_id: str, db: Session = Depends(get_db)):
    rows = db.query(Interaction).filter(Interaction.user_id == user_id).all()
    if not rows:
        return {"user_id": user_id, "events": 0, "top_genres": []}

    counts: dict[str, float] = {}
    by_movie = {int(m["id"]): m for m in MOVIES}
    for row in rows:
        movie = by_movie.get(row.movie_id)
        if not movie:
            continue
        weight = float(row.value or 1.0)
        for genre in movie.get("genres", []):
            counts[genre] = counts.get(genre, 0.0) + weight

    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:8]
    return {"user_id": user_id, "events": len(rows), "top_genres": [{"genre": k, "weight": round(v, 2)} for k, v in top]}
