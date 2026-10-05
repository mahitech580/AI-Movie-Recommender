# MOTION — AI Movie Recommender

A Netflix-inspired, GitHub Pages-ready movie discovery experience with real movie artwork, browser-side AI recommendations, local personalization, and optional live TMDB data.

**Built by Mahi — Mahendra Sai Kondaveeti**

## What this version is

MOTION is now a **pure static HTML/CSS/JavaScript application** designed to run on GitHub Pages. The previous Flask/Python runtime is no longer required for the deployed experience.

GitHub Pages publishes static files and does not support running server-side Python on the Pages host, so the recommendation engine, search, My List, history and personalization are all handled in the browser. citeturn618842search2turn618842search5

## Product experience

- Cinematic streaming-style homepage
- Large rotating hero banner
- Dark green + deep red visual system
- Animated smoke/glow atmosphere
- Real movie posters and backdrop artwork
- AI Picks shelf
- Trending shelf
- Top Rated shelf
- New & Rising shelf
- Browse by Vibe
- My List
- Recently explored
- Movie details modal
- Trailer search
- Search/autocomplete
- Genre filters
- Ctrl/Cmd + K command palette
- Responsive desktop and mobile layout
- Browser localStorage personalization
- Optional live TMDB mode

## Browser AI recommendation engine

The deployed recommendation logic is intentionally lightweight so it can run without a server:

~~~text
Title + genres + tags + overview
              ↓
        term-frequency vector
              ↓
        cosine similarity
              ↓
       shared-genre signal
              ↓
        rating strength
              ↓
       local taste signals
              ↓
         ranked AI queue
~~~

The system is a content-based recommender rather than a production collaborative-filtering service. Its purpose is to demonstrate the recommendation workflow in a fully static project.

## Live mode

MOTION supports optional real-time TMDB integration.

TMDB provides API endpoints for movie/search/trending data and an image CDN for poster and backdrop assets. citeturn618842search0turn618842search1turn618842search9turn618842search10

### Enable it

1. Create a TMDB API key.
2. Open MOTION.
3. Click the status button in the top-right corner.
4. Paste your key.
5. Save.
6. Live trending and search are then fetched directly from the browser.

The key is stored only in browser local storage and is **not written into this repository**.

Because this is GitHub Pages only, there is deliberately no private backend proxy. Do not hard-code a private credential into the repository.

## Movie artwork

The bundled catalog uses TMDB image paths and the documented TMDB image URL pattern.

TMDB documents that a working image URL is assembled from its secure base URL, image size, and the returned poster/backdrop path. citeturn618842search1

Keep the applicable TMDB attribution and usage requirements with the deployed project.

## GitHub Pages

Repository:

https://github.com/mahitech580/AI-Movie-Recommender

Expected project site:

https://mahitech580.github.io/AI-Movie-Recommender/

GitHub Pages supports project sites at the owner.github.io/repository-name path. citeturn618842search5

### Pages configuration

In the repository:

**Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**

The repository also contains a root .nojekyll file so the static asset folders are served directly.

## Project structure

~~~text
AI-Movie-Recommender/
├── index.html
├── .nojekyll
├── README.md
├── data/
│   └── movies.js
└── assets/
    ├── app.js
    └── styles.css
~~~

## Local persistence

MOTION stores these browser-local values:

- My List
- Recently explored titles
- Recommendation signals
- Optional TMDB API key

No SQLite database is required by the deployed version.

## Technology

**Frontend:** HTML5, CSS3, Vanilla JavaScript

**Recommendation:** term vectors, cosine similarity, genre overlap, rating signal, local preference signals

**Live data:** TMDB REST API

**Hosting:** GitHub Pages

## Notes

The application is inspired by modern streaming-service information architecture, but it does not use Netflix branding or assets.

The project is intended as a portfolio demonstration of frontend engineering, data handling, recommendation logic, API integration and static deployment.

## Author

**Mahi / Mahendra Sai Kondaveeti**

GitHub: https://github.com/mahitech580
