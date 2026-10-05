-- CINEPLAY relational schema
-- SQLite is the zero-configuration default.
-- PostgreSQL/MySQL environments can adapt JSON columns as required.

CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    year VARCHAR(10) NOT NULL,
    genres JSON,
    tags JSON,
    overview TEXT,
    rating DOUBLE DEFAULT 0,
    votes INTEGER DEFAULT 0,
    popularity DOUBLE DEFAULT 0,
    language VARCHAR(16) DEFAULT 'en',
    poster VARCHAR(500),
    backdrop VARCHAR(500),
    release_date VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY,
    user_id VARCHAR(180) NOT NULL,
    movie_id INTEGER NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    value DOUBLE DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_movies_title ON movies(title);
CREATE INDEX IF NOT EXISTS ix_interactions_user ON interactions(user_id);
CREATE INDEX IF NOT EXISTS ix_interactions_movie ON interactions(movie_id);
CREATE INDEX IF NOT EXISTS ix_interactions_user_movie ON interactions(user_id, movie_id);
