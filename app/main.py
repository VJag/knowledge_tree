from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

load_dotenv(ROOT / ".env")

from app.config import Settings  # noqa: E402
from app.routes import auth, trees  # noqa: E402

settings = Settings.from_env()

app = FastAPI(title="KnowledgeTree", version="0.2.0")
app.state.settings = settings

app.include_router(auth.router)
app.include_router(trees.router)

app.mount("/css", StaticFiles(directory=WEB / "css"), name="css")
app.mount("/js", StaticFiles(directory=WEB / "js"), name="js")


@app.on_event("startup")
def startup() -> None:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required")
    from app.db import connect
    from app.schema_setup import apply_schema_and_migrations

    with connect(settings) as conn:
        apply_schema_and_migrations(conn)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "app": "knowledgetree",
        "email_configured": bool((settings.resend_api_key or "").strip() and (settings.email_from or "").strip()),
        "database_configured": bool(settings.database_url),
    }


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")
