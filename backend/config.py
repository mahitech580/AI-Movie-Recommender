from dataclasses import dataclass
import os


def normalize_database_url(value: str | None) -> str:
    """Normalize common managed-database URLs to installed SQLAlchemy drivers."""
    url = (value or "").strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("mysql://"):
        return "mysql+pymysql://" + url[len("mysql://"):]
    if url.startswith("mysql+pymysql://"):
        return url
    return url


@dataclass(frozen=True)
class Settings:
    app_name: str = "CINEPLAY AI Backend"
    database_url: str = normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./cineplay.db"))
    mongodb_uri: str = os.getenv("MONGODB_URI", "")
    mongodb_database: str = os.getenv("MONGODB_DATABASE", "cineplay")
    cors_origins: str = os.getenv(
        "CORS_ORIGINS",
        "https://mahitech580.github.io,http://localhost:5500,http://127.0.0.1:5500"
    )


settings = Settings()


def cors_list() -> list[str]:
    return [x.strip() for x in settings.cors_origins.split(",") if x.strip()]
