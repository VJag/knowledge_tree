#!/usr/bin/env python3
"""Capture KnowledgeTree screenshots for docs / social posts."""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "screenshots"
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from app.config import Settings  # noqa: E402
from app.db import get_conn  # noqa: E402
from app.security import new_session_id  # noqa: E402

BASE = "http://127.0.0.1:8000"
DEMO_EMAIL = "demo@knowledgetree.local"
STORAGE_KEY = f"knowledgetree.workspace.v1:user:{DEMO_EMAIL}"


def ensure_demo_session(settings: Settings) -> str:
    session_id = new_session_id()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=24)
    with get_conn(settings) as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE LOWER(email) = LOWER(%s)",
            (DEMO_EMAIL,),
        ).fetchone()
        if row:
            user_id = row["id"]
        else:
            user_id = conn.execute(
                "INSERT INTO users (email, name) VALUES (%s, %s) RETURNING id",
                (DEMO_EMAIL, "Demo User"),
            ).fetchone()["id"]
        conn.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
        conn.execute(
            "INSERT INTO sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
            (session_id, user_id, expires),
        )
        conn.commit()
    return session_id


def demo_workspace() -> dict:
    tree_id = f"t-{uuid.uuid4()}"
    root_id = f"r-{uuid.uuid4()}"

    def topic(name, level=0, suggested=False, children=None, notes=None, transitions=None):
        return {
            "id": f"n-{uuid.uuid4()}",
            "name": name,
            "level": level,
            "suggested": suggested,
            "children": children or [],
            "notes": notes or [],
            "transitions": transitions or [],
        }

    ai_tree = {
        "id": tree_id,
        "name": "AI engineering",
        "root": {"id": root_id, "name": "AI engineering"},
        "sample": True,
        "topics": [
            topic(
                "RAG",
                1,
                children=[
                    topic("Embeddings", 2),
                    topic("Chunking", 3),
                    topic("Retrieval evaluation", 0, suggested=True),
                ],
            ),
            topic(
                "Prompt engineering",
                3,
                children=[
                    topic("Few-shot prompting", 1),
                    topic("Loop engineering", 0, suggested=True),
                ],
            ),
        ],
    }

    db_tree = {
        "id": f"t-{uuid.uuid4()}",
        "name": "Databases",
        "root": {"id": f"r-{uuid.uuid4()}", "name": "Databases"},
        "sample": True,
        "topics": [
            topic(
                "Relational databases",
                2,
                children=[
                    topic("SQL queries", 3),
                    topic(
                        "Indexes",
                        1,
                        children=[
                            topic("B-tree indexes", 1),
                            topic("Query plans", 0, suggested=True),
                        ],
                    ),
                ],
            ),
        ],
    }

    return {
        "version": 1,
        "activeIndex": 0,
        "trees": [ai_tree, db_tree],
        "view": {},
        "ui": {"sidebarCollapsed": False},
    }


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Install playwright: .venv/bin/pip install playwright && .venv/bin/playwright install chromium")
        return 1

    settings = Settings.from_env()
    session_id = ensure_demo_session(settings)
    OUT.mkdir(parents=True, exist_ok=True)

    viewport = {"width": 1440, "height": 900}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport=viewport, device_scale_factor=2)
        page = context.new_page()

        # 1. Landing page
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "01-landing.png"), full_page=False)

        # 2. Signed-in workspace
        context.add_cookies(
            [
                {
                    "name": settings.session_cookie_name,
                    "value": session_id,
                    "domain": "127.0.0.1",
                    "path": "/",
                    "httpOnly": True,
                    "sameSite": "Lax",
                }
            ]
        )
        page.evaluate(
            """([key, workspace]) => localStorage.setItem(key, JSON.stringify(workspace))""",
            [STORAGE_KEY, demo_workspace()],
        )
        page.goto(BASE, wait_until="networkidle")
        page.wait_for_selector("#appShell:not([hidden])", timeout=15000)
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / "02-workspace-canvas.png"), full_page=False)

        # 3. Select a topic (inspector visible)
        page.locator(".node:not(.root):not(.ghost-add)").first.click()
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "03-topic-inspector.png"), full_page=False)

        # 4. Topic workspace dialog (advance learning stage)
        page.locator(".node:not(.root) .n-stage").first.click()
        page.wait_for_selector("#topicWorkspaceDialog[open]", timeout=5000)
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "04-topic-workspace.png"), full_page=False)
        page.locator("#twCancel").click()

        # 5. Create tree dialog (shows samples + JSON import)
        page.locator("#newTreeBtn").click()
        page.wait_for_selector("#createDialog[open]", timeout=5000)
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "05-create-tree-dialog.png"), full_page=False)
        page.locator("#createDialog .dialog-close").click()
        page.locator("#inspClose").click()
        page.wait_for_timeout(300)

        # 6. Help page
        page.locator("#topMenuBtn").click()
        page.locator("#helpMenuItem").click()
        page.wait_for_selector("#helpView:not([hidden])", timeout=5000)
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "06-help.png"), full_page=False)

        browser.close()

    print(f"Screenshots saved to {OUT}/")
    for path in sorted(OUT.glob("*.png")):
        print(f"  - {path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
