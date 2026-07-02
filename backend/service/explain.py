"""On-demand per-question explanations via Gemini.

Used by the AI importer (so freshly imported tests carry explanations) and by
POST /api/questions/{id}/explain (to back-fill tests imported before this
feature). The result is cached on the Question row so each question is only ever
explained once.
"""
import os
import re
import json
from fastapi import HTTPException

# Plain-language guidance the model follows for every explanation.
_INSTRUCTION = (
    "You are an IELTS tutor. Given a reading passage or listening transcript, a "
    "question and its correct answer, write a short, plain-language explanation.\n"
    "Return JSON with exactly two fields:\n"
    "- \"explanation\": 2-3 sentences explaining WHY the correct answer is correct. "
    "Where the question has other options or plausible-looking wrong answers, briefly "
    "say why a common wrong choice is a trap.\n"
    "- \"support_sentences\": an array of the exact sentence(s) copied verbatim from "
    "the passage/transcript that justify the answer (1-2 sentences). Copy them word "
    "for word so they can be highlighted in the passage. If nothing in the passage "
    "directly supports it, return an empty array.\n"
    "Do not invent passage text. Keep it concise and student-friendly."
)

_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "explanation": {"type": "STRING"},
        "support_sentences": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["explanation", "support_sentences"],
}


def _correct_answer_text(question) -> str:
    qtype = question.qtype.value if hasattr(question.qtype, "value") else question.qtype
    if qtype == "mcq":
        opts = question.options_json or []
        ci = question.correct_index
        if ci is not None and 0 <= ci < len(opts):
            return str(opts[ci])
        return "(no answer key)"
    accepts = question.accept_answers or []
    return ", ".join(str(a) for a in accepts) if accepts else "(no answer key)"


def _appears_in_passage(sentence: str, passage: str) -> bool:
    """Whitespace-tolerant, case-insensitive check that `sentence` occurs in `passage`.

    Mirrors the frontend highlighter (HighlightedText.jsx): collapse runs of
    whitespace and compare case-insensitively, ignoring trivially short fragments.
    A support sentence we keep is therefore exactly one that can be highlighted.
    """
    s = re.sub(r"\s+", " ", sentence or "").strip().lower()
    if len(s) <= 3:
        return False
    p = re.sub(r"\s+", " ", passage or "").lower()
    return s in p


def _ground_support(support_sentences, passage_md: str) -> list[str]:
    """Drop any 'support sentence' the model returned that is not actually present
    in the passage/transcript. This prevents fabricated citations from being shown
    to students as verbatim supporting evidence."""
    return [s for s in support_sentences if _appears_in_passage(s, passage_md)]


def generate_for_question(question, passage_md: str, skill: str | None) -> dict:
    """Call Gemini and return {"explanation": str, "support_sentences": [str]}.

    Raises HTTPException(503/502) on configuration/service problems so callers can
    surface a friendly message.
    """
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            503,
            "AI explanations are not configured. Add GEMINI_API_KEY to backend/.env "
            "(get a free key at aistudio.google.com/apikey), then restart the backend.",
        )
    try:
        from google import genai  # lazy
        from google.genai import types
    except ImportError:
        raise HTTPException(
            503,
            "AI dependencies are missing. Run: pip install -r backend/requirements.txt",
        )

    qtype = question.qtype.value if hasattr(question.qtype, "value") else question.qtype
    options = question.options_json or []
    payload = {
        "skill": skill or "reading",
        "passage": passage_md or "",
        "question": question.prompt or "",
        "question_type": qtype,
        "options": options,
        "correct_answer": _correct_answer_text(question),
        "sub_skill": question.sub_skill,
    }

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    cfg = types.GenerateContentConfig(
        system_instruction=_INSTRUCTION,
        response_mime_type="application/json",
        response_schema=_SCHEMA,
        temperature=0,
    )
    parts = [types.Part.from_text(text=json.dumps(payload, ensure_ascii=False))]
    try:
        resp = client.models.generate_content(model=model, contents=parts, config=cfg)
    except Exception as e:  # noqa: BLE001
        msg = str(e).lower()
        if any(k in msg for k in ("503", "unavailable", "overloaded", "429", "rate limit", "resource_exhausted")):
            raise HTTPException(503, "The AI service is busy right now. Please try again in a few seconds.")
        raise HTTPException(502, f"AI service error: {e}")

    raw = (resp.text or "").strip()
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(502, "The AI returned malformed data. Please try again.")

    explanation = (data.get("explanation") or "").strip()
    support = [str(s).strip() for s in (data.get("support_sentences") or []) if str(s).strip()]
    # Ground the citations: only keep support sentences that really appear in the
    # passage, so the UI never shows fabricated "supporting evidence".
    support = _ground_support(support, passage_md)
    if not explanation:
        raise HTTPException(502, "The AI did not return an explanation. Please try again.")
    return {"explanation": explanation, "support_sentences": support}
