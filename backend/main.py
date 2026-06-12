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


# Columns added to existing tables after the original schema. `create_all` only
# creates missing tables, never alters existing ones, so we add them idempotently
# here (Postgres supports ADD COLUMN IF NOT EXISTS).
_COLUMN_MIGRATIONS = [
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT",
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS support_sentences JSON",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for stmt in _COLUMN_MIGRATIONS:
            try:
                conn.execute(text(stmt))
            except Exception:  # noqa: BLE001 — non-Postgres or already applied
                pass
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="IELTS Platform API", version="0.1.0", lifespan=lifespan)

    # Browsers send the Origin header with no trailing slash, so a configured
    # FRONTEND_URL like "https://app.pages.dev/" would never match. Normalize it.
    origins = {
        (settings.FRONTEND_URL or "").rstrip("/"),
        "http://localhost:3000",
        "http://127.0.0.1:3000",
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
        return {"status": "ok"}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
