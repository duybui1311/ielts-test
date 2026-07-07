import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from .service.config import settings
from .service.database import engine
from .service import models  # noqa: F401  (registers tables for Alembic autogenerate)
from .service.ratelimit import check_global_limit
from .service.sanitize import MAX_JSON_BODY_BYTES
from .service.secrets_guard import install_log_scrubbing, sentry_before_send
from .routers import (
    auth, tests_io, autograde, analytics, student_flow,
    dashboard, me, flashcards, teacher,
    writing, speaking, review, ai_import, admin,
    questions, practice, report,
)

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"

logger = logging.getLogger("backend")


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
            send_default_pii=False,          # never ship user PII with events
            before_send=sentry_before_send,  # redact any embedded secrets
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

    # Schema is owned by Alembic now — migrations run at deploy time via the Docker
    # entrypoint (`alembic upgrade head`), not on app startup. See docs/MIGRATIONS.md.
    yield


def create_app() -> FastAPI:
    install_log_scrubbing()   # keep API keys/DB passwords out of every log line
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

    # Global flood protection + oversized-body rejection, before any parsing.
    # Endpoint-specific limits (auth per-IP, AI per-user + daily quotas) stay
    # much tighter; this is the outer wall for everything else.
    @app.middleware("http")
    async def _request_guards(request: Request, call_next):
        try:
            check_global_limit(request)
        except HTTPException as exc:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
                headers=exc.headers or {},
            )
        if request.method in ("POST", "PUT", "PATCH"):
            ctype = request.headers.get("content-type", "")
            length = request.headers.get("content-length")
            if "application/json" in ctype and length and length.isdigit() \
                    and int(length) > MAX_JSON_BODY_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body is too large."},
                )
        return await call_next(request)

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
    app.include_router(report.router)

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
