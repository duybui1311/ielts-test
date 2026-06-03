from __future__ import annotations
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

try:
    import redis  # type: ignore
    from redis.exceptions import RedisError, ConnectionError  # type: ignore
except ImportError:
    redis = None
    RedisError = Exception
    ConnectionError = Exception
logger = logging.getLogger(__name__)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_redis_client: Optional["redis.Redis"] = None
_redis_broken: bool = False
_IN_MEMORY: Dict[str, Any] = {}

def _get_client() -> Optional["redis.Redis"]:
    """Return a working Redis client or None (fallback)."""
    global _redis_client, _redis_broken
    if _redis_broken:
        return None
    if _redis_client is None and redis is not None:
        try:
            _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            _redis_client.ping()
            logger.info("Connected to Redis at %s", REDIS_URL)
        except Exception as e:
            logger.warning(
                "Redis unavailable (%s). Falling back to in-memory cache only.", e
            )
            _redis_client = None
            _redis_broken = True
    return _redis_client

def _answers_key(attempt_id: int, station_attempt_id: int) -> str:
    return f"attempt:{attempt_id}:station:{station_attempt_id}:answers"

def _msgs_key(attempt_id: int, station_attempt_id: int) -> str:
    return f"attempt:{attempt_id}:station:{station_attempt_id}:msgs"

# ---------- Answers draft API ----------
def draft_save_answer(
    attempt_id: int,
    station_attempt_id: int,
    qid: int,
    value: Any,
) -> None:
    key = _answers_key(attempt_id, station_attempt_id)
    payload = json.dumps(value)
    client = _get_client()
    if client is not None:
        try:
            client.hset(key, str(qid), payload)
            return
        except (RedisError, ConnectionError) as e:
            logger.warning("draft_save_answer: Redis error (%s). Using in-memory.", e)
    bucket = _IN_MEMORY.setdefault(key, {})
    bucket[str(qid)] = payload  # type: ignore[assignment]

def draft_get_answers(
    attempt_id: int,
    station_attempt_id: int,
) -> Dict[int, Any]:
    key = _answers_key(attempt_id, station_attempt_id)
    client = _get_client()
    raw: Dict[str, str] = {}
    if client is not None:
        try:
            raw = client.hgetall(key) or {}
        except (RedisError, ConnectionError) as e:
            logger.warning("draft_get_answers: Redis error (%s). Using in-memory.", e)
    if not raw:
        raw = _IN_MEMORY.get(key, {}) or {}
    out: Dict[int, Any] = {}
    for k, v in raw.items():
        try:
            qid = int(k)
        except ValueError:
            continue
        try:
            out[qid] = json.loads(v)
        except Exception:
            out[qid] = v

    return out

# ---------- Chat draft API ----------
def draft_append_msg(
    attempt_id: int,
    station_attempt_id: int,
    side: str,
    text: str,
) -> Dict[str, Any]:
    key = _msgs_key(attempt_id, station_attempt_id)
    msg = {
        "id": int(time.time() * 1000),
        "side": side,
        "text": text,
    }
    payload = json.dumps(msg)

    client = _get_client()
    if client is not None:
        try:
            client.rpush(key, payload)
            return msg
        except (RedisError, ConnectionError) as e:
            logger.warning("draft_append_msg: Redis error (%s). Using in-memory.", e)

    bucket = _IN_MEMORY.setdefault(key, [])
    bucket.append(payload)
    return msg

def draft_get_msgs(
    attempt_id: int,
    station_attempt_id: int,
) -> List[Dict[str, Any]]:
    key = _msgs_key(attempt_id, station_attempt_id)
    client = _get_client()

    raw_list: List[str] = []
    if client is not None:
        try:
            raw_list = client.lrange(key, 0, -1) or []
        except (RedisError, ConnectionError) as e:
            logger.warning("draft_get_msgs: Redis error (%s). Using in-memory.", e)

    if not raw_list:
        raw_list = _IN_MEMORY.get(key, []) or []

    msgs: List[Dict[str, Any]] = []
    for item in raw_list:
        try:
            m = json.loads(item)
            if isinstance(m, dict):
                msgs.append(m)
        except Exception:
            continue
    return msgs

# ---------- Clear all drafts for an attempt ----------
def draft_clear_attempt(attempt_id: int) -> None:
    prefix = f"attempt:{attempt_id}:station:"
    client = _get_client()

    if client is not None:
        try:
            to_delete: List[str] = []
            for key in client.scan_iter(match=f"{prefix}*"):
                to_delete.append(key)
            if to_delete:
                client.delete(*to_delete)
        except (RedisError, ConnectionError) as e:
            logger.warning("draft_clear_attempt: Redis error (%s).", e)

    to_del = [k for k in list(_IN_MEMORY.keys()) if k.startswith(prefix)]
    for k in to_del:
        _IN_MEMORY.pop(k, None)