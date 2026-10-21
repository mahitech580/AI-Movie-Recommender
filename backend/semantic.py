"""Semantic title discovery with a lightweight default and optional HF/Chroma backend."""
from __future__ import annotations

import hashlib
import os
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

_tfidf_signature: str | None = None
_tfidf_vectorizer: TfidfVectorizer | None = None
_tfidf_matrix = None
_embedding_signature: str | None = None
_embedding_model = None
_embedding_matrix = None
_chroma_collection = None


def _document(movie: dict[str, Any]) -> str:
    fields = [
        str(movie.get("title", "")),
        str(movie.get("original_title", "")),
        str(movie.get("overview", "")),
        str(movie.get("tagline", "")),
        " ".join(str(x) for x in (movie.get("genres") or [])),
        " ".join(str(x) for x in (movie.get("tags") or [])),
        str(movie.get("language", "")),
    ]
    return " ".join(part for part in fields if part).strip()


def _fingerprint(documents: list[str]) -> str:
    return hashlib.sha256("\n".join(documents).encode("utf-8")).hexdigest()


def _search_tfidf(query: str, movies: list[dict[str, Any]], documents: list[str],
                   limit: int) -> dict[str, Any]:
    global _tfidf_signature, _tfidf_vectorizer, _tfidf_matrix
    signature = _fingerprint(documents)
    if signature != _tfidf_signature or _tfidf_vectorizer is None:
        _tfidf_vectorizer = TfidfVectorizer(
            lowercase=True, stop_words="english", ngram_range=(1, 2), sublinear_tf=True
        )
        _tfidf_matrix = _tfidf_vectorizer.fit_transform(documents)
        _tfidf_signature = signature
    query_vector = _tfidf_vectorizer.transform([query])
    scores = cosine_similarity(query_vector, _tfidf_matrix).ravel()
    order = np.argsort(scores)[::-1]
    results = []
    for index in order:
        score = float(scores[index])
        if score <= 0:
            break
        results.append({"movie": movies[int(index)], "similarity": round(score, 4)})
        if len(results) >= limit:
            break
    return {"method": "tfidf", "results": results}


def _search_transformer(query: str, movies: list[dict[str, Any]],
                        documents: list[str], limit: int) -> dict[str, Any]:
    """Optional sentence-transformer embeddings, with optional persistent Chroma retrieval."""
    global _embedding_signature, _embedding_model, _embedding_matrix, _chroma_collection
    from sentence_transformers import SentenceTransformer

    signature = _fingerprint(documents)
    model_name = os.getenv(
        "CINEPLAY_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
    )
    cache_key = f"{signature}:{model_name}"
    if cache_key != _embedding_signature or _embedding_model is None:
        _embedding_model = SentenceTransformer(model_name)
        _embedding_matrix = _embedding_model.encode(
            documents, normalize_embeddings=True, convert_to_numpy=True,
            show_progress_bar=False,
        ).astype(np.float32)
        _embedding_signature = cache_key
        _chroma_collection = None

    query_vector = _embedding_model.encode(
        [query], normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False
    ).astype(np.float32)

    if os.getenv("CINEPLAY_VECTOR_BACKEND", "memory").lower() == "chroma":
        import chromadb

        client = chromadb.PersistentClient(path=os.getenv("CINEPLAY_CHROMA_PATH", ".cache/chroma"))
        collection_name = f"cineplay_{signature[:18]}"
        if _chroma_collection is None:
            _chroma_collection = client.get_or_create_collection(
                name=collection_name, metadata={"hnsw:space": "cosine"}
            )
            _chroma_collection.upsert(
                ids=[str(movie.get("id", index)) for index, movie in enumerate(movies)],
                documents=documents,
                embeddings=_embedding_matrix.tolist(),
                metadatas=[
                    {"title": str(movie.get("title", "")), "year": str(movie.get("year", ""))}
                    for movie in movies
                ],
            )
        response = _chroma_collection.query(
            query_embeddings=query_vector.tolist(), n_results=min(limit, len(movies))
        )
        index_by_id = {str(movie.get("id", i)): movie for i, movie in enumerate(movies)}
        ids = (response.get("ids") or [[]])[0]
        distances = (response.get("distances") or [[]])[0]
        hits = []
        for movie_id, distance in zip(ids, distances):
            movie = index_by_id.get(str(movie_id))
            if movie is not None:
                hits.append({"movie": movie, "similarity": round(max(-1.0, 1.0-float(distance)), 4)})
        return {"method": "sentence-transformers+chroma", "results": hits}

    scores = (_embedding_matrix @ query_vector[0]).ravel()
    order = np.argsort(scores)[::-1][:limit]
    return {
        "method": "sentence-transformers",
        "results": [
            {"movie": movies[int(index)], "similarity": round(float(scores[index]), 4)}
            for index in order if float(scores[index]) > 0
        ],
    }


def search_catalog(query: str, movies: list[dict[str, Any]], limit: int = 5) -> dict[str, Any]:
    """Search titles by plot/genre/theme, safely falling back when AI extras are absent."""
    query = query.strip()
    if not query or not movies:
        return {"method": "empty", "results": []}
    limit = max(1, min(int(limit), 20))
    documents = [_document(movie) for movie in movies]
    if os.getenv("CINEPLAY_EMBEDDING_PROVIDER", "tfidf").lower() in {"hf", "huggingface", "transformers"}:
        try:
            return _search_transformer(query, movies, documents, limit)
        except (ImportError, OSError, RuntimeError, ValueError):
            # The application remains usable when the model package/model cache is missing.
            pass
    return _search_tfidf(query, movies, documents, limit)
