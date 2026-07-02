import pytest
from fastapi import HTTPException

from backend.service.ratelimit import RateLimiter


def test_allows_up_to_limit():
    rl = RateLimiter(3, 60)
    rl.check(1)
    rl.check(1)
    rl.check(1)  # 3 allowed within window


def test_blocks_over_limit_with_429():
    rl = RateLimiter(2, 60)
    rl.check(7)
    rl.check(7)
    with pytest.raises(HTTPException) as exc:
        rl.check(7)
    assert exc.value.status_code == 429


def test_keys_are_independent():
    rl = RateLimiter(1, 60)
    rl.check(1)
    rl.check(2)  # different user not affected
    with pytest.raises(HTTPException):
        rl.check(1)
