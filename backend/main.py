import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from .service.config import settings
from .service.database import Base, engine
from .service import models  # noqa: F401  (registers tables)
from .routers import (
    auth, tests_io, autograde, analytics, student_flow,
    dashboard, me, flashcards, teacher,
    writing, speaking, review, ai_import, admin,
    questions, practice,
)

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"

logger = logging.getLogger("backend")


# Idempotent schema tweaks applied on startup. `create_all` only creates missing
# tables — it never alters existing ones or adds indexes — so post-hoc columns and
# performance indexes are applied here (Postgres supports IF NOT EXISTS for both).
# Until Alembic is adopted (see backend/migrations/), this is the schema-evolution
# path for the live database.
_SCHEMA_MIGRATIONS = [
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT",
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS support_sentences JSON",
    # Indexes for the analytics / weakness-heatmap / spaced-review hot paths.
    # Postgres does not auto-index foreign-key columns, so these matter as data grows.
    "CREATE INDEX IF NOT EXISTS ix_error_tags_user_exam ON error_tags (user_id, exam_id)",
    "CREATE INDEX IF NOT EXISTS ix_exam_attempts_user ON exam_attempts (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_review_queue_user_due ON review_queue (user_id, due_date)",
    "CREATE INDEX IF NOT EXISTS ix_practice_sessions_user ON practice_sessions (user_id)",
]


def _init_sentry() -> None:
    """Enable Sentry error tracking when SENTRY_DSN is set (no-op otherwise)."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=dsn,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            environment=os.getenv("ENV", "production"),
        )
        logger.info("Sentry error tracking enabled.")
    except Exception:  # noqa: BLE001
        logger.warning("SENTRY_DSN is set but Sentry init failed", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast on misconfiguration instead of a confusing 500 on first request.
    fatal, warnings = settings.check()
    for w in warnings:
        logger.warning("Config: %s", w)
    if fatal:
        for f in fatal:
            logger.error("Config: %s", f)
        raise RuntimeError("Invalid configuration: " + " ".join(fatal))

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for stmt in _SCHEMA_MIGRATIONS:
            try:
                conn.execute(text(stmt))
            except Exception:  # noqa: BLE001 — non-Postgres or already applied
                pass
    yield


def create_app() -> FastAPI:
    _init_sentry()
    app = FastAPI(title="IELTS Platform API", version="0.1.0", lifespan=lifespan)

    # Browsers send the Origin header with no trailing slash, so a configured
    # FRONTEND_URL like "https://app.pages.dev/" would never match. Normalize it.
    # FRONTEND_URL may also be a comma-separated list (e.g. the Cloudflare prod
    # domain plus a preview domain), so split and normalize each entry.
    configured = [u.strip().rstrip("/") for u in (settings.FRONTEND_URL or "").split(",")]
    origins = set(configured) | {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",      # Vite dev default
        "http://127.0.0.1:5173",
    }
    origins.discard("")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Last-resort error handling: log the real cause server-side and return a
    # clean JSON 500 so no stack trace or DB detail leaks to the client. Routes
    # keep raising HTTPException for expected errors (handled by FastAPI itself);
    # these only catch the unexpected.
    @app.exception_handler(SQLAlchemyError)
    async def _on_db_error(request: Request, exc: SQLAlchemyError):
        logger.exception("Database error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @app.exception_handler(Exception)
    async def _on_unhandled_error(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    # Baseline security headers on every response. HSTS is intentionally left to
    # the TLS-terminating proxy (Render) so local HTTP dev isn't affected.
    @app.middleware("http")
    async def _security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        return response

    app.include_router(auth.router)
    app.include_router(tests_io.router)
    app.include_router(autograde.router)
    app.include_router(analytics.router)
    app.include_router(student_flow.router)
    app.include_router(dashboard.router)
    app.include_router(me.router)
    app.include_router(flashcards.router)
    app.include_router(teacher.router)
    app.include_router(writing.router)
    app.include_router(speaking.router)
    app.include_router(review.router)
    app.include_router(ai_import.router)
    app.include_router(admin.router)
    app.include_router(questions.router)
    app.include_router(practice.router)

    # Serve uploaded speaking audio.
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

    @app.get("/api/health")
    async def health_check():
        """Liveness: the process is up (does not touch the database)."""
        return {"status": "ok"}

    @app.get("/api/ready")
    async def readiness_check():
        """Readiness: the process is up AND the database is reachable."""
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return {"status": "ready"}
        except Exception:  # noqa: BLE001
            logger.warning("Readiness check failed", exc_info=True)
            return JSONResponse(status_code=503, content={"status": "not ready"})

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
