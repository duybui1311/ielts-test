"""Startup config validation (`Settings.check`).

Production (ENV=production) raises the bar: a too-short JWT secret and missing
object storage become *fatal* (block startup) instead of warnings. Outside
production the same conditions are only warnings so a dev machine still boots.
"""
from backend.service.config import Settings

# Env vars that must be cleared per-test so each case sees exactly what it sets.
_ISOLATED = (
    "ENV", "JWT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_KEY",
    "RESEND_API_KEY", "MAIL_FROM", "GEMINI_API_KEY", "ANTHROPIC_API_KEY",
)


def _fresh_settings(monkeypatch, **env):
    for k in _ISOLATED:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://u:p@localhost:5432/db")
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return Settings()


def test_short_jwt_is_only_a_warning_in_dev(monkeypatch):
    fatal, warnings = _fresh_settings(monkeypatch, JWT_SECRET="short").check()
    assert not any("JWT_SECRET" in f for f in fatal)
    assert any("JWT_SECRET" in w for w in warnings)


def test_short_jwt_is_fatal_in_production(monkeypatch):
    fatal, _ = _fresh_settings(monkeypatch, ENV="production", JWT_SECRET="short").check()
    assert any("JWT_SECRET" in f for f in fatal)


def test_missing_storage_is_fatal_in_production(monkeypatch):
    fatal, _ = _fresh_settings(monkeypatch, ENV="production", JWT_SECRET="x" * 40).check()
    assert any("SUPABASE" in f for f in fatal)


def test_missing_storage_is_fine_outside_production(monkeypatch):
    fatal, _ = _fresh_settings(monkeypatch, JWT_SECRET="x" * 40).check()
    assert not any("SUPABASE" in f for f in fatal)


def test_storage_configured_clears_the_fatal_in_production(monkeypatch):
    fatal, _ = _fresh_settings(
        monkeypatch, ENV="production", JWT_SECRET="x" * 40,
        SUPABASE_URL="https://x.supabase.co", SUPABASE_SERVICE_KEY="svc",
    ).check()
    assert not any("SUPABASE" in f for f in fatal)


def test_unconfigured_email_warns(monkeypatch):
    _, warnings = _fresh_settings(monkeypatch, JWT_SECRET="x" * 40).check()
    assert any("Email is not configured" in w for w in warnings)


def test_configured_email_does_not_warn(monkeypatch):
    _, warnings = _fresh_settings(
        monkeypatch, JWT_SECRET="x" * 40,
        RESEND_API_KEY="re_123", MAIL_FROM="Bandly <no-reply@bandly.app>",
    ).check()
    assert not any("Email is not configured" in w for w in warnings)
