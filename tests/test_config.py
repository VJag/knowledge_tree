import os

from app.config import Settings


def test_settings_from_env_uses_defaults(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("SESSION_TTL_HOURS", raising=False)
    settings = Settings.from_env()
    assert settings.secret_key
    assert settings.session_ttl_hours == 720
    assert settings.otp_ttl_minutes == 10


def test_settings_bool_env(monkeypatch):
    monkeypatch.setenv("SECURE_COOKIES", "true")
    settings = Settings.from_env()
    assert settings.secure_cookies is True


def test_settings_empty_resend_key_becomes_none(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "")
    settings = Settings.from_env()
    assert settings.resend_api_key is None
