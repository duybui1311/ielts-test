"""One-time repair for corrupted media URLs.

Some uploads were saved with a malformed Supabase URL — a colon-less scheme
("https//host/...") and/or a backend host glued in front, e.g.

    https://my-api.onrender.comhttps//xxx.supabase.co/storage/v1/object/public/...

Browsers treat that as a relative path, so the audio/image never loads. This
script rewrites the affected columns to the clean Supabase URL. It is safe to
re-run (idempotent) and only touches rows that actually change.

Columns scanned:
  - stations.audio_url, stations.image_url
  - writing_tasks.image_url
  - speaking_submissions.audio_url

Run from the repo root (uses backend/.env for DATABASE_URL):

    python -m backend.scripts.repair_media_urls            # apply changes
    python -m backend.scripts.repair_media_urls --dry-run  # preview only
"""
import re
import sys
from pathlib import Path

# Allow running as a plain script (python backend/scripts/repair_media_urls.py).
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Load backend/.env explicitly so DATABASE_URL is available regardless of cwd.
from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from backend.service.database import SessionLocal  # noqa: E402
from backend.service import models  # noqa: E402

# Recover just the Supabase URL if a host / colon-less scheme precedes it.
_SB_RE = re.compile(r"https?:?//[^\s/]*\.supabase\.co/\S*", re.IGNORECASE)


def clean_media_url(url):
    """Return the repaired URL, or the input unchanged if nothing to fix.

    Mirrors the frontend mediaUrl() repair so stored data and rendered src agree.
    """
    if not url:
        return url
    u = url.strip()
    m = _SB_RE.search(u)
    if m:
        u = m.group(0)
    # Restore a missing scheme colon: "https//host" -> "https://host".
    u = re.sub(r"^(https?)//", r"\1://", u, flags=re.IGNORECASE)
    return u


# (model, attribute) pairs holding media URLs.
TARGETS = [
    (models.Station, "audio_url"),
    (models.Station, "image_url"),
    (models.WritingTask, "image_url"),
    (models.SpeakingSubmission, "audio_url"),
]


def main(dry_run: bool) -> None:
    db = SessionLocal()
    fixed = 0
    try:
        for model, attr in TARGETS:
            for row in db.query(model).all():
                old = getattr(row, attr)
                new = clean_media_url(old)
                if new != old:
                    fixed += 1
                    print(f"[{model.__tablename__}.{attr}] id={row.id}")
                    print(f"    before: {old}")
                    print(f"    after:  {new}")
                    if not dry_run:
                        setattr(row, attr, new)
        if dry_run:
            print(f"\nDRY RUN — {fixed} row(s) would be fixed. No changes written.")
        else:
            db.commit()
            print(f"\nDone — {fixed} row(s) repaired and committed.")
    finally:
        db.close()


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
