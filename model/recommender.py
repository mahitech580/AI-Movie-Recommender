from pathlib import Path
from difflib import SequenceMatcher
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class MovieRecommender:
    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.movies = None
        self.matrix = None
        self.indices = {}
        self.vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
        self._load()

    def _load(self):
        movies_path = self.data_dir / "movies.csv"
        ratings_path = self.data_dir / "ratings.csv"
        tags_path = self.data_dir / "tags.csv"
        if not movies_path.exists() or not ratings_path.exists():
            raise FileNotFoundError("MovieLens data not found. Run: python setup_data.py")

        movies = pd.read_csv(movies_path)
        ratings = pd.read_csv(ratings_path)

        avg = ratings.groupby("movieId")["rating"].agg(["mean", "count"]).reset_index()
        avg.columns = ["movieId", "avg_rating", "rating_count"]

        movies = movies.merge(avg, on="movieId", how="left")
        movies["avg_rating"] = movies["avg_rating"].fillna(0).round(2)
        movies["rating_count"] = movies["rating_count"].fillna(0).astype(int)

        movies["genres_text"] = movies["genres"].fillna("").str.replace("|", " ", regex=False)
        if tags_path.exists():
            tags = pd.read_csv(tags_path)
            tag_text = tags.groupby("movieId")["tag"].apply(lambda s: " ".join(map(str, s))).reset_index(name="tags")
            movies = movies.merge(tag_text, on="movieId", how="left")
        else:
            movies["tags"] = ""
        movies["tags"] = movies["tags"].fillna("")
        movies["content"] = (movies["title"].fillna("") + " " + movies["genres_text"] + " " + movies["tags"]).str.lower()
        movies = movies.reset_index(drop=True)

        self.movies = movies
        self.matrix = self.vectorizer.fit_transform(movies["content"])
        self.indices = {title.lower(): i for i, title in enumerate(movies["title"])}

    def search(self, query: str, limit: int = 12):
        q = query.strip().lower()
        if not q:
            return []
        matches = self.movies[self.movies["title"].str.lower().str.contains(q, na=False)]
        if matches.empty:
            scores = self.movies["title"].apply(lambda x: SequenceMatcher(None, q, str(x).lower()).ratio())
            matches = self.movies.assign(_score=scores).sort_values("_score", ascending=False).head(limit)
        else:
            matches = matches.sort_values(["rating_count", "avg_rating"], ascending=False).head(limit)
        return self._records(matches)

    def recommend(self, title: str, limit: int = 10):
        key = title.strip().lower()
        if key not in self.indices:
            results = self.search(title, 1)
            if not results:
                return None, []
            key = results[0]["title"].lower()
        idx = self.indices[key]
        sims = cosine_similarity(self.matrix[idx], self.matrix).ravel()
        ranked = sims.argsort()[::-1]
        ranked = [i for i in ranked if i != idx][:50]
        candidates = self.movies.iloc[ranked].copy()
        candidates["similarity"] = sims[ranked]
        candidates["score"] = candidates["similarity"] * 0.75 + (candidates["avg_rating"] / 5.0) * 0.25
        candidates = candidates.sort_values("score", ascending=False).head(limit)
        source = self.movies.iloc[idx].to_dict()
        return self._record(source), self._records(candidates)

    @staticmethod
    def _record(row):
        if hasattr(row, "to_dict"):
            row = row.to_dict()
        return {
            "movieId": int(row["movieId"]),
            "title": str(row["title"]),
            "genres": str(row.get("genres", "")),
            "avg_rating": float(row.get("avg_rating", 0)),
            "rating_count": int(row.get("rating_count", 0)),
            "similarity": round(float(row.get("similarity", 0)), 4),
        }

    def _records(self, frame):
        return [self._record(row) for _, row in frame.iterrows()]
