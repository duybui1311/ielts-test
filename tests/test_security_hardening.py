"""Security hardening: input sanitization, request guards, rate limits, and
secret scrubbing."""
import logging
import os

import pytest

from backend.service.ratelimit import RateLimiter
from backend.service.sanitize import MAX_JSON_BODY_BYTES, clean_text
from backend.service.secrets_guard import SecretScrubFilter, scrub_text


# ── sanitize.clean_text ──────────────────────────────────────────────────────

def test_clean_text_strips_control_chars_keeps_newlines():
    assert clean_text("hello\x00world") == "helloworld"
    assert clean_text("a\x1b[31mred\x1b[0m") == "a[31mred[0m"
    assert clean_text("line1\r\nline2\rline3") == "line1\nline2\nline3"
    assert clean_text("  keep\tnew\nlines  ") == "keep\tnew\nlines"
    assert clean_text(123) == 123  # non-strings pass through


# ── API boundary: sanitized models ───────────────────────────────────────────

def _register(client, email="san@x.io"):
    r = client.post("/api/auth/register",
                    json={"email": email, "password": "studentpass1",
                          "full_name": "Neat\x00 \x07Name"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user_id"]


def test_register_strips_control_chars_from_name(client):
    sh, uid = _register(client)
    me = client.get("/api/me", headers=sh)
    assert me.status_code == 200
    assert me.json()["full_name"] == "Neat Name"


def test_oversized_answer_is_rejected_422(client):
    sh, _ = _register(client, "san2@x.io")
    r = client.post("/api/attempts/1/answer",
                    json={"question_id": 1, "value_text": "x" * 6000},
                    headers=sh)
    assert r.status_code == 422  # length cap fires before any DB access


def test_oversized_json_body_rejected_413(client):
    r = client.post(
        "/api/auth/login",
        content=b'{"email": "' + b"a" * (MAX_JSON_BODY_BYTES + 10) + b'"}',
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 413


# ── Rate limiting ────────────────────────────────────────────────────────────

def test_rate_limiter_sliding_window():
    limiter = RateLimiter(3, 60)
    for _ in range(3):
        limiter.check("k")
    with pytest.raises(Exception) as e:
        limiter.check("k")
    assert e.value.status_code == 429
    assert "Retry-After" in (e.value.headers or {})


def test_global_limit_applies_to_api_routes(client, monkeypatch):
    from backend.service import ratelimit
    # The conftest disables limits for the suites; re-enable for this test and
    # swap in a tiny budget so it trips fast.
    monkeypatch.delenv("AUTH_RATE_LIMIT_DISABLED", raising=False)
    monkeypatch.setattr(ratelimit, "_global_limiter", RateLimiter(3, 60))
    for _ in range(3):
        assert client.get("/api/exams").status_code in (401, 403)  # counted
    r = client.get("/api/exams")
    assert r.status_code == 429
    # health stays exempt so monitors never get locked out
    assert client.get("/api/health").status_code == 200


def test_daily_quota_message_mentions_reset():
    from backend.service.ratelimit import daily_quota  # noqa: F401 (import works)
    limiter = RateLimiter(1, 24 * 60 * 60,
                          message="Daily limit reached for AI explanations "
                                  "— it resets within 24 hours.")
    limiter.check("u1")
    with pytest.raises(Exception) as e:
        limiter.check("u1")
    assert "Daily limit" in str(e.value.detail)


# ── Secret scrubbing ─────────────────────────────────────────────────────────

def test_scrub_text_redacts_secret_env_values(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "AIzaSyFAKEFAKEFAKE123")
    msg = "google error: url https://api?key=AIzaSyFAKEFAKEFAKE123 failed"
    assert "AIzaSyFAKEFAKEFAKE123" not in scrub_text(msg)
    assert "[REDACTED]" in scrub_text(msg)


def test_log_filter_redacts_records(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-FAKEFAKE-99999999")
    record = logging.LogRecord(
        "t", logging.ERROR, __file__, 1,
        "boom: sk-ant-FAKEFAKE-99999999 leaked", args=(), exc_info=None,
    )
    SecretScrubFilter().filter(record)
    assert "sk-ant-FAKEFAKE-99999999" not in record.getMessage()
    assert "[REDACTED]" in record.getMessage()
