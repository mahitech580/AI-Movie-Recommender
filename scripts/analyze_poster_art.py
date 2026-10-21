"""Extract compact OpenCV features from online movie posters and cluster poster styles.

Only derived color/edge descriptors are written; fetched copyrighted poster files are not stored.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
from pathlib import Path
from typing import Any

import cv2
import httpx
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "movies.json"
OUT_CSV = ROOT / "reports" / "poster_visual_features.csv"
OUT_SUMMARY = ROOT / "reports" / "poster_cluster_summary.json"
IMAGE_BASE = "https://image.tmdb.org/t/p/w500"


def poster_url(movie: dict[str, Any]) -> str:
    value = str(movie.get("poster") or "").strip()
    if not value:
        return ""
    if value.startswith(("https://", "http://")):
        return value
    if value.startswith("/"):
        return f"{IMAGE_BASE}{value}"
    return ""


def get_bytes(url: str, timeout: float = 12.0) -> bytes | None:
    try:
        response = httpx.get(
            url, timeout=httpx.Timeout(timeout, connect=min(5.0, timeout)),
            follow_redirects=True, headers={"User-Agent": "CINEPLAY-poster-analysis/1.0"}
        )
        response.raise_for_status()
        if len(response.content) > 8_000_000:
            return None
        return response.content
    except httpx.HTTPError:
        return None


def describe_poster(movie: dict[str, Any]) -> dict[str, Any] | None:
    url = poster_url(movie)
    if not url:
        return None
    raw = get_bytes(url)
    if not raw:
        return None
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        return None
    height, width = image.shape[:2]
    if height < 20 or width < 10:
        return None
    scale = min(1.0, 256.0 / max(height, width))
    if scale < 1:
        image = cv2.resize(image, (max(1, int(width*scale)), max(1, int(height*scale))))
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    histogram = cv2.calcHist([hsv], [0, 1, 2], None, [8, 4, 4], [0, 180, 0, 256, 0, 256])
    histogram = cv2.normalize(histogram, histogram).flatten()
    brightness = float(np.mean(gray) / 255.0)
    contrast = float(np.std(gray) / 255.0)
    saturation = float(np.mean(hsv[:, :, 1]) / 255.0)
    edges = cv2.Canny(gray, 80, 160)
    edge_density = float(np.count_nonzero(edges) / edges.size)
    row = {
        "movie_id": int(movie["id"]),
        "title": str(movie.get("title", "")),
        "year": movie.get("year", "—"),
        "poster_url": url,
        "width": int(width), "height": int(height),
        "aspect_ratio": round(float(width / height), 4),
        "brightness": round(brightness, 5),
        "contrast": round(contrast, 5),
        "saturation": round(saturation, 5),
        "edge_density": round(edge_density, 5),
    }
    row.update({f"hsv_bin_{index:03d}": round(float(value), 6) for index, value in enumerate(histogram)})
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=150)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    if not 1 <= args.limit <= 1000:
        parser.error("--limit must be between 1 and 1000")
    movies = json.loads(CATALOG.read_text(encoding="utf-8"))
    candidates = [movie for movie in movies if poster_url(movie)][:args.limit]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 16))) as pool:
        rows = [result for result in pool.map(describe_poster, candidates) if result]
    if len(rows) < 3:
        raise RuntimeError(f"Only {len(rows)} posters were analyzable; at least 3 are needed.")

    frame = pd.DataFrame(rows)
    feature_columns = [c for c in frame.columns if c.startswith("hsv_bin_")] + [
        "aspect_ratio", "brightness", "contrast", "saturation", "edge_density"
    ]
    features = StandardScaler().fit_transform(frame[feature_columns])
    cluster_count = min(6, max(2, len(frame)//5))
    labels = KMeans(n_clusters=cluster_count, random_state=42, n_init=10).fit_predict(features)
    frame["visual_cluster"] = labels.astype(int)
    silhouette = None
    if len(set(labels)) > 1 and len(frame) > cluster_count:
        silhouette = round(float(silhouette_score(
            features, labels, sample_size=min(500, len(frame)), random_state=42
        )), 4)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    frame.drop(columns=[c for c in frame if c.startswith("hsv_bin_")]).to_csv(OUT_CSV, index=False)
    summary = {
        "method": "OpenCV HSV histogram + brightness/contrast/saturation/edge density + KMeans",
        "posters_requested": len(candidates),
        "posters_analyzed": len(frame),
        "clusters": cluster_count,
        "silhouette_score": silhouette,
        "cluster_summary": [
            {
                "cluster": int(cluster_id),
                "count": int((frame["visual_cluster"] == cluster_id).sum()),
                "titles": frame.loc[frame["visual_cluster"] == cluster_id, "title"].head(8).tolist(),
                "mean_brightness": round(float(frame.loc[frame["visual_cluster"] == cluster_id, "brightness"].mean()), 4),
                "mean_saturation": round(float(frame.loc[frame["visual_cluster"] == cluster_id, "saturation"].mean()), 4),
            }
            for cluster_id in sorted(frame["visual_cluster"].unique().tolist())
        ],
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
