"""AI test importer — convert an uploaded test (PDF / Word / image) into the
site's exam format using the Claude API.

Design notes:
- Heavy/optional deps (anthropic, pypdf, python-docx) are imported lazily inside
  the handler so the app still boots before `pip install -r backend/requirements.txt`.
- Requires ANTHROPIC_API_KEY in the environment. Without it the endpoint returns
  503 so the frontend can show a friendly "set up AI import" message.
- The model returns structured JSON via tool-use; the frontend loads it into the
  visual builder for the teacher to review/edit before saving.
"""
import os
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
    "otherwise leave correct_index/accept_answers empty. Call the build_ielts_test tool."
)


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
        import io
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    if name.endswith(".docx"):
        from docx import Document  # lazy (python-docx)
        import io
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs).strip()
    return ""


@router.post("/ai")
async def ai_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    _require_teacher(db, x_user_id)

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

    data = await file.read()
    name = (file.filename or "").lower()
    ctype = file.content_type or ""

    is_image = ctype.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif"))

    user_content = []
    if is_image:
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
            result = block.input
            result.setdefault("difficulty", "medium")
            result.setdefault("time_limit_min", 60)
            return result

    raise HTTPException(502, "The AI did not return a usable test. Try a clearer file.")
