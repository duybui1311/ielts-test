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


def test_ip_limiter_blocks_and_message():
    import os
    from backend.service.ratelimit import rate_limit_ip

    class _Req:
        headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.1"}
        client = None

    os.environ.pop("AUTH_RATE_LIMIT_DISABLED", None)
    dep = rate_limit_ip(2, 60, "Too many sign-in attempts. Please wait {retry}s and try again.")
    try:
        dep(_Req()); dep(_Req())
        with pytest.raises(HTTPException) as exc:
            dep(_Req())
        assert exc.value.status_code == 429
        assert "sign-in" in exc.value.detail
    finally:
        os.environ["AUTH_RATE_LIMIT_DISABLED"] = "1"


def test_ip_limiter_disabled_via_env():
    import os
    from backend.service.ratelimit import rate_limit_ip

    class _Req:
        headers = {}
        client = None

    os.environ["AUTH_RATE_LIMIT_DISABLED"] = "1"
    dep = rate_limit_ip(1, 60)
    for _ in range(5):
        dep(_Req())  # never raises while disabled
