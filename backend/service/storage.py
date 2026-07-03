"""Supabase Storage helper.

Uploads bytes to Storage and returns the canonical URL; media is served to
clients through short-lived SIGNED URLs (see sign_media_url), so the buckets can
be made private — student recordings and charts are then unreachable without a
token. Buckets in use:
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


# Matches our own Storage URLs (public or signed form): bucket + object name.
_MEDIA_RE = re.compile(r"/storage/v1/object/(?:public|sign)/([^/]+)/([^?]+)")

# Signed links last long enough for any test/review session.
SIGNED_URL_TTL_SECONDS = int(os.getenv("SIGNED_URL_TTL_SECONDS", "21600"))  # 6h


def _parse_media_url(url: str | None):
    """Return (bucket, name) when `url` is one of OUR Storage URLs, else None."""
    if not url:
        return None
    base = normalize_public_base(os.getenv("SUPABASE_URL"))
    if not base or not url.startswith(base):
        return None
    m = _MEDIA_RE.search(url)
    return (m.group(1), m.group(2)) if m else None


def canonical_media_url(url: str | None) -> str | None:
    """Normalize a media URL for STORAGE in the database: signed links (which
    expire) are converted back to the stable public form; anything else —
    external URLs, local /uploads paths — passes through unchanged."""
    parsed = _parse_media_url(url)
    if not parsed:
        return url
    return _public_url(*parsed)


def sign_media_url(url: str | None, expires: int = 0) -> str | None:
    """Convert a stored media URL into a short-lived signed link for the client.

    Only touches our own Storage URLs; external links and local paths pass
    through. Falls back to the original URL on any failure (e.g. Storage not
    configured) so a public-bucket deploy keeps working during the transition."""
    parsed = _parse_media_url(url)
    if not parsed:
        return url
    bucket, name = parsed
    try:
        res = _client().storage.from_(bucket).create_signed_url(
            name, expires or SIGNED_URL_TTL_SECONDS
        )
        signed = res.get("signedURL") or res.get("signedUrl") if isinstance(res, dict) else None
        if not signed:
            return url
        if signed.startswith("http"):
            return signed
        base = normalize_public_base(os.getenv("SUPABASE_URL"))
        return f"{base}/storage/v1{signed}" if signed.startswith("/object") else f"{base}{signed}"
    except Exception:  # noqa: BLE001 — never break content delivery over signing
        return url
