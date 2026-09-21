from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator
from unittest.mock import MagicMock, patch

import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("SESSION_COOKIE_NAME", "knowledgetree_test_session")
os.environ.setdefault("DATABASE_URL", "postgresql://test@127.0.0.1:5432/knowledgetree_test")
os.environ.setdefault("RESEND_API_KEY", "")
os.environ.setdefault("EMAIL_FROM", "")


@pytest.fixture
def settings():
    from app.config import Settings

    return Settings(
        secret_key="test-secret-key",
        session_cookie_name="knowledgetree_test_session",
        session_ttl_hours=24,
        secure_cookies=False,
        otp_ttl_minutes=10,
        resend_api_key="re_test_key",
        email_from="test@example.com",
        email_reply_to=None,
        database_url="postgresql://test@127.0.0.1:5432/knowledgetree_test",
    )


@pytest.fixture
def user():
    from app.models import User

    return User(id="user-1", email="owner@example.com", name="Owner")


class MockConn:
    """Minimal psycopg-like connection for service unit tests."""

    def __init__(self, queue: list[Any] | None = None):
        self.queue = list(queue or [])
        self.executed: list[tuple[str, tuple | None]] = []

    def execute(self, query: str, params: tuple | None = None):
        self.executed.append((query.strip(), params))
        if self.queue:
            return self.queue.pop(0)
        cursor = MagicMock()
        cursor.fetchone.return_value = None
        cursor.fetchall.return_value = []
        return cursor

    def commit(self) -> None:
        return None


@contextmanager
def mock_conn(conn: MockConn) -> Iterator[MockConn]:
    yield conn


@pytest.fixture
def patch_get_conn():
    def _patch(conn: MockConn):
        return patch("app.services.auth_service.get_conn", return_value=mock_conn(conn))

    return _patch


@pytest.fixture
def patch_trees_get_conn():
    def _patch(conn: MockConn):
        return patch("app.services.trees_service.get_conn", return_value=mock_conn(conn))

    return _patch


@pytest.fixture
def sample_document():
    return {
        "name": "Sample tree",
        "root": {"id": "root-1", "name": "Sample tree"},
        "topics": [
            {
                "id": "t1",
                "name": "Topic A",
                "level": 1,
                "children": [],
                "notes": [],
                "transitions": [],
            }
        ],
    }


@pytest.fixture
def utc_now():
    return datetime(2026, 9, 21, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def client():
    with patch("app.schema_setup.apply_schema_and_migrations"), patch(
        "app.db.connect", return_value=mock_conn(MockConn())
    ):
        from fastapi.testclient import TestClient

        from app.main import app

        with TestClient(app) as test_client:
            yield test_client
            app.dependency_overrides.clear()
