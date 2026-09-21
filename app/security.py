from __future__ import annotations

import hashlib
import secrets


def hash_otp(secret_key: str, code: str) -> str:
    material = f"{secret_key}:otp:{code.strip()}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_session_id() -> str:
    return secrets.token_urlsafe(32)
