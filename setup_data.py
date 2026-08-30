from pathlib import Path
import zipfile
import requests

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ZIP_PATH = DATA_DIR / "ml-latest-small.zip"
URL = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"


def main():
    DATA_DIR.mkdir(exist_ok=True)
    if not ZIP_PATH.exists():
        print("Downloading MovieLens dataset...")
        response = requests.get(URL, timeout=60, verify=False)
        response.raise_for_status()
        ZIP_PATH.write_bytes(response.content)
    print("Extracting dataset...")
    with zipfile.ZipFile(ZIP_PATH) as zf:
        zf.extractall(DATA_DIR)
    extracted = DATA_DIR / "ml-latest-small"
    for name in ("movies.csv", "ratings.csv", "tags.csv"):
        source = extracted / name
        target = DATA_DIR / name
        if source.exists():
            target.write_bytes(source.read_bytes())
    print("MovieLens data is ready in ./data")


if __name__ == "__main__":
    main()
