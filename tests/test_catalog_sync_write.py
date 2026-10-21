from __future__ import annotations

import json

from scripts import sync_tmdb_catalog as sync


def test_catalog_write_updates_both_data_sources_and_cache_version(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    index = tmp_path / "index.html"
    index.write_text('<script src="data/movies.js?v=old-version"></script>', encoding="utf-8")
    monkeypatch.setattr(sync, "DATA_DIR", data_dir)
    monkeypatch.setattr(sync, "JSON_PATH", data_dir / "movies.json")
    monkeypatch.setattr(sync, "JS_PATH", data_dir / "movies.js")
    monkeypatch.setattr(sync, "INDEX_PATH", index)

    movies = [{
        "id": 42, "title": "Safe Catalog Fixture", "year": 2024, "genres": ["Mystery"],
        "tags": ["secrets"], "overview": "An isolated town holds a secret.",
        "rating": 7.4, "votes": 150, "popularity": 12.0, "language": "en",
        "poster": "https://image.tmdb.org/t/p/w500/fixture.jpg",
        "backdrop": "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
        "release_date": "2024-01-01",
    }]
    sync.write_catalog(movies)
    parsed = json.loads((data_dir / "movies.json").read_text(encoding="utf-8"))
    script = (data_dir / "movies.js").read_text(encoding="utf-8")
    updated_html = index.read_text(encoding="utf-8")
    assert parsed[0]["id"] == 42
    assert "Safe Catalog Fixture" in script
    assert "data/movies.js?v=catalog-" in updated_html
    assert "old-version" not in updated_html


def test_catalog_validation_blocks_duplicate_ids():
    try:
        sync.validate_catalog([
            {"id": 1, "title": "A", "poster": "https://example.com/a.jpg"},
            {"id": 1, "title": "B", "poster": "https://example.com/b.jpg"},
        ])
    except ValueError as error:
        assert "duplicate" in str(error).lower()
    else:
        raise AssertionError("duplicate IDs should be rejected")
