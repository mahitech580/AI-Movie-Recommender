# CINEPLAY — AI Movie Discovery Platform

CINEPLAY is an advanced OTT-style movie discovery and recommendation project built by Mahi.

It combines a polished streaming frontend with a real Python ML backend, relational SQL storage, optional MongoDB event analytics, live TMDB data, YouTube trailer discovery, and a static GitHub Pages deployment.

Repository: https://github.com/mahitech580/AI-Movie-Recommender

Expected Pages site:
https://mahitech580.github.io/AI-Movie-Recommender/

## Indian cinema coverage

The offline CINEPLAY catalog now includes **139 titles**, including **109 Indian titles** and **50 Telugu/TFI titles**. Telugu cinema has its own dedicated **Telugu · TFI** shelf and filter, while Indian discovery also supports Hindi, Tamil, Malayalam, Kannada, Bengali, Marathi and Punjabi.

The discovery filters cover common genres including Action, Adventure, Animation, Biography, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Musical, Mystery, Romance, Sci-Fi, Sport, Thriller, War and Western. Regional and industry metadata are part of the local recommendation/search text, so filters, search and the local recommender can use them.

When TMDB live mode is connected, CINEPLAY supplements the local catalog with India-region popular, top-rated, now-playing, upcoming and India-origin discovery results. The local catalog remains the offline fallback.

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

The repository contains a QA workflow at:

    .github/workflows/pages.yml

The QA workflow:

1. starts PostgreSQL and MongoDB service containers
2. installs Python dependencies
3. compiles the Python backend
4. trains the scikit-learn model artifact
5. runs the FastAPI/SQL/MongoDB smoke test
6. checks JavaScript syntax and static assets

The repository's existing GitHub Pages publisher handles the actual static-site deployment from the main branch. The final Pages deployment for the current build completed successfully.

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


## Cinematic UX + realtime behavior

CINEPLAY is intentionally designed as a movie-discovery experience rather than a static poster gallery.

- Cinematic opening sequence on first paint with a rotating film-reel mark, ambient glow, moving grid, drifting particles, scan sweep, progress bar, and reduced-motion fallback.
- Responsive OTT-style navigation with fixed top navigation, mobile drawer, search/command navigation, hero actions, horizontal rails, Top 10, Continue Watching, My List, activity, and detailed title modals.
- Dynamic card motion with hover lift, layered glow, focus states, image shimmer, live badges, and adaptive recommendation labels.
- Instant local recommendation refresh after meaningful interactions. Opening a title, saving it, or playing it changes local signals and immediately re-ranks the Made for You shelf.
- Live TMDB refresh for trending, popular, top-rated, now-playing, upcoming, India discovery, and search when an authorized browser credential is configured.
- Five-minute visibility-aware refresh checks while connected, immediate refresh after network recovery, and a visible freshness label such as SYNCED JUST NOW, SYNCED 12M AGO, or CACHED · OFFLINE.
- Cached live pools so temporary API/network failures fall back to the most recent usable snapshot plus the curated catalog.

These behaviors follow general modern OTT interaction patterns such as personalized rows, Continue Watching, Top 10, contextual title information, and recommendations that react to recent engagement. The implementation is original and does not copy Netflix, JioHotstar, YouTube, Rotten Tomatoes, or other brands' logos, proprietary assets, or visual identity.

## Architecture reality

GitHub Pages serves only the static frontend. Browser JavaScript can call TMDB directly when the visitor supplies an authorized credential. The Python/FastAPI + SQL + optional MongoDB stack is a companion backend and does not execute inside GitHub Pages.

The companion stack provides:

- FastAPI endpoints for health, movies, search, recommendations, similar titles, events, and profile data.
- SQLAlchemy with SQLite by default and PostgreSQL support through DATABASE_URL.
- Optional MongoDB event analytics through MONGODB_URI.
- scikit-learn TF-IDF, cosine similarity, KNN retrieval, hybrid ranking, popularity/quality/freshness signals, and genre diversification.
- Docker Compose for the API + PostgreSQL + MongoDB development stack.
- GitHub Actions smoke tests covering Python imports, model training, API endpoints, JavaScript syntax, and the static frontend contract.

TMDB's API is rate-limited, so realtime in this project means live-on-demand data plus short refresh intervals, visibility/network awareness, caching, and immediate client-side personalization rather than an unlimited streaming feed.

## Final QA contract

Before release, the project should pass:

1. The cinematic black opening overlay appears and exits automatically.
2. Home, Discover, My List, and Activity work on desktop and mobile.
3. Movie cards open details; My List toggles; trailer/critic actions hand off safely; recommendations re-rank after interactions.
4. Search works locally and can use live TMDB results when connected.
5. Live sync refreshes shelves and updates the visible sync-age label; offline mode preserves cached/local content.
6. Reduced-motion users are not forced into decorative animation.
7. GitHub Pages remains static-first and browser-visible API keys are treated as public credentials, not backend secrets.
8. The FastAPI/SQL/MongoDB companion stack remains covered by CI.

## External API notes

TMDB v3 provides the live movie and image APIs used by the frontend, including search, discover, trending, and title-related methods. TMDB also documents rate limiting and the use of application credentials.

Watch-provider information is surfaced through TMDB's provider integration and attributed in the UI to TMDB/JustWatch. Trailer links use YouTube as the destination.

## Latest frontend focus

The current presentation pass specifically targets the “black screen” opening state, premium motion, movie-card depth, live freshness visibility, instant adaptive shelves, and network recovery. The goal is a cinematic streaming-style experience while preserving CINEPLAY's static-first GitHub Pages constraint and real Python ML companion architecture.


## Browser-level QA

CINEPLAY now includes an automated Playwright smoke test in GitHub Actions. The test starts the static site locally and verifies the real browser runtime on desktop and mobile: the cinematic loader releases, the hero initializes, movie cards render, title details open and close, My List persists to localStorage, local search surfaces a known title, and the mobile navigation drawer opens and closes. Browser console/page errors fail the test.

The frontend also uses versioned asset URLs and an emergency loader-release guard so stale browser caches or a JavaScript loading/runtime failure cannot leave visitors permanently trapped behind the black cinematic opening screen.

## Live catalog ETL, poster imagery, and reproducible evaluation

The checked-in dataset remains the offline seed. The new sync pipeline can refresh it from TMDB movie feeds for trending, popular, top-rated, current releases, upcoming releases, and Indian-origin discovery. It retains hand-curated order/tags and adds titles with live poster/backdrop CDN URLs. Authentication is read only from an environment variable; the token is never written into JSON, JavaScript, reports, or logs.

### Set up the live data import

1. Create a TMDB API Read Access Token from the TMDB account API settings.
2. Configure TMDB_BEARER_TOKEN as an environment variable locally or as a repository Actions secret with that exact name.
3. Run from the repository root:

    python -m pip install -r requirements.txt -r requirements-eda.txt
    python scripts/sync_tmdb_catalog.py --pages 3 --max-movies 1200
    python scripts/analyze_catalog.py
    PYTHONPATH=. pytest -q tests

The importer generates both data/movies.json (Python/API data source) and data/movies.js (static GitHub Pages source) from a consistent normalized catalog. Poster/backdrop images are hotlinked from TMDB's image CDN rather than checking large remote assets into Git. The existing frontend image-failure fallback remains in place.

For a managed sync, use GitHub Actions → Sync live TMDB movie catalog → Run workflow. It commits validated catalog/report changes directly to main. The workflow requires the TMDB_BEARER_TOKEN secret and is manual by design, so API consumption and changes remain controlled. See the official TMDB application authentication documentation: https://developer.themoviedb.org/docs/authentication-application.

### EDA and API analytics

Run python scripts/analyze_catalog.py to create reports/catalog_summary.json, reports/catalog_features.csv, and charts for genre counts, rating distributions, release-year coverage, and rating versus popularity.

New backend endpoints:

- GET /api/analytics/catalog — numeric statistics, genre/language/rating distributions, poster/overview coverage, duplicate checks, and rating/popularity correlation.
- GET /api/analytics/engagement — aggregate event counts and most-engaged titles without exposing raw user interaction histories.

### Ranking evaluation

scripts/evaluate_recommender.py measures Precision@K, Recall@K, NDCG@K, Hit Rate@K, and catalog coverage using a temporal per-user holdout. It requires real, consented interaction events; it deliberately does not manufacture a quality score from catalog metadata alone.

Export an authorized local interaction table to a CSV with user_id, movie_id, event_type, value, and created_at columns, then run:

    python scripts/evaluate_recommender.py --interactions path/to/interactions.csv --k 10

Only play/list events count as positive relevance labels. Review the output report and document the evaluation size/method before putting metrics on a resume. Do not commit real user event exports.

### SQL analytics and skills actually demonstrated

sql/analytics.sql provides catalog-quality summaries, event-funnel aggregations, top titles, a SQL window-function query, and a Bayesian weighted-rating example. Startup now upserts changed catalog metadata into SQL, so refreshed online data does not leave the SQL catalog stale.

The code concretely demonstrates Python, SQL/SQLAlchemy, NumPy, Pandas, descriptive statistics, data cleaning, feature engineering, EDA, TF-IDF/NLP, cosine similarity, KNN, hybrid recommendation, collaborative interaction signals, ranking metrics, FastAPI/REST, SQLite/PostgreSQL, optional MongoDB events, Docker, GitHub Actions, automated tests, and data visualization.

CNN/RNN/LSTM training, computer-vision model training, transformer fine-tuning, LLM prompting, RAG, and vector databases are not claimed as implemented by this metadata-based recommender. They should only be added if a separate feature with real data, tests, and evaluation is built.

## Advanced model suite: predictive ML, grounded RAG, and poster vision

CINEPLAY now has optional experiments around the movie catalog instead of a technology list with no implementation. The lightweight recommender API still works without the optional packages.

### Revenue regression, rating classification, and clustering

Install the experiment stack and run:

    python -m pip install -r requirements-mlops.txt
    python scripts/train_predictive_models.py

The script downloads a public TMDB 5000 metadata snapshot into the ignored .cache folder, applies JSON/number/date cleaning and genre/language feature engineering, tunes Random Forest hyperparameters with GridSearchCV, and reports held-out MAE/RMSE/R² for revenue regression plus precision/recall/F1/ROC-AUC for a high-rating classification task. KMeans clustering reports cluster sizes, average ratings/popularity, genre profiles, and a silhouette score. XGBoost is used as an additional regressor when installed. MLflow tracking is optional via CINEPLAY_LOG_MLFLOW=true and MLFLOW_TRACKING_URI. The downloaded source file and local tracking directory are not committed.

The fixed classification label is vote_average >= 7.0. vote_average itself is never included as a predictor. Revenue is modeled using log1p during training and evaluated in the original revenue scale; this is a dataset exercise, not a guarantee of future box-office results.

### Semantic search and RAG-style movie Q&A

- GET /api/semantic/search?q=ghosts%20and%20supernatural%20mystery
- POST /api/ai/ask with {"question":"Recommend atmospheric space movies","top_k":5}

The default search uses local TF-IDF features. Install requirements-ai.txt to opt into Hugging Face SentenceTransformer embeddings and a persistent Chroma vector store. With OPENAI_API_KEY and OPENAI_MODEL configured, the Q&A endpoint uses retrieved title/synopsis evidence as context for an OpenAI-compatible chat-completions endpoint; without credentials it returns a transparent retrieval-only answer. Returned sources link to catalog titles/TMDB pages. Credentials are read from the environment and must not be committed. RAG prompts instruct the model not to follow instructions embedded in retrieved descriptions and not to invent catalog facts.

### Online poster computer vision

Run python -m pip install -r requirements-vision.txt and then:

    python scripts/analyze_poster_art.py --limit 150

The script fetches remote TMDB poster URLs, extracts HSV color histograms, brightness, contrast, saturation, aspect ratio, and edge density with OpenCV, then uses KMeans to cluster poster styles. Only compact numeric features and cluster summaries are written; remote poster image files are not stored. A manually triggered GitHub Actions workflow can refresh these reports on main.

### Deep-learning synopsis genre classification

Install requirements-deep-learning.txt and run:

    python scripts/train_deep_genre_model.py --epochs 6

This optional TensorFlow/Keras experiment trains a multi-label genre classifier from title/overview text using an embedding layer, Conv1D, and bidirectional LSTM, with early stopping, dropout, a deterministic split, and micro/macro F1 evaluation. The model/tokenizer artifacts remain in the ignored .cache folder; only the evaluation report is suitable for version control. This is a catalog genre-classification task, not a movie-rating or recommendation-accuracy claim.

### Relevant resume skills supported by this repository

Python, SQL, NumPy, Pandas, statistics, probability-informed ranking, EDA, feature engineering, scikit-learn, regression, classification, clustering, GridSearchCV, XGBoost (optional), Keras/TensorFlow (optional genre classifier), CNN/BiLSTM, NLP, TF-IDF, transformer embeddings (optional), vector search with Chroma (optional), retrieval-augmented generation with grounded sources, FastAPI/REST APIs, SQLite/PostgreSQL, optional MongoDB, Docker, Git/GitHub Actions, Pytest, model evaluation, MLflow (optional), OpenCV poster feature extraction, and visualization.

These are intentionally separated into core and optional environments to keep the static GitHub Pages product usable and the backend install light. Do not list a metric in a resume until a run produces a real report; include the dataset, split, metric, and sample count. PyTorch-based model training, generic RNN/LSTM/CNN architectures, cloud-specific deployment, Flask, MySQL, and every item in a broad skills list are not automatically claimed just because a package could be installed.
