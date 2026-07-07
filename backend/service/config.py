import os
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env explicitly (this file lives in backend/service/), so config
# resolves the same way no matter the current working directory or how the app
# is launched (uvicorn from the repo root, pytest, a one-off script, etc.).
# A real environment variable still wins -load_dotenv does not override it.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv()  # fall back to a .env discovered from the CWD, if any


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

        # Deployment environment. Only an explicit "production" tightens the
        # startup checks below (a weak JWT secret / missing object storage become
        # fatal); anything else keeps the permissive local/dev posture so a
        # developer's machine still boots without cloud services configured.
        self.ENV = os.getenv("ENV", "").strip().lower()

    def check(self) -> tuple[list[str], list[str]]:
        """Validate configuration. Returns (fatal_errors, warnings).

        Called at app startup so misconfiguration fails fast with a clear message
        instead of surfacing as a confusing 500 on the first request. In
        production (ENV=production) the bar is higher: a weak JWT secret and
        missing object storage are fatal, not warnings.
        """
        # Local imports: these modules only read env vars, but importing them
        # lazily keeps config free of any import-time coupling to mailer/storage.
        from backend.service import mailer, storage

        fatal: list[str] = []
        warnings: list[str] = []
        is_prod = self.ENV == "production"

        if not self.DATABASE_URL:
            fatal.append("DATABASE_URL is not set -the app cannot reach the database.")

        # JWT secret is always required; in production a too-short secret is fatal
        # (not just a warning) so a weak signing key can never reach real users.
        if not self.JWT_SECRET:
            fatal.append("JWT_SECRET is not set -auth tokens cannot be signed or verified.")
        elif len(self.JWT_SECRET) < 32:
            msg = "JWT_SECRET is shorter than 32 characters -use a longer random secret."
            (fatal if is_prod else warnings).append(msg)

        if not os.getenv("GEMINI_API_KEY") and not os.getenv("ANTHROPIC_API_KEY"):
            warnings.append("No GEMINI_API_KEY/ANTHROPIC_API_KEY set -AI import/grading is disabled.")

        # Transactional email: without it, password-reset and verification links
        # are only written to the server log and never reach the user.
        if not mailer.is_configured():
            warnings.append(
                "Email is not configured (RESEND_API_KEY/MAIL_FROM) -password-reset and "
                "email-verification links will only be logged, not delivered to users.")

        # Object storage: in production, uploads MUST go to Supabase Storage. The
        # local /uploads dir on the container is ephemeral (wiped on every deploy
        # or restart), so a missing config would silently lose student uploads.
        if is_prod and not storage.is_configured():
            fatal.append(
                "SUPABASE_URL/SUPABASE_SERVICE_KEY are not set -in production, uploads "
                "must use Supabase Storage (the container's local disk is ephemeral).")

        return fatal, warnings


settings = Settings()
