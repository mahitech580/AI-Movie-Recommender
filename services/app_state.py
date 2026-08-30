from pathlib import Path
from model.recommender import MovieRecommender

BASE_DIR = Path(__file__).resolve().parent.parent

recommender = None


def load_recommender():
    global recommender
    if recommender is None:
        recommender = MovieRecommender(str(BASE_DIR / "data"))
    return recommender
