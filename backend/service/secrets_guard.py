"""Keep API keys and other secrets out of anything a human (or Sentry) reads.

The keys themselves only ever live in environment variables — they are never
sent to the client (endpoints return "not configured" messages, not values).
This module guards the remaining leak path: log lines and error reports that
might embed a secret (e.g. an exception whose message contains a request URL
with ?key=... in it).
"""
import logging
import os

# Environment variables whose values must never appear in logs or Sentry.
_SECRET_ENV_VARS = (
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "SUPABASE_SERVICE_KEY",
    "JWT_SECRET",
    "RESEND_API_KEY",
    "DATABASE_URL",       # contains the DB password
    "SENTRY_DSN",
)


def _secret_values() -> list[str]:
    # Read at call time (not import time) so late-loaded .env values are seen.
    return [v for name in _SECRET_ENV_VARS if (v := os.getenv(name)) and len(v) >= 8]


def scrub_text(text: str) -> str:
    """Replace any embedded secret value with a redaction marker."""
    for value in _secret_values():
        if value in text:
            text = text.replace(value, "[REDACTED]")
    return text


class SecretScrubFilter(logging.Filter):
    """Logging filter that redacts secret values from every record it sees."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
            scrubbed = scrub_text(msg)
            if scrubbed != msg:
                record.msg = scrubbed
                record.args = ()
        except Exception:  # noqa: BLE001 — never let scrubbing break logging
            pass
        return True


def sentry_before_send(event, hint):
    """Sentry hook: redact secrets from exception messages and log entries."""
    try:
        for exc in (event.get("exception", {}) or {}).get("values", []) or []:
            if exc.get("value"):
                exc["value"] = scrub_text(exc["value"])
        if event.get("logentry", {}).get("message"):
            event["logentry"]["message"] = scrub_text(event["logentry"]["message"])
        if event.get("message"):
            event["message"] = scrub_text(event["message"])
    except Exception:  # noqa: BLE001
        pass
    return event


def install_log_scrubbing() -> None:
    """Attach the scrub filter to the root logger's handlers and to the root
    logger itself, so every propagated record is covered."""
    f = SecretScrubFilter()
    root = logging.getLogger()
    root.addFilter(f)
    for handler in root.handlers:
        handler.addFilter(f)
