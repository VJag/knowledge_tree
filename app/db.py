from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from app.config import Settings


def connect(settings: Settings) -> psycopg.Connection:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg.connect(settings.database_url, row_factory=dict_row)


@contextmanager
def get_conn(settings: Settings) -> Iterator[psycopg.Connection]:
    conn = connect(settings)
    try:
        yield conn
    finally:
        conn.close()
