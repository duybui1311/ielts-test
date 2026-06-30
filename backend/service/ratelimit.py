"""Tiny in-process rate limiter for the paid-LLM endpoints.

Protects the Gemini/Claude calls (cost + abuse) with a per-user fixed window.
In-memory and per-process: good enough for the single-instance test/pilot deploy;
swap the store for Redis when the API scales horizontally.
"""
import time
import threading
from collections import deque

from fastapi import Depends, HTTPException

from backend.service import models
from backend.service.auth_deps import get_current_user


class RateLimiter:
    """Sliding-window limiter: at most `max_calls` per `window_seconds` per key."""

    def __init__(self, max_calls: int, window_seconds: float):
        self.max_calls = max_calls
        self.window = window_seconds
        self._hits: dict[int, deque] = {}
        self._lock = threading.Lock()

    def check(self, key: int) -> None:
        now = time.monotonic()
        with self._lock:
            dq = self._hits.setdefault(key, deque())
            while dq and now - dq[0] > self.window:
                dq.popleft()
            if len(dq) >= self.max_calls:
                retry = int(self.window - (now - dq[0])) + 1
                raise HTTPException(
                    429,
                    f"Too many AI requests. Please wait {retry}s and try again.",
                    headers={"Retry-After": str(retry)},
                )
            dq.append(now)


def rate_limit(max_calls: int, window_seconds: float):
    """FastAPI dependency factory: per-user window limit for an AI endpoint."""
    limiter = RateLimiter(max_calls, window_seconds)

    def _dep(user: models.User = Depends(get_current_user)) -> None:
        limiter.check(user.id)

    return _dep
