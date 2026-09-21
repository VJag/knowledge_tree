from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr

from app.deps import (
    clear_session_cookie,
    get_optional_user,
    get_session_id,
    get_settings,
    require_user,
    set_session_cookie,
)
from app.models import User
from app.services.auth_service import AuthService, OTP_REQUEST_MESSAGE

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("knowledgetree.auth.routes")


class OtpRequestBody(BaseModel):
    email: EmailStr


class OtpVerifyBody(BaseModel):
    email: EmailStr
    code: str


@router.post("/otp/request")
def otp_request(body: OtpRequestBody, request: Request):
    settings = get_settings(request)
    service = AuthService(settings)
    try:
        message = service.request_otp(email=str(body.email))
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception:
        logger.exception("otp_request_failed email=%s", body.email)
        return JSONResponse({"error": "Sign-in is temporarily unavailable."}, status_code=503)
    return {"ok": True, "message": message or OTP_REQUEST_MESSAGE}


@router.post("/otp/verify")
def otp_verify(body: OtpVerifyBody, request: Request):
    settings = get_settings(request)
    service = AuthService(settings)
    try:
        user, session_id = service.verify_otp(email=str(body.email), code=body.code)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception:
        logger.exception("otp_verify_failed email=%s", body.email)
        return JSONResponse({"error": "Sign-in is temporarily unavailable."}, status_code=503)

    response = JSONResponse({"ok": True, "user": {"email": user.email, "name": user.name}})
    set_session_cookie(response, settings, session_id)
    return response


@router.post("/logout")
def logout(request: Request):
    settings = get_settings(request)
    AuthService(settings).logout(get_session_id(request))
    response = JSONResponse({"ok": True})
    clear_session_cookie(response, settings)
    return response


@router.get("/me")
def me(request: Request, user: Optional[User] = Depends(get_optional_user)):
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, "user": {"email": user.email, "name": user.name}}


@router.get("/me/required")
def me_required(user: User = Depends(require_user)):
    return {"authenticated": True, "user": {"email": user.email, "name": user.name}}
