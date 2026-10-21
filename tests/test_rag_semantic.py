from __future__ import annotations

from backend.rag import answer_question
from backend.semantic import search_catalog


MOVIES = [
    {"id": 1, "title": "Interstellar", "year": 2014, "genres": ["Adventure", "Drama", "Sci-Fi"],
     "overview": "Explorers travel through a wormhole in space to save humanity.", "tags": ["space", "time"]},
    {"id": 2, "title": "The Conjuring", "year": 2013, "genres": ["Horror", "Mystery"],
     "overview": "Paranormal investigators help a family terrorized by a dark presence.", "tags": ["ghosts", "supernatural"]},
    {"id": 3, "title": "The Prestige", "year": 2006, "genres": ["Drama", "Mystery", "Thriller"],
     "overview": "Two rival magicians become obsessed with creating the ultimate illusion.", "tags": ["rivalry", "illusion"]},
]


def test_semantic_search_returns_relevant_catalog_source(monkeypatch):
    monkeypatch.setenv("CINEPLAY_EMBEDDING_PROVIDER", "tfidf")
    response = search_catalog("ghosts and supernatural horror", MOVIES, 2)
    assert response["method"] == "tfidf"
    assert response["results"]
    assert response["results"][0]["movie"]["title"] == "The Conjuring"


def test_rag_has_grounded_retrieval_fallback_without_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    monkeypatch.setenv("CINEPLAY_EMBEDDING_PROVIDER", "tfidf")
    response = answer_question("recommend me space exploration movies", MOVIES, 2)
    assert response["mode"] == "retrieval-only"
    assert response["sources"]
    assert "Interstellar" in response["answer"]
