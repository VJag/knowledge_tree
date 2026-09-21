from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, Request

from app.config import Settings
from app.models import User
from app.services.auth_service import AuthService


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_session_id(request: Request) -> Optional[str]:
    settings = get_settings(request)
    return request.cookies.get(settings.session_cookie_name)


def get_optional_user(request: Request) -> Optional[User]:
    session_id = get_session_id(request)
    return AuthService(get_settings(request)).current_user(session_id)


def require_user(request: Request) -> User:
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return user


def set_session_cookie(response, settings: Settings, session_id: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        session_id,
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
        max_age=settings.session_ttl_hours * 3600,
    )


def clear_session_cookie(response, settings: Settings) -> None:
    response.delete_cookie(settings.session_cookie_name)
