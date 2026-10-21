from __future__ import annotations

from scripts.sync_tmdb_catalog import merge_catalog, normalize_movie, validate_catalog


def test_tmdb_mapping_includes_metadata_and_online_images():
    raw = {
        "id": 900001, "title": "Cosmic Echo", "release_date": "2025-11-04",
        "genre_ids": [878, 12], "vote_average": 7.8, "vote_count": 1420,
        "popularity": 35.6, "original_language": "en",
        "overview": "An astronaut discovers a mysterious signal beyond a distant galaxy.",
        "poster_path": "/cosmic-poster.jpg", "backdrop_path": "/cosmic-backdrop.jpg",
    }
    movie = normalize_movie(raw, lane="unit-test")
    assert movie is not None
    assert movie["id"] == 900001
    assert movie["year"] == 2025
    assert movie["genres"] == ["Sci-Fi", "Adventure"]
    assert movie["poster"] == "https://image.tmdb.org/t/p/w500/cosmic-poster.jpg"
    assert movie["backdrop"] == "https://image.tmdb.org/t/p/w1280/cosmic-backdrop.jpg"
    assert movie["rating"] == 7.8
    assert movie["tags"]
    assert movie["discovery_lane"] == "unit-test"


def test_normalizer_rejects_records_without_stable_id_or_poster():
    assert normalize_movie({"id": 1, "title": "No poster"}) is None
    assert normalize_movie({"title": "No id", "poster_path": "/poster.jpg"}) is None


def test_merge_refreshes_metadata_and_retains_curated_tags():
    existing = [{
        "id": 10, "title": "Hand-curated title", "year": 2020, "genres": ["Drama"],
        "tags": ["editorial-tag"], "poster": "/old.jpg", "backdrop": "",
        "rating": 6.0, "votes": 10, "popularity": 1.0, "overview": "Local overview",
    }]
    incoming = [
        {"id": 10, "title": "Live title", "year": 2021, "genres": ["Thriller"],
         "tags": ["new-tag"], "poster": "https://image.tmdb.org/t/p/w500/10.jpg",
         "backdrop": "", "rating": 8.2, "votes": 100, "popularity": 9.0,
         "overview": "Live overview", "language": "en", "release_date": "2021-01-01"},
        {"id": 11, "title": "New film", "year": 2024, "genres": ["Comedy"],
         "tags": ["new"], "poster": "https://image.tmdb.org/t/p/w500/11.jpg",
         "backdrop": "", "rating": 7.1, "votes": 50, "popularity": 4.0,
         "overview": "New overview", "language": "hi", "release_date": "2024-01-01"},
    ]
    merged = merge_catalog(existing, incoming, max_movies=100)
    assert [movie["id"] for movie in merged] == [10, 11]
    assert merged[0]["title"] == "Live title"
    assert merged[0]["tags"] == ["editorial-tag"]
    assert merged[0]["poster"] == "https://image.tmdb.org/t/p/w500/10.jpg"
    assert merged[1]["title"] == "New film"
    validate_catalog(merged)


def test_validator_rejects_duplicate_ids():
    movies = [
        {"id": 1, "title": "one", "poster": "https://image.tmdb.org/a.jpg"},
        {"id": 1, "title": "duplicate", "poster": "https://image.tmdb.org/b.jpg"},
    ]
    try:
        validate_catalog(movies)
    except ValueError as exc:
        assert "duplicate" in str(exc).lower()
    else:
        raise AssertionError("Duplicate IDs must be rejected")
