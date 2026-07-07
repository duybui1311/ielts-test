"""Input sanitization at the API boundary.

Two layers:
1. `Sanitized(max_len)` — an annotated string type for Pydantic models: strips
   NUL/control characters (keeping newlines and tabs), trims surrounding
   whitespace, and rejects values over `max_len` with a clean 422 instead of
   letting megabyte strings reach the database.
2. `body_size_guard` — middleware check that refuses oversized JSON bodies
   before they are parsed (multipart uploads have their own per-file cap in
   ai_import/tests_io).

XSS note: the React frontend never renders HTML from user content (no
dangerouslySetInnerHTML anywhere), so escaping is handled by React itself —
the server therefore sanitizes for storage safety, not HTML safety.
"""
import re
from typing import Annotated

from pydantic import BeforeValidator, StringConstraints

# Control characters except \n (0A) and \t (09); includes DEL and C1 range.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")

# JSON request bodies larger than this are refused outright. Generous: a full
# 40-question test import with three passages is ~100 KB.
MAX_JSON_BODY_BYTES = 2 * 1024 * 1024


def clean_text(value):
    """Strip control characters and trim whitespace; non-strings pass through
    (Pydantic handles type errors)."""
    if not isinstance(value, str):
        return value
    return _CONTROL_CHARS.sub("", value.replace("\r\n", "\n").replace("\r", "\n")).strip()


def Sanitized(max_len: int):  # noqa: N802 — used as a type constructor
    """Annotated str for Pydantic fields: control-char-stripped, trimmed,
    length-capped. Usage: `name: Sanitized(255)`."""
    return Annotated[
        str,
        BeforeValidator(clean_text),
        StringConstraints(max_length=max_len),
    ]


def OptionalSanitized(max_len: int):  # noqa: N802
    """Same as Sanitized but allows None."""
    return Sanitized(max_len) | None
