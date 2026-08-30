from flask import Flask, jsonify, render_template, request
from database.database import init_db, save_history, get_history, clear_history
from services.app_state import load_recommender

app = Flask(__name__)
init_db()

# Load once per process. Run setup_data.py first.
try:
    recommender = load_recommender()
except FileNotFoundError:
    recommender = None


@app.route("/")
def home():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({"success": True, "status": "healthy", "model_ready": recommender is not None})


@app.get("/api/search")
def search():
    if recommender is None:
        return jsonify({"success": False, "error": "Dataset not ready. Run python setup_data.py"}), 503
    query = request.args.get("q", "").strip()
    if len(query) < 2:
        return jsonify({"success": True, "results": []})
    return jsonify({"success": True, "results": recommender.search(query)})


@app.post("/api/recommend")
def recommend():
    if recommender is None:
        return jsonify({"success": False, "error": "Dataset not ready. Run python setup_data.py"}), 503
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title", "")).strip()
    if not title:
        return jsonify({"success": False, "error": "Movie title is required."}), 400

    source, recommendations = recommender.recommend(title)
    if source is None:
        return jsonify({"success": False, "error": "Movie not found. Try the search suggestions."}), 404

    save_history(source["title"], len(recommendations))
    return jsonify({"success": True, "selected": source, "recommendations": recommendations})


@app.get("/api/history")
def history():
    return jsonify({"success": True, "history": get_history()})


@app.delete("/api/history")
def clear_history_api():
    clear_history()
    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)
