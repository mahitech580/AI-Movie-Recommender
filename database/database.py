import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent.parent / "recommendation_history.db"


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS recommendation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            selected_movie TEXT NOT NULL,
            recommendation_count INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def save_history(movie, count):
    conn = connect()
    conn.execute(
        "INSERT INTO recommendation_history(selected_movie, recommendation_count, created_at) VALUES (?, ?, ?)",
        (movie, int(count), datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    conn.close()


def get_history(limit=25):
    conn = connect()
    rows = conn.execute(
        "SELECT id, selected_movie, recommendation_count, created_at FROM recommendation_history ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def clear_history():
    conn = connect()
    conn.execute("DELETE FROM recommendation_history")
    conn.commit()
    conn.close()
