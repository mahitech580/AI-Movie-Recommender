from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import create_engine, String, Integer, Float, DateTime, Text, JSON, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, Session
from backend.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class MovieRecord(Base):
    __tablename__ = "movies"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300), index=True)
    year: Mapped[str] = mapped_column(String(10), default="—")
    genres: Mapped[list] = mapped_column(JSON, default=list)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    overview: Mapped[str] = mapped_column(Text, default="")
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    votes: Mapped[int] = mapped_column(Integer, default=0)
    popularity: Mapped[float] = mapped_column(Float, default=0.0)
    language: Mapped[str] = mapped_column(String(16), default="en")
    poster: Mapped[str] = mapped_column(String(500), default="")
    backdrop: Mapped[str] = mapped_column(String(500), default="")
    release_date: Mapped[str] = mapped_column(String(20), default="")

class Interaction(Base):
    __tablename__ = "interactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(180), index=True)
    movie_id: Mapped[int] = mapped_column(Integer, index=True)
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    value: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

Index("ix_interactions_user_movie", Interaction.user_id, Interaction.movie_id)

def init_db() -> None:
    Base.metadata.create_all(engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def seed_movies(db: Session, movies: list[dict]) -> None:
    existing = {int(row[0]) for row in db.query(MovieRecord.id).all()}
    rows = []
    for m in movies:
        mid = int(m["id"])
        if mid in existing:
            continue
        rows.append(MovieRecord(
            id=mid, title=m["title"], year=str(m.get("year","—")),
            genres=m.get("genres",[]), tags=m.get("tags",[]),
            overview=m.get("overview",""), rating=float(m.get("rating",0) or 0),
            votes=int(m.get("votes",0) or 0), popularity=float(m.get("popularity",0) or 0),
            language=m.get("language","en"), poster=m.get("poster",""),
            backdrop=m.get("backdrop",""), release_date=m.get("release_date","")
        ))
    if rows:
        db.add_all(rows)
        db.commit()
