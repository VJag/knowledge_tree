from __future__ import annotations

import os
from dataclasses import dataclass


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    secret_key: str
    session_cookie_name: str
    session_ttl_hours: int
    secure_cookies: bool
    otp_ttl_minutes: int
    resend_api_key: str | None
    email_from: str | None
    email_reply_to: str | None
    database_url: str | None

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            secret_key=os.environ.get("SECRET_KEY", "dev-knowledgetree-change-me"),
            session_cookie_name=os.environ.get("SESSION_COOKIE_NAME", "knowledgetree_session"),
            session_ttl_hours=int(os.environ.get("SESSION_TTL_HOURS", "720")),
            secure_cookies=_bool_env("SECURE_COOKIES", False),
            otp_ttl_minutes=int(os.environ.get("OTP_TTL_MINUTES", "10")),
            resend_api_key=os.environ.get("RESEND_API_KEY") or None,
            email_from=os.environ.get("EMAIL_FROM") or None,
            email_reply_to=os.environ.get("EMAIL_REPLY_TO") or None,
            database_url=os.environ.get("DATABASE_URL") or None,
        )
