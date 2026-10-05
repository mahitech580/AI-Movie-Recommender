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
