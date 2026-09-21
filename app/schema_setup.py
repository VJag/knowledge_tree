from __future__ import annotations

from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]


def apply_schema_and_migrations(conn: psycopg.Connection) -> None:
    conn.execute((ROOT / "db" / "schema.sql").read_text(encoding="utf-8"))
    migrations_dir = ROOT / "db" / "migrations"
    if migrations_dir.is_dir():
        for path in sorted(migrations_dir.glob("*.sql")):
            conn.execute(path.read_text(encoding="utf-8"))
    conn.commit()
