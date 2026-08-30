# 🎬 AI Movie Recommender System

> A machine-learning recommendation web app that suggests movies similar to a selected title using TF-IDF and cosine similarity on MovieLens metadata and tags.

**Built by Mahendra Kondaveeti**

## Features
- Movie search with live suggestions
- Content-based recommendations
- TF-IDF feature extraction
- Cosine-similarity ranking
- Movie ratings and rating counts
- SQLite recommendation history
- REST API endpoints
- Responsive web UI
- Input validation and error handling
- Automated tests

## Tech Stack
Python • Flask • Pandas • Scikit-learn • SQLite • JavaScript • HTML • CSS

## How it works
```text
Movie title
   ↓
MovieLens metadata + tags
   ↓
Text feature construction
   ↓
TF-IDF vectorization
   ↓
Cosine similarity
   ↓
Ranking + rating signal
   ↓
Top recommendations
```

## Setup
### 1. Clone
```bash
git clone https://github.com/mahitech580/AI-Movie-Recommender.git
cd AI-Movie-Recommender
```

### 2. Virtual environment
Windows:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install
```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Download the dataset
```bash
python setup_data.py
```
The script downloads and extracts the **MovieLens latest-small** dataset from GroupLens into `data/`.

### 5. Run
```bash
python app.py
```
Open `http://127.0.0.1:5000`.

## API
`GET /api/health` — application health

`GET /api/search?q=interstellar` — title search

`POST /api/recommend` — JSON body: `{ "title": "Interstellar (2014)" }`

`GET /api/history` — recent recommendation history

`DELETE /api/history` — clear history

## Project Structure
```text
AI-Movie-Recommender/
├── app.py
├── setup_data.py
├── requirements.txt
├── model/recommender.py
├── services/app_state.py
├── database/database.py
├── utils/
├── templates/index.html
├── static/css/style.css
├── static/js/script.js
├── tests/test_api.py
└── data/
```

## Recommendation Method
The system combines movie title, genres, and user-generated tags into a text representation. TF-IDF converts this text into sparse feature vectors, and cosine similarity measures how close movies are to the selected title. A small rating-based component is then blended into the final ranking.

This is a **content-based recommender**, not a production-scale collaborative filtering system.

## Dataset
This project uses the **MovieLens latest-small** dataset provided by GroupLens Research. Dataset files are downloaded locally by `setup_data.py` and are excluded from Git through `.gitignore`.

## Testing
```bash
pytest
```

## Limitations
- Recommendations depend on the available MovieLens metadata and tags.
- The model does not learn a personal user's long-term preferences.
- A title's similarity score is not the same as real-world recommendation quality.
- The first setup requires an internet connection to download the dataset.

## Future Improvements
- Collaborative filtering
- User accounts and personalized profiles
- Hybrid recommendation model
- TMDB poster and metadata integration
- Deployment with a production WSGI server
- A/B testing and offline recommendation evaluation

## Author
**Mahendra Kondaveeti**

GitHub: https://github.com/mahitech580
