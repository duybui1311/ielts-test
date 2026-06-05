"""AI test importer — convert an uploaded test (PDF / Word / image) into the
site's exam format.

Providers (selected with the LLM_PROVIDER env var, default "gemini"):
- "gemini" — Google Gemini via the google-genai SDK. Free online option and
  multimodal: PDFs and images are sent as raw bytes (Gemini reads charts,
  scanned pages and layout natively, so we do NOT pre-extract text). Needs
  GEMINI_API_KEY; GEMINI_MODEL defaults to "gemini-2.5-flash".
- "claude" — Anthropic Claude via tool-use. Images are sent as base64; other
  files have their text extracted locally first. Needs ANTHROPIC_API_KEY.
- "local" — no external API. Extracts text locally and returns it as a single
  reading section for the teacher to finish by hand. Useful offline / for tests.

Design notes:
- Heavy/optional deps (google-genai, anthropic, pypdf, python-docx) are imported
  lazily inside the handler so the app still boots before
  `pip install -r backend/requirements.txt`.
- Without the relevant API key the endpoint returns 503 so the frontend can show
  a friendly "set up AI import" message.
- Every provider returns the same JSON shape (the build_ielts_test schema) so the
  frontend visual builder is unchanged.
"""
import os
import io
import json
import base64
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/import", tags=["import"])

MODEL = "claude-sonnet-4-6"

# Tool schema the model must fill — mirrors tests_io.TestIn so the result can be
# saved directly through POST /api/tests/import after teacher review.
TEST_TOOL = {
    "name": "build_ielts_test",
    "description": "Return the IELTS test parsed from the supplied material.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Title of the whole test"},
            "difficulty": {"type": "string", "enum": ["low", "medium", "high"]},
            "time_limit_min": {"type": "integer"},
            "sections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "skill": {"type": "string", "enum": ["reading", "listening", "writing", "speaking"]},
                        "title": {"type": "string"},
                        "passage_md": {"type": "string", "description": "Reading passage or listening transcript (may be empty)"},
                        "questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "qtype": {"type": "string", "enum": ["mcq", "short", "explain"]},
                                    "prompt": {"type": "string"},
                                    "options": {"type": "array", "items": {"type": "string"}, "description": "MCQ options"},
                                    "correct_index": {"type": "integer", "description": "0-based index of the correct MCQ option"},
                                    "accept_answers": {"type": "array", "items": {"type": "string"}, "description": "Accepted answers for short questions"},
                                    "sub_skill": {"type": "string"},
                                },
                                "required": ["qtype", "prompt"],
                            },
                        },
                    },
                    "required": ["skill", "title", "questions"],
                },
            },
        },
        "required": ["name", "sections"],
    },
}

SYSTEM = (
    "You convert raw IELTS test material into a structured test. "
    "Identify each section's skill (reading/listening/writing/speaking), include the "
    "full passage or transcript in passage_md, and extract every question. "
    "Use qtype 'mcq' for multiple choice (include options and the 0-based correct_index), "
    "'short' for gap-fill/short-answer (include accept_answers with all acceptable variants), "
    "and 'explain' for essay/extended answers. If an answer key is present, use it; "
    "otherwise leave correct_index/accept_answers empty."
)


def _to_gemini_schema(node):
    """Convert the JSON-schema-ish TEST_TOOL schema to the subset Gemini's
    response_schema accepts (notably, type names must be uppercase)."""
    if not isinstance(node, dict):
        return node
    out = {}
    for key, value in node.items():
        if key == "type" and isinstance(value, str):
            out[key] = value.upper()
        elif key == "properties" and isinstance(value, dict):
            out[key] = {k: _to_gemini_schema(v) for k, v in value.items()}
        elif key == "items":
            out[key] = _to_gemini_schema(value)
        else:
            out[key] = value
    return out


_GEMINI_SCHEMA = _to_gemini_schema(TEST_TOOL["input_schema"])


def _uid(x_user_id: Optional[str]) -> Optional[int]:
    try:
        return int(x_user_id) if x_user_id else None
    except (TypeError, ValueError):
        return None


def _require_teacher(db: Session, x_user_id: Optional[str]) -> int:
    uid = _uid(x_user_id)
    user = db.query(models.User).filter(models.User.id == uid).first() if uid else None
    if not user or user.role != models.UserRole.teacher:
        raise HTTPException(403, "Teachers only.")
    return uid


def _extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader  # lazy
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    if name.endswith(".docx"):
        from docx import Document  # lazy (python-docx)
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs).strip()
    return ""


def _is_image(name: str, ctype: str) -> bool:
    return ctype.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif"))


def _finalize(result: dict) -> dict:
    result.setdefault("difficulty", "medium")
    result.setdefault("time_limit_min", 60)
    return result


# --- Providers -------------------------------------------------------------

def _run_gemini(file: UploadFile, data: bytes) -> dict:
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            503,
            "AI import is not configured. Add GEMINI_API_KEY to backend/.env "
            "(get a free key at aistudio.google.com/apikey), then restart the backend.",
        )
    try:
        from google import genai  # lazy
        from google.genai import types
    except ImportError:
        raise HTTPException(
            503,
            "AI import dependencies are missing. Run: pip install -r backend/requirements.txt",
        )

    name = (file.filename or "").lower()
    ctype = file.content_type or ""
    is_pdf = ctype == "application/pdf" or name.endswith(".pdf")

    parts = []
    if _is_image(name, ctype):
        # Multimodal: hand the raw image to Gemini, no OCR.
        media_type = ctype if ctype.startswith("image/") else "image/png"
        parts.append(types.Part.from_bytes(data=data, mime_type=media_type))
    elif is_pdf:
        # Multimodal: hand the raw PDF to Gemini so it reads charts/scans/layout.
        parts.append(types.Part.from_bytes(data=data, mime_type="application/pdf"))
    else:
        text = ""
        try:
            text = _extract_text(file.filename or "", data)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"Could not read the file: {e}")
        if not text:
            raise HTTPException(
                400,
                "No readable text found. For scanned/handwritten tests, upload a PDF or image instead.",
            )
        parts.append(types.Part.from_text(text=f"Test material:\n\n{text}"))

    parts.append(types.Part.from_text(text="Convert this IELTS test into the structured JSON format."))

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    try:
        resp = client.models.generate_content(
            model=model,
            contents=parts,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM,
                response_mime_type="application/json",
                response_schema=_GEMINI_SCHEMA,
            ),
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"AI service error: {e}")

    raw = (resp.text or "").strip()
    if not raw:
        raise HTTPException(502, "The AI did not return a usable test. Try a clearer file.")
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(502, "The AI returned malformed data. Try again or use a clearer file.")
    return _finalize(result)


def _run_claude(file: UploadFile, data: bytes) -> dict:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(
            503,
            "AI import is not configured. Add ANTHROPIC_API_KEY to backend/.env "
            "(get a key at console.anthropic.com), then restart the backend.",
        )
    try:
        import anthropic  # lazy
    except ImportError:
        raise HTTPException(
            503,
            "AI import dependencies are missing. Run: pip install -r backend/requirements.txt",
        )

    name = (file.filename or "").lower()
    ctype = file.content_type or ""

    user_content = []
    if _is_image(name, ctype):
        media_type = ctype if ctype.startswith("image/") else "image/png"
        user_content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type,
                       "data": base64.standard_b64encode(data).decode()},
        })
        user_content.append({"type": "text", "text": "Convert this IELTS test image into the structured format."})
    else:
        text = ""
        try:
            text = _extract_text(file.filename or "", data)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"Could not read the file: {e}")
        if not text:
            raise HTTPException(
                400,
                "No readable text found. For scanned/handwritten tests, upload an image instead.",
            )
        user_content.append({"type": "text", "text": f"Convert this IELTS test into the structured format:\n\n{text}"})

    client = anthropic.Anthropic()
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=8000,
            system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
            tools=[TEST_TOOL],
            tool_choice={"type": "tool", "name": "build_ielts_test"},
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"AI service error: {e}")

    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "build_ielts_test":
            return _finalize(block.input)

    raise HTTPException(502, "The AI did not return a usable test. Try a clearer file.")


def _run_local(file: UploadFile, data: bytes) -> dict:
    """No-API fallback: extract text and drop it into one reading section so the
    teacher can build questions by hand."""
    name = (file.filename or "").lower()
    ctype = file.content_type or ""
    if _is_image(name, ctype):
        raise HTTPException(
            400,
            "The local importer cannot read images. Set LLM_PROVIDER=gemini for "
            "image/scanned tests, or upload a PDF/Word file.",
        )
    text = ""
    try:
        text = _extract_text(file.filename or "", data)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not read the file: {e}")
    if not text:
        raise HTTPException(
            400,
            "No readable text found. Set LLM_PROVIDER=gemini to read scanned/image tests.",
        )
    return _finalize({
        "name": file.filename or "Imported test",
        "sections": [{
            "skill": "reading",
            "title": "Imported material",
            "passage_md": text,
            "questions": [],
        }],
    })


_PROVIDERS = {"gemini": _run_gemini, "claude": _run_claude, "local": _run_local}


@router.post("/ai")
async def ai_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    _require_teacher(db, x_user_id)

    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    run = _PROVIDERS.get(provider)
    if run is None:
        raise HTTPException(
            500,
            f"Unknown LLM_PROVIDER '{provider}'. Use 'gemini', 'claude', or 'local'.",
        )

    data = await file.read()
    return run(file, data)
