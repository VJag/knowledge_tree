from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.db import get_conn
from app.models import User
from app.security import generate_otp_code, hash_otp, new_session_id
from app.services.email_service import EmailDeliveryError, EmailService

logger = logging.getLogger("knowledgetree.auth")

OTP_REQUEST_MESSAGE = "If that email is valid, we sent a sign-in code."


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class AuthService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def request_otp(self, *, email: str) -> str:
        normalized = _normalize_email(email)
        if "@" not in normalized:
            raise ValueError("Enter a valid email address.")

        now = _utc_now()
        code = generate_otp_code()
        code_hash = hash_otp(self.settings.secret_key, code)
        expires_at = now + timedelta(minutes=self.settings.otp_ttl_minutes)

        window = timedelta(minutes=15)
        with get_conn(self.settings) as conn:
            row = conn.execute(
                """
                SELECT window_start, request_count
                FROM otp_codes
                WHERE email = %s
                """,
                (normalized,),
            ).fetchone()

            if row and _as_utc(row["window_start"]) > now - window:
                if int(row["request_count"]) >= 5:
                    raise ValueError("Too many codes requested. Try again in a few minutes.")
                window_start = _as_utc(row["window_start"])
                request_count = int(row["request_count"]) + 1
            else:
                window_start = now
                request_count = 1

            conn.execute(
                """
                INSERT INTO otp_codes (
                  email, code_hash, expires_at, used_at, window_start, request_count, updated_at
                )
                VALUES (%s, %s, %s, NULL, %s, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                  code_hash = EXCLUDED.code_hash,
                  expires_at = EXCLUDED.expires_at,
                  used_at = NULL,
                  window_start = EXCLUDED.window_start,
                  request_count = EXCLUDED.request_count,
                  updated_at = EXCLUDED.updated_at
                """,
                (normalized, code_hash, expires_at, window_start, request_count, now),
            )
            conn.commit()

        try:
            EmailService(self.settings).send_otp(
                to_email=normalized,
                code=code,
                ttl_minutes=self.settings.otp_ttl_minutes,
            )
        except EmailDeliveryError:
            logger.exception("otp_email_failed email=%s", normalized)
            raise ValueError("Email could not be sent. Check Resend configuration.") from None

        logger.info("otp_requested email=%s", normalized)
        return OTP_REQUEST_MESSAGE

    def verify_otp(self, *, email: str, code: str) -> tuple[User, str]:
        normalized = _normalize_email(email)
        raw_code = (code or "").strip()
        if "@" not in normalized or len(raw_code) != 6 or not raw_code.isdigit():
            raise ValueError("Invalid or expired code.")

        now = _utc_now()
        code_hash = hash_otp(self.settings.secret_key, raw_code)

        with get_conn(self.settings) as conn:
            row = conn.execute(
                """
                SELECT email FROM otp_codes
                WHERE email = %s
                  AND code_hash = %s
                  AND used_at IS NULL
                  AND expires_at > %s
                """,
                (normalized, code_hash, now),
            ).fetchone()
            if not row:
                raise ValueError("Invalid or expired code.")

            conn.execute(
                "UPDATE otp_codes SET used_at = %s, updated_at = %s WHERE email = %s",
                (now, now, normalized),
            )

            user_row = conn.execute(
                "SELECT id, email, name FROM users WHERE LOWER(email) = LOWER(%s)",
                (normalized,),
            ).fetchone()
            if not user_row:
                user_row = conn.execute(
                    """
                    INSERT INTO users (email) VALUES (%s)
                    RETURNING id, email, name
                    """,
                    (normalized,),
                ).fetchone()

            conn.execute("DELETE FROM sessions WHERE expires_at <= %s", (now,))

            session_id = new_session_id()
            expires_at = now + timedelta(hours=self.settings.session_ttl_hours)
            conn.execute(
                """
                INSERT INTO sessions (id, user_id, expires_at)
                VALUES (%s, %s, %s)
                """,
                (session_id, user_row["id"], expires_at),
            )
            conn.commit()

        user = User(id=str(user_row["id"]), email=user_row["email"], name=user_row.get("name"))
        logger.info("otp_verified email=%s", normalized)
        return user, session_id

    def logout(self, session_id: str | None) -> None:
        if not session_id:
            return
        with get_conn(self.settings) as conn:
            conn.execute("DELETE FROM sessions WHERE id = %s", (session_id,))
            conn.commit()

    def current_user(self, session_id: str | None) -> User | None:
        if not session_id:
            return None
        now = _utc_now()
        with get_conn(self.settings) as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at <= %s", (now,))
            row = conn.execute(
                """
                SELECT u.id, u.email, u.name
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.id = %s AND s.expires_at > %s
                """,
                (session_id, now),
            ).fetchone()
            conn.commit()
            if not row:
                return None
            return User(id=str(row["id"]), email=row["email"], name=row.get("name"))
