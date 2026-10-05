# CINEPLAY backend

A real Python API companion for the CINEPLAY GitHub Pages frontend.

## Stack

Python, FastAPI, SQLAlchemy, SQLite by default, optional PostgreSQL/MySQL via DATABASE_URL, optional MongoDB via MONGODB_URI, Pandas, NumPy and scikit-learn.

The ML layer uses TF-IDF, cosine similarity, KNN candidate retrieval, hybrid content ranking and a lightweight collaborative signal from interaction history.

## Run locally

python -m venv .venv
pip install -r requirements.txt
python scripts/train_model.py
uvicorn backend.main:app --reload

API routes:

GET /api/health
GET /api/movies
GET /api/search?q=interstellar
GET /api/recommend/{user_id}
POST /api/events
POST /api/events/bulk
GET /api/profile/{user_id}
GET /docs

## SQL

The default DATABASE_URL is sqlite:///./cineplay.db so the demo starts without another database server.

For a real deployment, set DATABASE_URL to your PostgreSQL or MySQL connection string.

The SQL reference schema is stored at sql/schema.sql.

## MongoDB

Set MONGODB_URI and MONGODB_DATABASE to enable event/analytics logging.

MongoDB is optional. SQL remains the primary relational store for movie records and user interactions.

## GitHub Pages architecture

GitHub Pages hosts the static frontend only. It cannot execute the Python API or host a SQL/MongoDB process.

The repository therefore uses a deliberate dual architecture:

GitHub Pages -> CINEPLAY frontend
Python/FastAPI -> companion API
SQL -> relational movie and interaction data
MongoDB -> event/analytics stream
scikit-learn -> recommendation model

The static site does not depend on the backend to render the core product, so the GitHub Pages deployment remains functional on its own.
