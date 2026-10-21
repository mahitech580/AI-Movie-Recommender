from __future__ import annotations

import json

import pandas as pd

from scripts.train_predictive_models import build_features, load_dataset


def test_tmdb_dataset_preprocessing_and_target_separation(tmp_path):
    rows = []
    for index in range(12):
        rows.append({
            "id": 100 + index,
            "title": f"Sample Movie {index}",
            "genres": json.dumps([{"id": 18, "name": "Drama"}] if index % 2 else [{"id": 878, "name": "Science Fiction"}]),
            "budget": 1_000_000 + index * 50_000,
            "revenue": 2_000_000 + index * 70_000,
            "runtime": 90 + index,
            "vote_average": 5.5 + (index % 5) * 0.7,
            "vote_count": 100 + index * 10,
            "popularity": float(index + 1),
            "release_date": f"201{index % 10}-01-01",
            "original_language": "en" if index % 2 else "hi",
        })
    source = tmp_path / "movies.csv"
    pd.DataFrame(rows).to_csv(source, index=False)

    frame = load_dataset(source)
    assert len(frame) == 12
    assert frame["release_year"].notna().all()
    assert frame["genre_names"].iloc[0] == ["Science Fiction"]
    features, names = build_features(
        frame, ["budget", "runtime", "release_year", "popularity", "vote_count"]
    )
    assert len(features) == len(frame)
    assert any(name.startswith("genre::") for name in names)
    assert any(name.startswith("language::") for name in names)
    assert "vote_average" not in names, "rating target must not leak into the input features"
