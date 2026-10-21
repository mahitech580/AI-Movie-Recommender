from __future__ import annotations

from backend.analytics import build_catalog_analytics


def test_catalog_analytics_report_quality_and_distribution():
    movies = [
        {"id": 1, "title": "A", "year": 2020, "rating": 8.0, "votes": 100,
         "popularity": 20.0, "language": "en", "genres": ["Drama", "Mystery"],
         "overview": "A story", "poster": "https://images.example/a.jpg", "backdrop": ""},
        {"id": 2, "title": "B", "year": 2010, "rating": 6.0, "votes": 10,
         "popularity": 5.0, "language": "hi", "genres": ["Drama"],
         "overview": "", "poster": "", "backdrop": ""},
        {"id": 3, "title": "b", "year": "—", "rating": "invalid", "votes": 0,
         "popularity": 0, "language": "hi", "genres": ["Comedy"],
         "overview": "Another story", "poster": "https://images.example/c.jpg", "backdrop": ""},
    ]
    result = build_catalog_analytics(movies)
    assert result["catalog_size"] == 3
    assert result["genres"][0] == {"genre": "Drama", "count": 2}
    assert result["quality"]["missing_overviews"] == 1
    assert result["quality"]["missing_posters"] == 1
    assert result["quality"]["duplicate_titles"] == 1
    assert result["quality"]["poster_coverage"] == 0.6667
    assert result["rating_popularity_correlation"] is None


def test_empty_catalog_does_not_crash():
    result = build_catalog_analytics([])
    assert result["catalog_size"] == 0
    assert result["genres"] == []
