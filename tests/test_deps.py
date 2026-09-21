from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.deps import (
    clear_session_cookie,
    get_optional_user,
    get_session_id,
    get_settings,
    require_user,
    set_session_cookie,
)
from app.models import User


def test_get_settings_from_app_state(settings):
    request = MagicMock()
    request.app.state.settings = settings
    assert get_settings(request) is settings


def test_get_session_id_reads_cookie(settings):
    request = MagicMock()
    request.app.state.settings = settings
    request.cookies = {settings.session_cookie_name: "sess-1"}
    assert get_session_id(request) == "sess-1"


def test_get_session_id_missing_cookie(settings):
    request = MagicMock()
    request.app.state.settings = settings
    request.cookies = {}
    assert get_session_id(request) is None


@patch("app.deps.AuthService")
def test_get_optional_user_returns_user(mock_auth_cls, settings):
    user = User(id="u1", email="a@b.com", name=None)
    mock_auth_cls.return_value.current_user.return_value = user
    request = MagicMock()
    request.app.state.settings = settings
    request.cookies = {settings.session_cookie_name: "sess-1"}
    assert get_optional_user(request) == user


@patch("app.deps.get_optional_user")
def test_require_user_raises_when_anonymous(mock_optional):
    mock_optional.return_value = None
    with pytest.raises(HTTPException) as exc:
        require_user(MagicMock())
    assert exc.value.status_code == 401


@patch("app.deps.get_optional_user")
def test_require_user_returns_user(mock_optional):
    user = User(id="u1", email="a@b.com", name=None)
    mock_optional.return_value = user
    assert require_user(MagicMock()) == user


def test_set_and_clear_session_cookie(settings):
    response = MagicMock()
    set_session_cookie(response, settings, "sess-abc")
    response.set_cookie.assert_called_once()
    kwargs = response.set_cookie.call_args.kwargs
    assert kwargs["httponly"] is True
    assert kwargs["samesite"] == "lax"
    assert kwargs["secure"] is False

    response.reset_mock()
    clear_session_cookie(response, settings)
    response.delete_cookie.assert_called_once_with(settings.session_cookie_name)
