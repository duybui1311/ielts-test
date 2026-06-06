import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .service.config import settings
from .service.database import Base, engine
from .service import models  # noqa: F401  (registers tables)
from .routers import (
    auth, tests_io, autograde, analytics, student_flow,
    dashboard, me, flashcards, teacher,
    writing, speaking, review, ai_import, admin,
)

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="IELTS Platform API", version="0.1.0", lifespan=lifespan)

    origins = {
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
