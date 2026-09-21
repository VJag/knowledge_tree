from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.security import hash_otp
from app.services.auth_service import AuthService, _as_utc
from app.services.email_service import EmailDeliveryError
from tests.conftest import MockConn


def test_as_utc_naive():
    naive = datetime(2026, 1, 1, 12, 0, 0)
    aware = _as_utc(naive)
    assert aware.tzinfo is not None


def test_request_otp_invalid_email(settings):
    service = AuthService(settings)
    with pytest.raises(ValueError, match="valid email"):
        service.request_otp(email="not-an-email")


@patch("app.services.auth_service.EmailService")
def test_request_otp_success(mock_mailer_cls, settings, patch_get_conn):
    conn = MockConn([MagicMock(fetchone=MagicMock(return_value=None))])
    mock_mailer_cls.return_value.send_otp = MagicMock()
    with patch_get_conn(conn):
        message = AuthService(settings).request_otp(email="user@example.com")
    assert "sign-in code" in message.lower()
    mock_mailer_cls.return_value.send_otp.assert_called_once()


@patch("app.services.auth_service.EmailService")
def test_request_otp_rate_limit(mock_mailer_cls, settings, patch_get_conn):
    now = datetime.now(timezone.utc)
    row_cursor = MagicMock()
    row_cursor.fetchone.return_value = {
        "window_start": now,
        "request_count": 5,
    }
    conn = MockConn([row_cursor])
    with patch_get_conn(conn):
        with pytest.raises(ValueError, match="Too many codes"):
            AuthService(settings).request_otp(email="user@example.com")


@patch("app.services.auth_service.EmailService")
def test_request_otp_email_failure_becomes_value_error(mock_mailer_cls, settings, patch_get_conn):
    conn = MockConn([MagicMock(fetchone=MagicMock(return_value=None))])
    mock_mailer_cls.return_value.send_otp.side_effect = EmailDeliveryError("fail")
    with patch_get_conn(conn):
        with pytest.raises(ValueError, match="Email could not be sent"):
            AuthService(settings).request_otp(email="user@example.com")


def test_verify_otp_invalid_code_format(settings):
    with pytest.raises(ValueError, match="Invalid or expired"):
        AuthService(settings).verify_otp(email="user@example.com", code="abc")


@patch("app.services.auth_service.new_session_id", return_value="session-abc")
def test_verify_otp_success(mock_session, settings, patch_get_conn):
    code = "123456"
    code_hash = hash_otp(settings.secret_key, code)
    otp_cursor = MagicMock()
    otp_cursor.fetchone.return_value = {"email": "user@example.com"}
    user_cursor = MagicMock()
    user_cursor.fetchone.return_value = {
        "id": "uid-1",
        "email": "user@example.com",
        "name": None,
    }
    conn = MockConn([otp_cursor, MagicMock(), user_cursor, MagicMock(), MagicMock()])
    with patch_get_conn(conn):
        user, session_id = AuthService(settings).verify_otp(
            email="user@example.com", code=code
        )
    assert user.email == "user@example.com"
    assert session_id == "session-abc"


def test_logout_noop_without_session(settings):
    AuthService(settings).logout(None)


def test_current_user_none_without_cookie(settings):
    assert AuthService(settings).current_user(None) is None


@patch("app.services.auth_service.EmailService")
def test_verify_otp_expired_code(mock_mailer_cls, settings, patch_get_conn):
    otp_cursor = MagicMock()
    otp_cursor.fetchone.return_value = None
    conn = MockConn([otp_cursor])
    with patch_get_conn(conn):
        with pytest.raises(ValueError, match="Invalid or expired"):
            AuthService(settings).verify_otp(email="user@example.com", code="123456")


@patch("app.services.auth_service.EmailService")
def test_current_user_from_session(mock_mailer_cls, settings, patch_get_conn):
    user_cursor = MagicMock()
    user_cursor.fetchone.return_value = {
        "id": "uid-1",
        "email": "user@example.com",
        "name": "User",
    }
    conn = MockConn([MagicMock(), user_cursor])
    with patch_get_conn(conn):
        user = AuthService(settings).current_user("session-xyz")
    assert user is not None
    assert user.email == "user@example.com"
    assert user.name == "User"
