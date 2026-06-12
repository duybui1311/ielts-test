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


def normalize_public_base(raw: str | None) -> str:
    """Return a well-formed absolute base URL for SUPABASE_URL, or "" if unset.

    Guards the known malformed-URL cases so a stored public URL is always a
    valid absolute link (never a browser-relative path):
    - repairs a colon-less scheme ("https//host" -> "https://host");
    - adds a missing scheme to a bare host ("host" -> "https://host");
    - strips any trailing slash.

    Mirrors the frontend mediaUrl() and scripts/repair_media_urls.clean_media_url
    repair logic so stored values, the rendered src and any DB backfill agree.
    """
    base = (raw or "").strip().rstrip("/")
    if not base:
        return ""
    # Restore a missing scheme colon: "https//host" -> "https://host".
    base = re.sub(r"^(https?)//", r"\1://", base, flags=re.IGNORECASE)
    if not base.lower().startswith(("http://", "https://")):
        base = f"https://{base}"
    return base


def _public_url(bucket: str, name: str) -> str:
    """Build the public Storage URL explicitly from SUPABASE_URL.

    We construct it by hand rather than trusting `get_public_url()` because some
    supabase-py builds render the scheme without its colon ("https//host/..."),
    which browsers treat as a relative path. Building from a normalized base keeps
    the stored value a valid absolute URL with no string surgery on the library's
    output.
    """
    base = normalize_public_base(os.getenv("SUPABASE_URL"))
    return f"{base}/storage/v1/object/public/{bucket}/{name}"


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
    return _public_url(bucket, name)
