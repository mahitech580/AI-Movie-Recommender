# CINEPLAY — AI Movie Discovery Platform

CINEPLAY is an advanced OTT-style movie discovery and recommendation project built by Mahi.

It combines a polished streaming frontend with a real Python ML backend, relational SQL storage, optional MongoDB event analytics, live TMDB data, YouTube trailer discovery, and a static GitHub Pages deployment.

Repository: https://github.com/mahitech580/AI-Movie-Recommender

Expected Pages site:
https://mahitech580.github.io/AI-Movie-Recommender/

## Product direction

The interface is designed from modern OTT interaction patterns:

- large cinematic hero and contextual title information
- personalized rows
- Continue Watching / local activity
- Top 10 discovery
- category and genre hubs
- regional discovery
- mood-driven exploration
- detailed title pages
- trailer discovery
- ratings and review context
- fast search and command navigation
- dense but responsive card rails
- profile/taste signals

The project takes inspiration from streaming-service UX patterns without copying Netflix, JioHotstar, Rotten Tomatoes or YouTube branding, logos, proprietary assets or visual identity.

## Full technology stack

### Frontend

HTML5, modern CSS3, Vanilla JavaScript, browser localStorage, responsive layout, animation, live API integration.

### Python backend

FastAPI + Pydantic + SQLAlchemy.

### SQL

SQLite is the zero-configuration default. PostgreSQL is supported through DATABASE_URL and the Docker Compose development stack.

The SQL layer stores the catalog and user interaction events.

### MongoDB

MongoDB is an optional analytics/event stream configured with MONGODB_URI.

SQL remains the primary durable interaction store; MongoDB is useful for event collection and analytics workflows.

### AI / ML

scikit-learn, Pandas and NumPy.

The recommender combines:

- TF-IDF text features
- cosine similarity
- KNN nearest-neighbor candidate retrieval
- user taste/profile vectors
- genre affinity
- quality confidence
- popularity/trending signal
- freshness
- novelty/exploration
- lightweight item-item collaborative signal
- diversification across dominant genres
- online-style interaction weighting

## Recommendation flow

    Movie metadata
        |
        v
    Pandas dataset preparation
        |
        v
    TF-IDF feature space
        |
        +-------------------------+
        |                         |
        v                         v
    Content similarity       KNN candidates
        |                         |
        +------------+------------+
                     |
                     v
          User interaction profile
                     |
                     +--> genre affinity
                     +--> quality confidence
                     +--> popularity
                     +--> freshness
                     +--> novelty
                     +--> collaborative signal
                     |
                     v
              Hybrid ranking
                     |
                     v
                CINEPLAY queue

The Python API exposes both personalized recommendations and title-to-title similarity.

## Live data

CINEPLAY supports optional live TMDB synchronization directly from the browser.

Live shelves include:

- Trending
- Popular in India
- Top rated
- Now playing
- Upcoming
- Indian-origin discovery
- Search

The title modal can also request:

- India-region watch providers
- TMDB review context
- YouTube trailer/video information

When the external API is unavailable, the bundled catalog and local recommender continue to work.

## Artwork reliability

Remote movie artwork can disappear or return an invalid path over time. CINEPLAY therefore uses:

1. TMDB poster/backdrop URL resolution.
2. Browser image error detection.
3. A generated CINEPLAY fallback poster instead of a broken image icon.
4. A fallback cinematic backdrop for failed hero/modal images.

This keeps the interface visually complete even when a remote asset is unavailable.

## Python API

Start locally:

    python -m venv .venv
    pip install -r requirements.txt
    python scripts/train_model.py
    uvicorn backend.main:app --reload

Useful endpoints:

    GET  /api/health
    GET  /api/movies
    GET  /api/search?q=interstellar
    GET  /api/recommend/{user_id}
    GET  /api/similar/{movie_id}
    GET  /api/profile/{user_id}
    POST /api/events
    POST /api/events/bulk
    GET  /docs

## SQL + MongoDB development stack

Docker Compose can start:

    CINEPLAY API
        |
        +--> PostgreSQL
        +--> MongoDB

Run:

    docker compose up --build

The normal GitHub Pages frontend does not require Docker or the Python service.

## GitHub Pages constraint

GitHub Pages is a static host.

It can serve:

- HTML
- CSS
- JavaScript
- JSON
- images
- other static assets

It cannot execute:

- Flask/FastAPI
- Python
- SQL database processes
- MongoDB

Therefore CINEPLAY intentionally separates the product into two layers:

    GitHub Pages
        |
        +--> static CINEPLAY frontend
        +--> local browser recommendation fallback
        +--> optional direct TMDB integration

    Companion backend
        |
        +--> Python/FastAPI
        +--> SQL
        +--> MongoDB
        +--> scikit-learn ML

The frontend remains functional without the companion backend. When a backend URL is configured inside CINEPLAY, the UI can request Python-generated recommendations and send interaction events to that API.

This is the only architecture in the project that preserves your GitHub Pages requirement without pretending GitHub Pages can run a server.

## GitHub Pages deployment

The repository contains a Pages workflow at:

    .github/workflows/pages.yml

The workflow:

1. installs Python dependencies
2. compiles Python files
3. trains the model artifact
4. checks JavaScript syntax
5. validates static assets
6. publishes the repository root to GitHub Pages

GitHub Pages must be enabled for the repository with the Pages source configured for the Actions deployment flow.

## Project structure

    AI-Movie-Recommender/
    ├── index.html
    ├── manifest.webmanifest
    ├── Dockerfile
    ├── docker-compose.yml
    ├── requirements.txt
    ├── .env.example
    ├── .nojekyll
    ├── README.md
    ├── data/
    │   ├── movies.js
    │   └── movies.json
    ├── sql/
    │   └── schema.sql
    ├── backend/
    │   ├── __init__.py
    │   ├── config.py
    │   ├── db.py
    │   ├── mongo.py
    │   ├── recommender.py
    │   ├── main.py
    │   └── README.md
    ├── scripts/
    │   └── train_model.py
    └── assets/
        ├── app.js
        ├── styles.css
        └── cineplay-icon.svg

## Local personalization

The static frontend stores:

- generated anonymous browser profile ID
- My List
- activity/history
- taste signals
- adaptive model weights
- cached TMDB responses
- optional TMDB API credential
- optional Python backend URL

No private backend credential is committed to the repository.

## QA

The repository includes automated checks for:

- Python syntax
- JavaScript syntax
- model training
- required static files
- Pages deployment

Local frontend parsing and repository asset contract checks were also performed during this rebuild.

## Third-party services

TMDB is used for optional live movie metadata, artwork, regional discovery, title videos, reviews and watch-provider data.

Watch-provider availability is supplied through TMDB's JustWatch-powered provider data and the UI includes the required JustWatch attribution.

YouTube is used for trailer/video discovery.

Rotten Tomatoes is used only as a user-facing external critics/reviews destination from the title experience; CINEPLAY does not claim to reproduce Rotten Tomatoes scores or review data.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Author

Mahi / Mahendra Sai Kondaveeti

GitHub: https://github.com/mahitech580
