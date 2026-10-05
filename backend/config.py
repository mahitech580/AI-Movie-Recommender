from dataclasses import dataclass
import os

@dataclass(frozen=True)
class Settings:
    app_name: str = "CINEPLAY AI Backend"
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./cineplay.db")
    mongodb_uri: str = os.getenv("MONGODB_URI", "")
    mongodb_database: str = os.getenv("MONGODB_DATABASE", "cineplay")
    cors_origins: str = os.getenv(
        "CORS_ORIGINS",
        "https://mahitech580.github.io,http://localhost:5500,http://127.0.0.1:5500"
    )

settings = Settings()

def cors_list() -> list[str]:
    return [x.strip() for x in settings.cors_origins.split(",") if x.strip()]
