from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str | None = None


@dataclass(frozen=True)
class TreeAccess:
    id: str
    owner_id: str
    name: str
    document: dict
    version: int
    role: str  # owner | edit | view
    updated_at: str
    owner_email: str | None = None
