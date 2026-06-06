import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self):
        url = os.getenv("DATABASE_URL", "")
        # SQLAlchemy needs the +psycopg2 driver tag on the scheme.
        if url.startswith("postgres://"):
            url = "postgresql+psycopg2://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and "+psycopg2" not in url:
            url = "postgresql+psycopg2://" + url[len("postgresql://"):]
        self.DATABASE_URL = url

        self.API_HOST = os.getenv("API_HOST", "0.0.0.0")
        self.API_PORT = int(os.getenv("API_PORT", "8000"))
        self.FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

        # When true, students see AI grades immediately (no teacher approval needed).
        self.AI_GRADES_AUTO_VISIBLE = os.getenv("AI_GRADES_AUTO_VISIBLE", "false").lower() in ("1", "true", "yes")

        # Secret used to sign/verify JWT access tokens. Required for auth.
        self.JWT_SECRET = os.getenv("JWT_SECRET", "")


settings = Settings()
