"""Sync CINEPLAY's static/API catalog from live TMDB movie feeds.

Requires TMDB_BEARER_TOKEN in the environment. Credentials are never saved to files.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
JSON_PATH = DATA_DIR / "movies.json"
JS_PATH = DATA_DIR / "movies.js"
API_BASE = "https://api.themoviedb.org/3"
IMAGE_BASE = "https://image.tmdb.org/t/p"
GENRES = {
    12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama",
    27: "Horror", 28: "Action", 35: "Comedy", 36: "History",
    37: "Western", 53: "Thriller", 80: "Crime", 99: "Documentary",
    878: "Sci-Fi", 9648: "Mystery", 10402: "Music", 10749: "Romance",
    10751: "Family", 10752: "War", 10770: "TV Movie",
}
STOP_WORDS = set(
    "about after again against all also among and any are around because been before "
    "being between both but came can could did does each from had has have here how "
    "into its just more most much must near only other our out over said same should "
    "some such than that the their them then there these they this those through too "
    "under until very was were what when where which while who will with would your "
    "film movie story follows finds year years".split()
)
FEEDS = [
    ("/trending/movie/week", "trending", {}),
    ("/movie/popular", "popular-india", {"region": "IN"}),
    ("/movie/top_rated", "top-rated", {"region": "IN"}),
    ("/movie/now_playing", "now-playing-india", {"region": "IN"}),
    ("/movie/upcoming", "upcoming-india", {"region": "IN"}),
    ("/discover/movie", "indian-origin", {
        "sort_by": "popularity.desc", "with_origin_country": "IN", "region": "IN"
    }),
]


def image_url(path: Any, size: str) -> str:
    if not path:
        return ""
    value = str(path).strip()
    if value.startswith(("https://", "http://")):
        return value
    return f"{IMAGE_BASE}/{size}/" + value.lstrip("/")


def derive_tags(title: str, overview: str, genres: list[str]) -> list[str]:
    """Small deterministic text-feature step; no extra NLP model or credentials."""
    words = re.findall(r"[a-z][a-z0-9'-]{2,}", f"{title} {overview}".lower())
    ranked = [word for word, _ in Counter(words).most_common(30)
              if word not in STOP_WORDS and not word.isdigit()]
    tags: list[str] = []
    for value in [*genres, *ranked]:
        normalized = re.sub(r"\s+", " ", str(value)).strip().lower()
        if normalized and normalized not in tags:
            tags.append(normalized)
        if len(tags) == 12:
            break
    return tags


def normalize_movie(row: dict[str, Any], lane: str = "tmdb") -> dict[str, Any] | None:
    """Normalize one TMDB list response, including remotely hosted movie artwork."""
    try:
        movie_id = int(row.get("id"))
    except (TypeError, ValueError):
        return None
    title = str(row.get("title") or row.get("original_title") or "").strip()
    poster = image_url(row.get("poster_path"), "w500")
    if not title or not poster:
        return None

    release_date = str(row.get("release_date") or "")
    year = release_date[:4] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", release_date) else "—"
    genres = [
        GENRES[int(genre_id)]
        for genre_id in (row.get("genre_ids") or [])
        if str(genre_id).isdigit() and int(genre_id) in GENRES
    ]
    overview = str(row.get("overview") or "").strip()
    return {
        "id": movie_id,
        "title": title,
        "year": int(year) if year.isdigit() else "—",
        "genres": genres,
        "rating": round(max(0.0, min(10.0, float(row.get("vote_average") or 0))), 2),
        "votes": max(0, int(row.get("vote_count") or 0)),
        "popularity": round(max(0.0, float(row.get("popularity") or 0)), 4),
        "language": str(row.get("original_language") or "und"),
        "overview": overview,
        "tags": derive_tags(title, overview, genres),
        "poster": poster,
        "backdrop": image_url(row.get("backdrop_path"), "w1280"),
        "release_date": release_date,
        "poster_source": "TMDB image CDN",
        "catalog_source": "TMDB API v3",
        "discovery_lane": lane,
        "tmdb_url": f"https://www.themoviedb.org/movie/{movie_id}",
    }


def normalize_existing(movie: dict[str, Any]) -> dict[str, Any]:
    item = deepcopy(movie)
    item["id"] = int(item["id"])
    item["poster"] = image_url(item.get("poster"), "w500")
    item["backdrop"] = image_url(item.get("backdrop"), "w1280")
    for key, default in (
        ("genres", []), ("tags", []), ("overview", ""), ("language", "und"),
        ("votes", 0), ("popularity", 0), ("rating", 0), ("release_date", ""),
    ):
        item.setdefault(key, default)
    return item


def merge_catalog(existing: list[dict[str, Any]], incoming: list[dict[str, Any]],
                  max_movies: int = 1200) -> list[dict[str, Any]]:
    """Retain curated order/tags and refresh metadata; append new movies by popularity."""
    current = [normalize_existing(item) for item in existing]
    by_id = {int(item["id"]): item for item in current}
    dynamic = (
        "title", "year", "genres", "rating", "votes", "popularity", "language",
        "overview", "poster", "backdrop", "release_date", "poster_source",
        "catalog_source", "discovery_lane", "tmdb_url",
    )
    for remote in sorted(incoming, key=lambda item: float(item.get("popularity") or 0), reverse=True):
        movie_id = int(remote["id"])
        if movie_id in by_id:
            target = by_id[movie_id]
            for key in dynamic:
                value = remote.get(key)
                if value not in (None, "", []):
                    target[key] = value
            if not target.get("tags"):
                target["tags"] = remote.get("tags", [])
        elif len(by_id) < max(max_movies, len(current)):
            item = normalize_existing(remote)
            by_id[movie_id] = item
            current.append(item)
    return current


def validate_catalog(movies: list[dict[str, Any]]) -> None:
    if not movies:
        raise ValueError("Refusing to write an empty catalog.")
    ids = [int(item["id"]) for item in movies]
    if len(ids) != len(set(ids)):
        raise ValueError("Catalog contains duplicate movie IDs.")
    if any(not str(item.get("title") or "").strip() for item in movies):
        raise ValueError("Every catalog record must have a title.")
    if any(item.get("poster") and not str(item["poster"]).startswith(("http://", "https://"))
           for item in movies):
        raise ValueError("Poster URLs must be absolute URLs after normalization.")


def fetch_page(client: httpx.Client, endpoint: str, params: dict[str, Any],
               retries: int = 4) -> dict[str, Any]:
    """Retry transient network errors and API throttling, without logging request headers."""
    for attempt in range(retries):
        try:
            response = client.get(f"{API_BASE}{endpoint}", params=params)
            if response.status_code == 429 or response.status_code >= 500:
                if attempt + 1 == retries:
                    response.raise_for_status()
                try:
                    delay = min(30.0, max(1.0, float(response.headers.get("Retry-After", ""))))
                except ValueError:
                    delay = min(12.0, 1.5 ** attempt)
                time.sleep(delay)
                continue
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
                raise ValueError(f"Unexpected TMDB response for {endpoint}")
            return payload
        except (httpx.TimeoutException, httpx.NetworkError):
            if attempt + 1 == retries:
                raise
            time.sleep(min(12.0, 1.5 ** attempt))
    raise RuntimeError(f"TMDB request failed: {endpoint}")


def collect_movies(token: str, pages: int) -> list[dict[str, Any]]:
    headers = {
        "Authorization": f"Bearer {token}",
        "accept": "application/json",
        "User-Agent": "CINEPLAY-catalog-sync/1.0",
    }
    found: dict[int, dict[str, Any]] = {}
    failures: list[str] = []
    with httpx.Client(headers=headers, timeout=25.0, follow_redirects=True) as client:
        for endpoint, lane, base_params in FEEDS:
            for page in range(1, pages + 1):
                params = {
                    "language": "en-US", "include_adult": "false", "page": page, **base_params
                }
                try:
                    payload = fetch_page(client, endpoint, params)
                except Exception as exc:
                    failures.append(f"{lane} page {page}: {type(exc).__name__}")
                    print(f"Warning: {failures[-1]}", file=sys.stderr)
                    break
                for raw in payload["results"]:
                    item = normalize_movie(raw, lane=lane)
                    if item:
                        movie_id = int(item["id"])
                        old = found.get(movie_id)
                        if old is None or item["popularity"] > old["popularity"]:
                            found[movie_id] = item
    if len(found) < 20:
        raise RuntimeError(
            f"Only {len(found)} usable TMDB movies were retrieved; refusing to overwrite the catalog."
        )
    if failures:
        print(f"Completed with {len(failures)} partial feed failure(s).", file=sys.stderr)
    return sorted(found.values(), key=lambda item: item["popularity"], reverse=True)


def atomic_write(path: Path, content: str) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def write_catalog(movies: list[dict[str, Any]]) -> None:
    validate_catalog(movies)
    serialized = json.dumps(movies, ensure_ascii=False, indent=2) + "\n"
    js = "// Generated by scripts/sync_tmdb_catalog.py; do not edit by hand.\n"
    js += "window.MOVIES = " + json.dumps(movies, ensure_ascii=False, indent=2) + ";\n"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    atomic_write(JSON_PATH, serialized)
    atomic_write(JS_PATH, js)

    # Ensure browsers fetch the refreshed catalog instead of a cached movies.js.
    # The app bundle itself is unchanged by a catalog-only refresh.
    if INDEX_PATH.exists():
        html = INDEX_PATH.read_text(encoding="utf-8")
        cache_version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        updated_html, replacements = re.subn(
            r'data/movies\\.js\\?v=[^"\\']+',
            f'data/movies.js?v=catalog-{cache_version}',
            html,
            count=1,
        )
        if replacements:
            atomic_write(INDEX_PATH, updated_html)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pages", type=int, default=int(os.getenv("TMDB_SYNC_PAGES", "3")))
    parser.add_argument("--max-movies", type=int, default=int(os.getenv("TMDB_MAX_MOVIES", "1200")))
    args = parser.parse_args()
    if not 1 <= args.pages <= 10:
        parser.error("--pages must be between 1 and 10")
    if not 100 <= args.max_movies <= 5000:
        parser.error("--max-movies must be between 100 and 5000")
    token = os.getenv("TMDB_BEARER_TOKEN", "").strip()
    if not token:
        print(
            "TMDB_BEARER_TOKEN is required. Create a TMDB Read Access Token and export it "
            "as an environment variable; do not paste it into source code.",
            file=sys.stderr,
        )
        return 2

    existing = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    incoming = collect_movies(token, args.pages)
    merged = merge_catalog(existing, incoming, args.max_movies)
    validate_catalog(merged)
    write_catalog(merged)
    new_ids = {int(m["id"]) for m in incoming} - {int(m["id"]) for m in existing}
    print(json.dumps({
        "status": "ok",
        "source": "TMDB API v3",
        "synced_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "existing_catalog": len(existing),
        "remote_unique": len(incoming),
        "new_movies_added": len(new_ids),
        "final_catalog": len(merged),
        "poster_coverage": round(sum(bool(m.get("poster")) for m in merged) / len(merged), 4),
        "backdrop_coverage": round(sum(bool(m.get("backdrop")) for m in merged) / len(merged), 4),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
