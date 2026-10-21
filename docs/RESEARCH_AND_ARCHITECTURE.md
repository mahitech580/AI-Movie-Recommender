# CINEPLAY research and system design

## Verified references

- TMDB application authentication: https://developer.themoviedb.org/docs/authentication-application. The importer sends the API Read Access Token in the Authorization Bearer header and never saves it into catalog files.
- TMDB image basics: https://developer.themoviedb.org/docs/image-basics. Image URLs are derived from TMDB image paths and image sizes; the project stores image URLs rather than poster binaries.
- Sentence Transformers semantic search: https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html. The optional path embeds the movie corpus and query in a common vector space before similarity ranking. The core catalog remains searchable without model downloads.
- scikit-learn model selection and evaluation: https://scikit-learn.org/stable/modules/grid_search.html. Hyperparameter search belongs on development folds; a distinct held-out set is needed for final performance estimation.
- GitHub Actions secrets: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets. TMDB and LLM tokens belong in Actions secrets or local environment variables, never in source files.
- FastAPI deployment: https://fastapi.tiangolo.com/deployment/. The Python API is a companion service; GitHub Pages serves the static client only.

## Architecture

The static app remains usable without Python. It serves the curated movie catalog, remote poster/backdrop URLs, browser-local preference learning, and a local text/genre discovery fallback. The companion API adds FastAPI, SQLAlchemy-backed SQLite/PostgreSQL storage, optional MongoDB engagement events, hybrid recommendations, semantic search, catalog analytics, and optional source-grounded LLM generation.

Optional experiments are split into independent requirement files so TensorFlow, OpenCV, sentence-transformer, Chroma, XGBoost, and MLflow dependencies are not required for the lightweight frontend or core API.

## Data provenance and safe claims

- The curated catalog is synchronized from TMDB only after configuring an authorized personal token. Remote artwork remains online and failed images use the site's fallback.
- The predictive-model pipeline caches the public TMDB 5000 metadata CSV under the ignored .cache directory. It does not commit the external source file.
- Poster analysis writes derived numeric features; it does not keep downloaded poster images in the repository.
- RAG source information is constructed from retrieved catalog records. If an LLM key/model is absent or the provider request fails, the endpoint can return a transparent retrieval-only answer.
- Precision@K, Recall@K, NDCG, classification F1, regression error, silhouette scores, and runtime are not resume claims until a run produces a report. State the dataset, split, metric, and sample count.
- AWS/Azure/GCP hosting, PyTorch training, Flask, and MySQL require their own tested implementations before they are represented as completed project features. A package appearing in a requirement file is not proof of a successful model run.

## Reproduction commands

Install the lightweight API/test environment with requirements.txt, then run:

    PYTHONPATH=. pytest -q tests
    python scripts/train_model.py
    python scripts/analyze_catalog.py

Optional experiment commands:

    python -m pip install -r requirements-mlops.txt
    python scripts/train_predictive_models.py
    python -m pip install -r requirements-vision.txt
    python scripts/analyze_poster_art.py --limit 100
    python -m pip install -r requirements-deep-learning.txt
    python scripts/train_deep_genre_model.py --epochs 6

The live TMDB import additionally requires TMDB_BEARER_TOKEN. The LLM answer mode needs OPENAI_API_KEY and OPENAI_MODEL; it has a retrieval-only fallback.
