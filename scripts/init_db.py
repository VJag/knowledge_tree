#!/usr/bin/env python3
"""Create the database (if needed) and apply schema.sql."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

DEFAULT_URL = "postgresql://jagannadh@127.0.0.1:5432/knowledgetree"


def admin_url(database_url: str) -> tuple[str, str]:
    """Return (maintenance_url, target_db_name)."""
    parsed = urlparse(database_url)
    db_name = (parsed.path or "/knowledgetree").lstrip("/") or "knowledgetree"
    maintenance = urlunparse(parsed._replace(path="/postgres"))
    return maintenance, db_name


def ensure_database(database_url: str) -> None:
    maintenance, db_name = admin_url(database_url)
    with psycopg.connect(maintenance, autocommit=True) as conn:
        row = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (db_name,),
        ).fetchone()
        if not row:
            conn.execute(f'CREATE DATABASE "{db_name}"')
            print(f"Created database {db_name}")


def apply_schema(database_url: str) -> None:
    sys.path.insert(0, str(ROOT))
    from app.schema_setup import apply_schema_and_migrations

    with psycopg.connect(database_url) as conn:
        apply_schema_and_migrations(conn)
    print("Applied schema and migrations")


def main() -> int:
    database_url = os.environ.get("DATABASE_URL", DEFAULT_URL)
    try:
        ensure_database(database_url)
        apply_schema(database_url)
    except Exception as exc:
        print(f"init_db failed: {exc}", file=sys.stderr)
        return 1
    print("Database ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
