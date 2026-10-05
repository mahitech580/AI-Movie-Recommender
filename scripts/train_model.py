"""Train/export the CINEPLAY content model from the bundled catalog."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "movies.json"
OUT = ROOT / "data" / "model_artifact.json"

def main() -> None:
    movies = json.loads(DATA.read_text(encoding="utf-8"))
    frame = pd.DataFrame(movies)
    frame["genres_text"] = frame["genres"].apply(lambda x: " ".join(x or []))
    frame["tags_text"] = frame["tags"].apply(lambda x: " ".join(x or []))
    frame["document"] = (
        frame["title"].fillna("") + " " +
        frame["genres_text"] + " " +
        frame["tags_text"] + " " +
        frame["overview"].fillna("") + " " +
        frame["language"].fillna("")
    )
    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        sublinear_tf=True
    )
    matrix = vectorizer.fit_transform(frame["document"])
    artifact = {
        "algorithm": "TF-IDF",
        "ngram_range": [1, 2],
        "catalog_size": int(len(frame)),
        "feature_count": int(len(vectorizer.get_feature_names_out())),
        "features_sample": vectorizer.get_feature_names_out()[:80].tolist(),
        "density": float(matrix.nnz / max(1, matrix.shape[0] * matrix.shape[1])),
    }
    OUT.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    print(json.dumps(artifact, indent=2))

if __name__ == "__main__":
    main()
