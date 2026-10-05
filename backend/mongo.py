from __future__ import annotations

from datetime import datetime, timezone

try:
    from pymongo import MongoClient
except ImportError:
    MongoClient = None

from backend.config import settings

_client = None
_database = None

def get_db():
    global _client, _database
    if not settings.mongodb_uri or MongoClient is None:
        return None
    if _database is not None:
        return _database
    try:
        _client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=1800)
        _client.admin.command("ping")
        _database = _client[settings.mongodb_database]
        return _database
    except Exception:
        _client = None
        _database = None
        return None

def mongo_status() -> dict:
    if not settings.mongodb_uri:
        return {"enabled": False, "connected": False}
    if MongoClient is None:
        return {"enabled": True, "connected": False, "error": "pymongo not installed"}
    return {"enabled": True, "connected": get_db() is not None}

def log_event(event: dict) -> bool:
    db = get_db()
    if db is None:
        return False
    try:
        db.events.insert_one({**event, "created_at": datetime.now(timezone.utc)})
        return True
    except Exception:
        return False
