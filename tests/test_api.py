import os
import pytest

# Keep tests lightweight: API behavior is tested with a small fake recommender.
os.environ.setdefault("FLASK_ENV", "testing")

from app import app


class FakeRecommender:
    def search(self, q):
        return [{"movieId": 1, "title": "Toy Story (1995)", "genres": "Animation|Children|Comedy", "avg_rating": 3.9, "rating_count": 100, "similarity": 0}]

    def recommend(self, title):
        source = {"movieId": 1, "title": title, "genres": "Comedy", "avg_rating": 4.0, "rating_count": 100, "similarity": 0}
        return source, [source.copy()]


def client_with_fake(monkeypatch):
    import app as app_module
    monkeypatch.setattr(app_module, "recommender", FakeRecommender())
    return app.test_client()


def test_home():
    with app.test_client() as client:
        assert client.get("/").status_code == 200


def test_health():
    with app.test_client() as client:
        data = client.get("/api/health").get_json()
        assert data["success"] is True


def test_search(monkeypatch):
    client = client_with_fake(monkeypatch)
    data = client.get("/api/search?q=Toy").get_json()
    assert data["success"] is True
    assert data["results"]


def test_recommend(monkeypatch):
    client = client_with_fake(monkeypatch)
    response = client.post("/api/recommend", json={"title": "Toy Story (1995)"})
    assert response.status_code == 200
    assert response.get_json()["recommendations"]
