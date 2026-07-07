"""Tiny in-process rate limiter.

Protects the paid Gemini/Claude calls (per-user window) and the auth endpoints
(per-IP window, brute-force protection). In-memory and per-process: good enough
for the single-instance test/pilot deploy; swap the store for Redis when the API
scales horizontally.
"""
import os
import time
import threading
from collections import deque

from fastapi import Depends, HTTPException, Request

from backend.service import models
from backend.service.auth_deps import get_current_user


class RateLimiter:
    """Sliding-window limiter: at most `max_calls` per `window_seconds` per key."""

    def __init__(self, max_calls: int, window_seconds: float,
                 message: str = "Too many AI requests. Please wait {retry}s and try again."):
        self.max_calls = max_calls
        self.window = window_seconds
        self.message = message
        self._hits: dict = {}
        self._lock = threading.Lock()

    def check(self, key) -> None:
        now = time.monotonic()
        with self._lock:
            dq = self._hits.setdefault(key, deque())
            while dq and now - dq[0] > self.window:
                dq.popleft()
            if len(dq) >= self.max_calls:
                retry = int(self.window - (now - dq[0])) + 1
                raise HTTPException(
                    429,
                    self.message.format(retry=retry),
                    headers={"Retry-After": str(retry)},
                )
            dq.append(now)


def rate_limit(max_calls: int, window_seconds: float):
    """FastAPI dependency factory: per-user window limit for an AI endpoint."""
    limiter = RateLimiter(max_calls, window_seconds)

    def _dep(user: models.User = Depends(get_current_user)) -> None:
        limiter.check(user.id)

    return _dep


def daily_quota(max_calls: int, what: str = "AI requests"):
    """Per-user 24-hour budget for endpoints that spend real money (Gemini /
    Claude calls). The short per-minute windows stop bursts; this stops one
    account from quietly draining the API key's whole daily allowance.

    In-memory like the rest of this module: a process restart resets the count,
    which fails open — acceptable for the current single-instance deploy."""
    limiter = RateLimiter(
        max_calls, 24 * 60 * 60,
        message=("Daily limit reached for " + what +
                 " — it resets within 24 hours. Ask your teacher if you need more."),
    )

    def _dep(user: models.User = Depends(get_current_user)) -> None:
        limiter.check(user.id)

    return _dep


def _client_ip(request: Request) -> str:
    """Best client identity available: first X-Forwarded-For hop (set by the
    Render/Cloudflare proxy) or the socket peer."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit_ip(max_calls: int, window_seconds: float,
                  message: str = "Too many attempts. Please wait {retry}s and try again."):
    """FastAPI dependency factory: per-IP window limit for unauthenticated
    endpoints (login/register brute-force protection).

    Set AUTH_RATE_LIMIT_DISABLED=1 to turn it off (used by the test suites,
    whose fixtures log in far more often than a human)."""
    limiter = RateLimiter(max_calls, window_seconds, message)

    def _dep(request: Request) -> None:
        if os.getenv("AUTH_RATE_LIMIT_DISABLED"):
            return
        limiter.check(_client_ip(request))

    return _dep


# ── Global per-IP limit, applied by middleware to every /api route ──────────
# Generous by design: the exam room autosaves every answer, so a real student
# produces bursts. This exists to stop scripts and floods, not humans.
# (The endpoint-specific limits above stay much tighter.)
GLOBAL_MAX_PER_MINUTE = int(os.getenv("GLOBAL_RATE_LIMIT_PER_MIN", "240"))

_global_limiter = RateLimiter(
    GLOBAL_MAX_PER_MINUTE, 60.0,
    message="Too many requests from your connection. Please wait {retry}s.",
)

# Paths probed by monitors/CI at machine frequency, or not part of the API.
_GLOBAL_EXEMPT = ("/api/health", "/api/ready")


def check_global_limit(request: Request) -> None:
    """Raise 429 when this client IP exceeds the global request budget.
    Honors AUTH_RATE_LIMIT_DISABLED so the test suites can hammer the app."""
    if os.getenv("AUTH_RATE_LIMIT_DISABLED"):
        return
    path = request.url.path
    if not path.startswith("/api") or path in _GLOBAL_EXEMPT:
        return
    _global_limiter.check(_client_ip(request))
