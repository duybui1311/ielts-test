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
import time
import json
import base64
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import require_role
from backend.service.subskills import SUB_SKILLS

router = APIRouter(prefix="/api/import", tags=["import"])

MODEL = "claude-sonnet-4-6"

# Cap the uploaded test file so a huge upload can't exhaust server memory. We
# read at most MAX_UPLOAD_BYTES + 1 bytes, so an oversized file is rejected
# without ever being fully loaded.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

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
                        "passage_md": {"type": "string", "description": "All student-facing material for the section in markdown: the reading passage or listening transcript PLUS task instructions, any list of headings, word/option banks, example answers and notes/table/flow-chart templates. Never omit shared lists students must choose from."},
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
                                    "sub_skill": {"type": "string", "enum": SUB_SKILLS, "description": "Question category from the fixed list"},
                                    "explanation": {"type": "string", "description": "For reading/listening questions: 2-3 plain-language sentences on why the correct answer is correct, briefly noting why a common wrong choice is a trap."},
                                    "support_sentences": {"type": "array", "items": {"type": "string"}, "description": "For reading/listening questions: the exact sentence(s) copied verbatim from passage_md that justify the answer."},
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
    "You convert raw IELTS test material into a structured test. Be precise and "
    "consistent — extract exactly what is on the page, never invent content.\n"
    "Rules:\n"
    "1. One section per reading passage or listening recording. Put the full passage "
    "or listening transcript verbatim in passage_md. For writing/speaking sections, "
    "put the task instructions (and any chart description) in passage_md.\n"
    "2. Set each section's skill to one of: reading, listening, writing, speaking.\n"
    "3. Question types (qtype):\n"
    "   - 'mcq' for multiple choice: include every option in `options` and the 0-based "
    "`correct_index` of the right answer.\n"
    "   - 'short' for gap-fill, sentence/summary completion, short-answer and "
    "True/False/Not Given: put all acceptable answers (including synonyms and "
    "British/American spellings) in `accept_answers`.\n"
    "   - 'explain' for Writing and Speaking tasks and any essay/extended answer. "
    "EVERY question in a writing or speaking section must be 'explain'.\n"
    "4. Set `sub_skill` for every reading/listening question, choosing the single best "
    f"fit from this exact list (no other values): {', '.join(SUB_SKILLS)}.\n"
    "5. Keep questions in their original order. Number nothing in the prompt text "
    "itself — the position is enough.\n"
    "6. If an answer key is present, use it. If not, leave correct_index/accept_answers "
    "empty rather than guessing.\n"
    "7. Preserve the original wording of prompts and options; fix only obvious OCR errors.\n"
    "8. MATCHING tasks (matching headings, matching information/features/endings, and any "
    "task where students pick from ONE shared list such as a box of headings i-x or a list "
    "of names): output EACH item as an 'mcq' question whose `options` are the FULL shared "
    "list, in the original order, so the student can see and choose every choice. Set "
    "sub_skill to 'matching_headings'. Put the shared list (e.g. 'List of Headings') in "
    "passage_md as well so nothing is lost.\n"
    "9. Capture EVERYTHING the student needs to answer. Include in passage_md (using simple "
    "markdown) every piece of student-facing material that is not itself a numbered "
    "question: task instructions and word limits, lists of headings, word banks / boxes of "
    "options, example answers, and the text of any notes/table/flow-chart/summary-completion "
    "templates and diagram labels. Reproduce tables as markdown tables and keep gaps as "
    "blanks like '________ (3)'. Never omit a heading list, option box, or instruction line.\n"
    "10. For every reading and listening question, also fill `explanation` (2-3 plain "
    "sentences on why the correct answer is correct, noting why a common wrong choice is a "
    "trap) and `support_sentences` (the exact sentence(s) copied verbatim from passage_md "
    "that justify the answer). Leave both empty for writing/speaking questions."
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
    """Normalise the model output so the builder always receives a consistent
    shape, regardless of provider or model drift."""
    result.setdefault("difficulty", "medium")
    if result.get("difficulty") not in ("low", "medium", "high"):
        result["difficulty"] = "medium"
    result.setdefault("time_limit_min", 60)

    for sec in result.get("sections") or []:
        skill = (sec.get("skill") or "reading").lower()
        sec["skill"] = skill if skill in ("reading", "listening", "writing", "speaking") else "reading"
        productive = sec["skill"] in ("writing", "speaking")
        for q in sec.get("questions") or []:
            qtype = (q.get("qtype") or "short").lower()
            # Writing/Speaking are always extended, manually-marked answers.
            if productive:
                qtype = "explain"
            elif qtype not in ("mcq", "short", "explain"):
                qtype = "short"
            q["qtype"] = qtype

            if qtype == "mcq":
                opts = [o for o in (q.get("options") or []) if str(o).strip()]
                q["options"] = opts
                ci = q.get("correct_index")
                q["correct_index"] = ci if isinstance(ci, int) and 0 <= ci < len(opts) else 0
            else:
                q.pop("options", None)
                q.pop("correct_index", None)

            # Keep sub_skill within the closed analytics vocab.
            if qtype == "explain":
                q.pop("sub_skill", None)
                q.pop("explanation", None)
                q.pop("support_sentences", None)
            else:
                if q.get("sub_skill") not in SUB_SKILLS:
                    q["sub_skill"] = "multiple_choice" if qtype == "mcq" else "short_answer"
                # Normalise the learning-feature fields.
                exp = q.get("explanation")
                q["explanation"] = exp.strip() if isinstance(exp, str) and exp.strip() else None
                supp = q.get("support_sentences")
                q["support_sentences"] = (
                    [str(s).strip() for s in supp if str(s).strip()]
                    if isinstance(supp, list) else None
                )
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
    cfg = types.GenerateContentConfig(
        system_instruction=SYSTEM,
        response_mime_type="application/json",
        response_schema=_GEMINI_SCHEMA,
        temperature=0,  # deterministic: same file -> same structured test
    )

    # Gemini's free tier returns transient 503 (UNAVAILABLE) / 429 spikes —
    # retry a few times with backoff before surfacing a friendly error.
    resp = None
    last_err = None
    for attempt in range(4):
        try:
            resp = client.models.generate_content(model=model, contents=parts, config=cfg)
            last_err = None
            break
        except Exception as e:  # noqa: BLE001
            last_err = e
            msg = str(e).lower()
            transient = any(k in msg for k in (
                "503", "unavailable", "overloaded", "high demand",
                "429", "rate limit", "resource_exhausted", "timeout", "deadline",
            ))
            if transient and attempt < 3:
                time.sleep(1.5 * (attempt + 1))
                continue
            break
    if last_err is not None:
        m = str(last_err).lower()
        if any(k in m for k in ("503", "unavailable", "overloaded", "high demand", "429", "rate limit", "resource_exhausted")):
            raise HTTPException(
                503,
                "The AI service is busy right now (high demand). Please wait a few "
                "seconds and try Convert again.",
            )
        raise HTTPException(502, f"AI service error: {last_err}")

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
    user: models.User = Depends(require_role("teacher", "admin")),
):
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    run = _PROVIDERS.get(provider)
    if run is None:
        raise HTTPException(
            500,
            f"Unknown LLM_PROVIDER '{provider}'. Use 'gemini', 'claude', or 'local'.",
        )

    # Read one byte past the limit so we can detect (and reject) oversized files
    # without loading the whole upload into memory.
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            f"File is too large. The maximum upload size is "
            f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    return run(file, data)
