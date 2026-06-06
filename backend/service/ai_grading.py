"""AI grading for IELTS Writing & Speaking via Google Gemini.

Same provider/SDK as the test importer (backend/routers/ai_import.py). Each
function sends the student's work to Gemini with a system prompt encoding the
official IELTS band descriptors for that skill and asks for a structured JSON
verdict: an overall band, a per-criterion band + comment, a list of error tags
({category, excerpt, suggestion}) and 2-3 improvement tips.

The result is a DRAFT — the routers persist it and a teacher reviews/approves
before students see it. Network/quota errors raise AIGradingError; the routers
turn that into an HTTP response.
"""
import os
import json
import time

GEMINI_MODEL_DEFAULT = "gemini-2.5-flash"

# Closed error-tag categories so Writing/Speaking mistakes group cleanly in the
# analytics dashboard (written to error_tags.sub_skill).
WRITING_CATEGORIES = ["task_response", "coherence", "vocabulary", "grammar", "spelling", "punctuation"]
SPEAKING_CATEGORIES = ["fluency", "coherence", "vocabulary", "grammar", "pronunciation"]


class AIGradingError(RuntimeError):
    """Raised when grading can't be produced (no key, deps, or AI/service error)."""


# ── Band-descriptor system prompts ──────────────────────────────────────────

_BANDS_INTRO = (
    "You are a certified IELTS examiner. Grade strictly against the official "
    "public band descriptors. Bands are 0-9 in 0.5 steps. The overall band is the "
    "average of the four criteria, rounded to the nearest 0.5 (round .25 up). Be "
    "fair but rigorous; justify each criterion in one or two sentences quoting the "
    "student where useful. Only flag genuine errors."
)

WRITING_SYSTEM = (
    _BANDS_INTRO + "\n\n"
    "Grade this IELTS Writing response on the four official criteria:\n"
    "- Task Response (Task Achievement for Task 1): does it fully address every part "
    "of the prompt with a clear position and well-developed, relevant ideas? Task 1 "
    "must cover key features/an overview; Task 2 needs a clear position throughout.\n"
    "- Coherence and Cohesion: logical organisation, paragraphing, and accurate, "
    "non-mechanical use of cohesive devices and referencing.\n"
    "- Lexical Resource: range, precision and naturalness of vocabulary, collocation "
    "and word choice; spelling/word-formation errors.\n"
    "- Grammatical Range and Accuracy: range and accuracy of structures, error "
    "frequency and the communicative effect of errors; punctuation.\n"
    "Use error-tag categories from this exact list: " + ", ".join(WRITING_CATEGORIES) + "."
)

SPEAKING_SYSTEM = (
    _BANDS_INTRO + "\n\n"
    "You are grading a TRANSCRIPT of a spoken IELTS answer (you cannot hear audio, so "
    "judge Pronunciation only from spelled-out features, repetition and filler where "
    "evident, and be conservative). Grade the four official criteria:\n"
    "- Fluency and Coherence: speech rate and continuity, hesitation/self-correction, "
    "topic development and coherent linking.\n"
    "- Lexical Resource: range and precision of vocabulary, paraphrase and idiomatic "
    "usage.\n"
    "- Grammatical Range and Accuracy: range of structures and error frequency.\n"
    "- Pronunciation: from the transcript, comment cautiously (intelligibility, evident "
    "repetition/fillers); do not over-penalise.\n"
    "Use error-tag categories from this exact list: " + ", ".join(SPEAKING_CATEGORIES) + "."
)


def _schema(categories):
    """Gemini response_schema (uppercase types, like the importer)."""
    return {
        "type": "OBJECT",
        "properties": {
            "overall_band": {"type": "NUMBER"},
            "criteria": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "band": {"type": "NUMBER"},
                        "comment": {"type": "STRING"},
                    },
                    "required": ["name", "band", "comment"],
                },
            },
            "error_tags": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "category": {"type": "STRING", "enum": categories},
                        "excerpt": {"type": "STRING"},
                        "suggestion": {"type": "STRING"},
                    },
                    "required": ["category", "suggestion"],
                },
            },
            "tips": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": ["overall_band", "criteria", "tips"],
    }


def _round_half(x):
    try:
        return round(float(x) * 2) / 2
    except (TypeError, ValueError):
        return None


def _run_gemini(system: str, user_text: str, categories) -> dict:
    if not os.getenv("GEMINI_API_KEY"):
        raise AIGradingError(
            "AI grading is not configured. Add GEMINI_API_KEY to backend/.env "
            "(get a free key at aistudio.google.com/apikey), then restart the backend."
        )
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise AIGradingError(
            "AI dependencies are missing. Run: pip install -r backend/requirements.txt"
        ) from e

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model = os.getenv("GEMINI_MODEL", GEMINI_MODEL_DEFAULT)
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=_schema(categories),
        temperature=0,
    )

    last_err = None
    for attempt in range(4):
        try:
            resp = client.models.generate_content(
                model=model, contents=[types.Part.from_text(text=user_text)], config=cfg,
            )
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
            raise AIGradingError("The AI service is busy right now (high demand). Please try again in a few seconds.")
        raise AIGradingError(f"AI service error: {last_err}")

    raw = (resp.text or "").strip()
    if not raw:
        raise AIGradingError("The AI did not return a grade. Please try again.")
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        raise AIGradingError("The AI returned malformed data. Please try again.")
    return _finalize(result, categories)


def _finalize(result: dict, categories) -> dict:
    """Clamp bands to 0-9 in 0.5 steps and keep error categories within the list."""
    result["overall_band"] = max(0, min(9, _round_half(result.get("overall_band")) or 0))
    crits = []
    for c in result.get("criteria") or []:
        b = _round_half(c.get("band"))
        crits.append({
            "name": c.get("name") or "",
            "band": max(0, min(9, b)) if b is not None else None,
            "comment": c.get("comment") or "",
        })
    result["criteria"] = crits
    tags = []
    for t in result.get("error_tags") or []:
        cat = (t.get("category") or "").lower().strip()
        if cat not in categories:
            cat = categories[0]
        tags.append({
            "category": cat,
            "excerpt": t.get("excerpt") or "",
            "suggestion": t.get("suggestion") or "",
        })
    result["error_tags"] = tags
    result["tips"] = [t for t in (result.get("tips") or []) if str(t).strip()][:5]
    return result


# ── Public API ──────────────────────────────────────────────────────────────

def grade_writing(essay_text: str, task_prompt: str, task_type: str = "task2") -> dict:
    if not (essay_text or "").strip():
        raise AIGradingError("There is no response text to grade.")
    label = "Task 1 (min 150 words)" if task_type == "task1" else "Task 2 (min 250 words)"
    user = (
        f"IELTS Writing {label}.\n\n"
        f"TASK PROMPT:\n{task_prompt or '(not provided)'}\n\n"
        f"STUDENT RESPONSE:\n{essay_text}"
    )
    return _run_gemini(WRITING_SYSTEM, user, WRITING_CATEGORIES)


def grade_speaking(transcript: str, task_prompt: str) -> dict:
    if not (transcript or "").strip():
        raise AIGradingError("There is no transcript to grade.")
    user = (
        f"IELTS Speaking answer (transcript).\n\n"
        f"QUESTION / PROMPT:\n{task_prompt or '(not provided)'}\n\n"
        f"STUDENT TRANSCRIPT:\n{transcript}"
    )
    return _run_gemini(SPEAKING_SYSTEM, user, SPEAKING_CATEGORIES)
