# CINEPLAY resume playbook

## Recommended project name
CINEPLAY — AI-Powered Movie Discovery and Recommendation Platform

## Project bullets (use model results only after running the experiments)
- Built a cinematic movie-discovery product with a hybrid recommender combining TF-IDF, cosine similarity, KNN retrieval, user-taste signals, genre affinity, rating confidence, freshness, popularity, novelty, and lightweight interaction-based collaborative signals.
- Developed a FastAPI and SQLAlchemy backend with SQLite/PostgreSQL support, optional MongoDB event analytics, catalog-quality/EDA endpoints, semantic search, and source-grounded movie Q&A with retrieval-only fallback.
- Created repeatable movie-data ingestion, feature cleaning and engineering, EDA visualizations, tabular regression/classification/clustering experiments, OpenCV poster feature extraction, and an optional CNN/BiLSTM multi-label genre classifier.
- Added automated tests and GitHub Actions workflows; containerized the companion API using Docker Compose while keeping the GitHub Pages product static-first and functional when the backend is unavailable.

## Keep claims measurable and accurate
- Never write invented model-accuracy or recommendation-percentage values. Use generated JSON reports and name the data split and sample size.
- Sentence embeddings, Chroma, LLM generation, XGBoost, OpenCV, TensorFlow, and MLflow require their optional dependencies/configuration and a successful run before claiming operational deployment.
- Live TMDB import requires an authorized TMDB_BEARER_TOKEN secret; do not commit the token.
- GitHub Pages does not execute the Python API, SQL database, or MongoDB service.
- Do not claim AWS, Azure, Google Cloud, PyTorch, Flask, MySQL, or a model family that this project has not actually built, run, and verified.
