# CINEPLAY — AI Movie Discovery

**CINEPLAY** is a cinematic, streaming-platform-style movie discovery experience built as a static-first web application for GitHub Pages.

**Built by Mahi — Mahendra Sai Kondaveeti**

Repository: https://github.com/mahitech580/AI-Movie-Recommender  
Project site: https://mahitech580.github.io/AI-Movie-Recommender/

> CINEPLAY is inspired by modern streaming-service information architecture, but it does not use Netflix, Hotstar, or other streaming-service branding or assets.

## Product experience

This version is designed to feel like a real OTT product rather than a basic movie dashboard:

- Cinematic full-screen hero with rotating featured titles
- Streaming rails with poster hover states and micro-interactions
- Top 10 ranking shelf
- Continue-exploring trail
- Adaptive “Made for you” recommendations
- Mood-based discovery
- Trending, top-rated, fresh-release and India-focused shelves
- Hidden-gems discovery
- Search autocomplete and semantic-style local search
- Ctrl/Cmd + K command palette
- Movie details experience with AI match explanation
- My List with persistent browser storage
- Activity history and local taste profile
- AI Recommendation Lab
- Dark green + red ambient smoke, glow, depth and motion
- Responsive desktop/tablet/mobile layout
- PWA-style manifest and branded icon
- Optional live TMDB synchronization

## Recommendation engine

CINEPLAY is intentionally serverless so the deployed project can stay on GitHub Pages.

The browser builds a local preference profile from user interactions and combines:

- Content-vector similarity
- Genre affinity
- User taste profile
- Rating confidence
- Popularity/trending signal
- Freshness
- Novelty/exploration
- Local interaction signals

The flow is:

    Movie metadata
       |
       +-- title
       +-- genres
       +-- tags
       +-- overview
       +-- language
       |
       v
    TF/IDF-like feature vector
       |
       v
    Cosine similarity
       |
       +-----------------------------+
       | Local taste profile         |
       | Genre affinity              |
       | Rating confidence           |
       | Popularity                  |
       | Freshness                   |
       | Novelty                     |
       +-----------------------------+
                    |
                    v
             Adaptive ranking
                    |
                    v
               Made for you

The local model also applies an online-learning-style update after positive actions such as opening a title, saving it, creating similar recommendations, or playing a preview. Feature signals and model weights are stored in localStorage and can be reset from the AI Lab.

This is a portfolio-scale recommender implementation, not a claim of production-grade collaborative filtering. A production service would normally use server-side event pipelines, larger catalogs, candidate generation, offline training, experimentation and evaluation.

## Live movie data

CINEPLAY can connect directly to the TMDB API from the browser.

Live synchronization can populate:

- Trending movies
- Popular movies in India
- Top-rated movies
- Now playing
- Upcoming titles
- Indian-origin discovery
- Live movie search

The browser caches the latest successful live response locally, then refreshes it when the live credential is available. A failed live request falls back to the bundled catalog so the website remains usable.

### Enable live mode

1. Create a TMDB API credential.
2. Open CINEPLAY.
3. Click the LIVE control in the top-right.
4. Paste your TMDB v3 API key.
5. Connect.
6. Use Sync on the shelves or let the browser refresh automatically.

The credential is stored only in this browser using localStorage. It is not written to the GitHub repository.

**Important:** a browser-side credential is not a secret. Do not hard-code a credential into the source code and do not assume localStorage makes a public API key private.

## Images and attribution

CINEPLAY uses TMDB image paths for movie posters and backdrops in the bundled catalog and in live mode.

The website displays:

> This product uses the TMDB API but is not endorsed or certified by TMDB.

Review TMDB's current API terms, attribution and rate-limiting requirements before publishing a public live integration.

## GitHub Pages architecture

GitHub Pages is used as the only hosting layer.

There is no Flask server, Python runtime, SQLite database or private API proxy in the deployed architecture.

The deployed application is:

    Browser
       |
       +--> index.html
       +--> assets/styles.css
       +--> assets/app.js
       +--> data/movies.js
       |
       +--> localStorage
       |
       +--> optional TMDB REST API
       |
       v
    GitHub Pages

This keeps the core experience functional even when live API access is unavailable.

### Publish

In GitHub:

**Settings → Pages → Build and deployment → Deploy from a branch → main → /(root)**

The repository contains a root .nojekyll file so the static asset directories are served directly.

## Project structure

    AI-Movie-Recommender/
    ├── index.html
    ├── manifest.webmanifest
    ├── .nojekyll
    ├── README.md
    ├── data/
    │   └── movies.js
    └── assets/
        ├── app.js
        ├── styles.css
        └── cineplay-icon.svg

## Browser storage

CINEPLAY stores only local application state:

- My List
- Activity/history
- Recommendation signals
- Taste-feature weights
- Adaptive model weights
- Optional TMDB credential
- Cached live catalog response

No server database is required for the deployed site.

## Reliability features

The frontend includes:

- Curated fallback catalog
- Graceful live API failure handling
- Cached live data
- Automatic live refresh when a credential exists
- Manual sync controls
- Lazy-loaded posters
- Broken-image-safe rendering
- Responsive layouts
- Keyboard navigation
- Escape-to-close dialogs
- Reduced-motion support
- Local model reset
- Persistent My List and activity

## Technology

**Frontend:** HTML5, CSS3, Vanilla JavaScript  
**Recommendation:** TF/IDF-like content vectors, cosine similarity, genre affinity, Bayesian-style rating confidence, popularity, freshness, novelty and online preference updates  
**Live API:** TMDB REST API  
**Hosting:** GitHub Pages  
**Storage:** Browser localStorage  
**Brand:** CINEPLAY

## Portfolio highlights

CINEPLAY demonstrates:

- Static-site architecture
- Responsive UI engineering
- Client-side state management
- Recommendation-system design
- API integration and graceful fallback
- Local personalization
- Search ranking
- Data normalization
- Persistent browser storage
- Keyboard-accessible interactions
- Animation and micro-interaction design
- GitHub Pages deployment constraints

The core product decision is deliberate: **the experience remains useful without a backend, while live TMDB data is an optional enhancement.**

## Third-party service

Movie metadata and artwork used through live TMDB mode are supplied by TMDB and remain subject to TMDB's current policies and terms.

## Author

**Mahi / Mahendra Sai Kondaveeti**

GitHub: https://github.com/mahitech580
