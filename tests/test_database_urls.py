from __future__ import annotations

import pytest

from backend.config import normalize_database_url


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("postgres://user:pass@host:5432/cineplay", "postgresql+psycopg://user:pass@host:5432/cineplay"),
        ("postgresql://user:pass@host:5432/cineplay", "postgresql+psycopg://user:pass@host:5432/cineplay"),
        ("mysql://user:pass@host:3306/cineplay", "mysql+pymysql://user:pass@host:3306/cineplay"),
        ("mysql+pymysql://user:pass@host:3306/cineplay", "mysql+pymysql://user:pass@host:3306/cineplay"),
        ("sqlite:///./cineplay.db", "sqlite:///./cineplay.db"),
        ("", ""),
    ],
)
def test_managed_database_url_normalization(source, expected):
    assert normalize_database_url(source) == expected
