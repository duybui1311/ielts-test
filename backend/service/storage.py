"""Supabase Storage helper.

Uploads bytes to a public bucket and returns the public URL, so uploads persist
online instead of on local disk. Buckets in use:
- "writing-charts"  — IELTS Task 1 chart/diagram images.
- "speaking-audio"  — student speaking recordings.

Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from the environment. The service
key can write to Storage, so it must stay server-side only (never ship it to the
browser). The supabase client is imported lazily so the app still boots before
`pip install -r backend/requirements.txt`.
"""
import os
import re
import uuid
from functools import lru_cache


def _normalize_public_url(url: str) -> str:
    """Repair public URLs returned by some supabase-py versions: a scheme with a
    missing colon ("https//host/..." -> "https://host/...") and a stray trailing
    "?". A malformed scheme makes the browser treat the URL as a relative path."""
    url = re.sub(r"^(https?)//", r"\1://", url.strip())
    return url.rstrip("?")


class StorageNotConfigured(RuntimeError):
    """Raised when Supabase Storage env vars (or the client lib) are missing."""


def is_configured() -> bool:
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY"))


@lru_cache(maxsize=1)
def _client():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise StorageNotConfigured(
            "Supabase Storage is not configured. Add SUPABASE_URL and "
            "SUPABASE_SERVICE_KEY to backend/.env, then restart the backend."
        )
    try:
        from supabase import create_client  # lazy
    except ImportError as e:
        raise StorageNotConfigured(
            "Storage dependencies are missing. Run: pip install -r backend/requirements.txt"
        ) from e
    return create_client(url, key)


def upload_bytes(
    bucket: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    ext: str = "",
) -> str:
    """Upload `data` to `bucket` under a random object name and return its
    public URL. Raises StorageNotConfigured if Storage isn't set up."""
    client = _client()
    name = f"{uuid.uuid4().hex}{ext}"
    client.storage.from_(bucket).upload(
        name, data, {"content-type": content_type, "upsert": "true"},
    )
    return _normalize_public_url(client.storage.from_(bucket).get_public_url(name))
