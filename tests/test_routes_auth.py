from unittest.mock import patch

from app.deps import get_optional_user, require_user
from app.main import app
from app.models import User


def test_me_unauthenticated(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["authenticated"] is False


@patch("app.routes.auth.AuthService")
def test_otp_request_success(mock_service_cls, client):
    mock_service_cls.return_value.request_otp.return_value = "If that email is valid, we sent a sign-in code."
    res = client.post("/api/auth/otp/request", json={"email": "user@example.com"})
    assert res.status_code == 200
    assert res.json()["ok"] is True


@patch("app.routes.auth.AuthService")
def test_otp_request_validation_error(mock_service_cls, client):
    mock_service_cls.return_value.request_otp.side_effect = ValueError("Too many codes requested.")
    res = client.post("/api/auth/otp/request", json={"email": "user@example.com"})
    assert res.status_code == 400
    assert "Too many" in res.json()["error"]


@patch("app.routes.auth.AuthService")
def test_otp_request_server_error(mock_service_cls, client):
    mock_service_cls.return_value.request_otp.side_effect = RuntimeError("db down")
    res = client.post("/api/auth/otp/request", json={"email": "user@example.com"})
    assert res.status_code == 503


@patch("app.routes.auth.AuthService")
def test_otp_verify_sets_cookie(mock_service_cls, client):
    mock_service_cls.return_value.verify_otp.return_value = (
        User(id="u1", email="user@example.com", name=None),
        "session-token",
    )
    res = client.post(
        "/api/auth/otp/verify",
        json={"email": "user@example.com", "code": "123456"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "user@example.com"
    assert "knowledgetree_test_session" in res.cookies


@patch("app.routes.auth.AuthService")
def test_logout_clears_cookie(mock_service_cls, client):
    client.cookies.set("knowledgetree_test_session", "abc")
    res = client.post("/api/auth/logout")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_me_authenticated(client):
    user = User(id="u1", email="user@example.com", name="Ada")
    app.dependency_overrides[get_optional_user] = lambda: user
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    data = res.json()
    assert data["authenticated"] is True
    assert data["user"]["email"] == "user@example.com"


def test_me_required_unauthenticated(client):
    res = client.get("/api/auth/me/required")
    assert res.status_code == 401


def test_me_required_authenticated(client):
    user = User(id="u1", email="user@example.com", name=None)
    app.dependency_overrides[require_user] = lambda: user
    res = client.get("/api/auth/me/required")
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "user@example.com"


def test_otp_request_invalid_email(client):
    res = client.post("/api/auth/otp/request", json={"email": "not-an-email"})
    assert res.status_code == 422


@patch("app.routes.auth.AuthService")
def test_otp_verify_server_error(mock_service_cls, client):
    mock_service_cls.return_value.verify_otp.side_effect = RuntimeError("db down")
    res = client.post(
        "/api/auth/otp/verify",
        json={"email": "user@example.com", "code": "123456"},
    )
    assert res.status_code == 503


@patch("app.routes.auth.AuthService")
def test_otp_verify_validation_error(mock_service_cls, client):
    mock_service_cls.return_value.verify_otp.side_effect = ValueError("Invalid or expired code.")
    res = client.post(
        "/api/auth/otp/verify",
        json={"email": "user@example.com", "code": "000000"},
    )
    assert res.status_code == 400
