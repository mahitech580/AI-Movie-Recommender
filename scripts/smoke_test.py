from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app

def main() -> None:
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200, health.text
        body = health.json()
        assert body["sql"]["connected"] is True
        assert body["ml"]["ready"] is True

        event = client.post("/api/events", json={
            "user_id": "qa-user",
            "movie_id": 157336,
            "event_type": "open",
            "value": 1.0,
        })
        assert event.status_code == 200, event.text

        recommendation = client.get("/api/recommend/qa-user?limit=6")
        assert recommendation.status_code == 200, recommendation.text
        results = recommendation.json()["results"]
        assert results, "ML recommendation list is empty"
        assert all(item["id"] != 157336 for item in results)

        similar = client.get("/api/similar/157336?limit=4")
        assert similar.status_code == 200, similar.text
        assert similar.json()["results"], "KNN similarity list is empty"

        profile = client.get("/api/profile/qa-user")
        assert profile.status_code == 200, profile.text
        assert profile.json()["events"] >= 1

        if body["mongodb"]["connected"]:
            assert event.json()["stored"]["mongodb"] is True

    print("CINEPLAY full-stack smoke test: PASS")

if __name__ == "__main__":
    main()
