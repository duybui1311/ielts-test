from __future__ import annotations
import logging
import os
import re
import sys
import threading
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from llama_cpp import Llama
except ImportError:
    Llama = None

# Logging
logger = logging.getLogger("virtual_patient_ai")
if not logger.handlers:
    logging.basicConfig(
        level=os.getenv("VP_LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

# Paths / Config
BASE_DIR = Path(__file__).resolve().parent

_model_env = os.getenv("VP_MODEL_PATH")
if _model_env:
    _candidate = Path(_model_env).expanduser()
    MODEL_PATH = _candidate if _candidate.is_absolute() else (BASE_DIR / _candidate).resolve()
else:
    MODEL_PATH = (BASE_DIR / "model" / "Meta-Llama-3-8B-Instruct-Q4_K_M.gguf").resolve()

CTX = int(os.getenv("VP_CTX", "2048"))
THREADS = int(os.getenv("VP_THREADS", str(os.cpu_count() or 8)))
MAX_TOKENS = int(os.getenv("VP_MAX", "96"))
TEMP = float(os.getenv("VP_TEMP", "0.20"))
TOP_P = float(os.getenv("VP_TOP_P", "0.90"))
REPEAT_PENALTY = float(os.getenv("VP_REPEAT_PENALTY", "1.10"))
MAX_HISTORY_TURNS = int(os.getenv("VP_MAX_HISTORY_TURNS", "20"))
MAX_SENTENCES = int(os.getenv("VP_MAX_SENTENCES", "4"))
EXAM_Q_MAX_TOKENS = int(os.getenv("VP_EXAM_Q_MAX", "768"))

# Prefer GPU first. -1 means try to offload as many layers as possible.
PREFERRED_GPU_LAYERS = int(os.getenv("VP_N_GPU_LAYERS", "-1"))
ACTIVE_GPU_LAYERS: Optional[int] = None

# Schemas
class ChatTurn(BaseModel):
    side: Literal["student", "patient"]
    text: str

class GenerateRequest(BaseModel):
    patient_script: str
    history: List[ChatTurn]
    student_message: str

class GenerateResponse(BaseModel):
    reply: str

class ExamQuestionGenerateRequest(BaseModel):
    case_title: str = ""
    case_details: str
    mcq_count: int = Field(0, ge=0, le=20)
    short_count: int = Field(0, ge=0, le=20)
    explain_count: int = Field(0, ge=0, le=20)
    station_index: Optional[int] = None

class ExamGeneratedQuestion(BaseModel):
    type: Literal["mcq", "short", "explain"]
    text: str
    options: Optional[List[str]] = None
    correct_index: Optional[int] = None
    answer: Optional[str] = None
    reference: Optional[str] = None

class ExamQuestionGenerateResponse(BaseModel):
    counts: Dict[str, int]
    questions: List[ExamGeneratedQuestion]

# Global state
llm: Optional[Llama] = None
llm_lock = threading.Lock()

# Prompt policy
SYSTEM_PROMPT = """
You are a standardized patient in a clinical interview simulation.

Stay in character as the patient at all times.

Your job:
- Answer only as the patient.
- Sound like a normal person, not a doctor, teacher, examiner, or AI.
- Use natural, conversational, lay language unless the patient script clearly says the patient knows a medical term.

Hard rules:
- Never mention OSCE, exam, station, prompt, script, instructions, AI, assistant, model, or roleplay rules.
- Never teach medicine, explain pathophysiology like a clinician, interpret investigations academically, or suggest treatment plans.
- Never invent important new facts that are not supported by the patient script or already established conversation.
- Never reveal hidden examination findings, test results, diagnoses, or management details unless the patient script clearly says the patient knows them.
- If asked something the patient would not know, answer naturally with uncertainty:
  examples include "I'm not sure", "I don't really know", "No one has told me that", or "I can't remember exactly."

Knowledge priority:
1. Highest priority: the patient script.
2. Next: facts already said earlier in the conversation.
3. Then: only small everyday inferences a normal patient could reasonably make.
4. Otherwise: admit uncertainty naturally.

Conversation style:
- Be brief by default.
- Usually answer in 1 to 3 short sentences; 4 short sentences maximum if the question clearly asks for detail.
- Do not dump the whole case unless the student asks broadly and naturally.
- For an opening broad question like "What brought you in today?", give the main complaint, rough duration, and 1 or 2 naturally linked details.
- For direct questions, answer directly and add only a small relevant detail if it feels natural.
- Keep the patient's emotional tone realistic but not theatrical.

Output rule:
- Return only the patient's spoken reply, with no labels and no extra commentary.
""".strip()

# ---------------------------------------------------------------------
# Added for exam-question generation
# ---------------------------------------------------------------------
EXAM_QUESTION_SYSTEM_PROMPT = """
You are an OSCE exam question generator.

Your job:
- Create station questions strictly from the supplied patient case details.
- Generate clinically relevant questions for medical students.
- Return only valid JSON and nothing else.

Hard rules:
- Do not answer as the patient.
- Do not invent important facts not supported by the case details.
- Do not output markdown, bullet commentary, headings, or explanations outside JSON.
- Every MCQ must have exactly 4 options.
- Every MCQ must include correct_index from 0 to 3.
- Short-answer questions must include "answer".
- Explanation questions must include "reference".

Output JSON shape:
{
  "questions": [
    {
      "type": "mcq",
      "text": "question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_index": 0
    },
    {
      "type": "short",
      "text": "question text",
      "answer": "sample answer or marking keywords"
    },
    {
      "type": "explain",
      "text": "question text",
      "reference": "reference explanation or model answer"
    }
  ]
}
""".strip()

# =========================================================
# Helpers
# =========================================================
def _truncate_history(history: List[ChatTurn]) -> List[ChatTurn]:
    if MAX_HISTORY_TURNS <= 0:
        return history
    return history[-MAX_HISTORY_TURNS:]

def _history_to_text(history: List[ChatTurn]) -> str:
    lines: List[str] = []
    for msg in _truncate_history(history):
        text = (msg.text or "").strip()
        if not text:
            continue
        speaker = "Student" if msg.side == "student" else "Patient"
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines).strip()

def build_user_message(patient_script: str, history: List[ChatTurn], student_message: str) -> str:
    history_text = _history_to_text(history)
    if not history_text:
        history_text = "(No prior conversation.)"

    return (
        f"PATIENT SCRIPT:\n"
        f"{patient_script.strip()}\n\n"
        f"CONVERSATION SO FAR:\n"
        f"{history_text}\n\n"
        f"STUDENT'S NEW QUESTION:\n"
        f"{student_message.strip()}\n\n"
        f"Reply as the patient only."
    )

def build_exam_question_user_message(
    case_title: str,
    case_details: str,
    mcq_count: int,
    short_count: int,
    explain_count: int,
    station_index: Optional[int] = None,
) -> str:
    station_label = f"station {station_index}" if station_index else "this station"
    title = (case_title or "").strip() or "Untitled case"

    return f"""
Generate questions for {station_label} using ONLY the patient case information below.

Generate exactly:
- {mcq_count} mcq question(s)
- {short_count} short question(s)
- {explain_count} explain question(s)

Case title:
{title}

Case details:
{(case_details or "").strip()}
""".strip()

def _strip_role_prefixes(text: str) -> str:
    prefixes = [
        "Patient:",
        "patient:",
        "Assistant:",
        "assistant:",
        "AI:",
        "Doctor:",
        "Student:",
    ]
    out = text.strip()
    changed = True
    while changed:
        changed = False
        for p in prefixes:
            if out.startswith(p):
                out = out[len(p):].strip()
                changed = True
    return out

def _strip_template_artifacts(text: str) -> str:
    if not text:
        return ""

    out = text

    # Common template markers
    out = re.sub(r"<<SYS>>", " ", out, flags=re.IGNORECASE)
    out = re.sub(r"<</SYS>>", " ", out, flags=re.IGNORECASE)
    out = re.sub(r"\[/?SYS\]", " ", out, flags=re.IGNORECASE)
    out = re.sub(r"\[/?INST\]", " ", out, flags=re.IGNORECASE)

    # Llama-style sentence wrappers
    out = re.sub(r"</?s>", " ", out, flags=re.IGNORECASE)              # <s> </s>
    out = re.sub(r"\[\s*/?\s*s\s*\]", " ", out, flags=re.IGNORECASE)  # [s] [/s]

    # Special tokens like <|eot_id|>
    out = re.sub(r"<\|[^>]+\|>", " ", out)

    out = re.sub(r"\s+", " ", out).strip()
    return out

def _strip_edge_artifacts(text: str) -> str:
    if not text:
        return ""

    out = text.strip()
    changed = True

    while changed:
        prev = out

        # Remove broken fragments only at the start/end
        out = re.sub(
            r"^(?:\s*(?:\[\s*/\s*|\[\s*|\]\s*|<<SYS>>\s*|<</SYS>>\s*))+",
            "",
            out,
            flags=re.IGNORECASE,
        )
        out = re.sub(
            r"(?:(?:\s*\[\s*/\s*|\s*\[\s*|\s*\]\s*|\s*<<SYS>>|\s*<</SYS>>)+)$",
            "",
            out,
            flags=re.IGNORECASE,
        )

        # Remove repeated template tokens at the edges
        out = re.sub(r"^(?:\s*\[\s*/?\s*s\s*\]\s*)+", "", out, flags=re.IGNORECASE)
        out = re.sub(r"(?:\s*\[\s*/?\s*s\s*\]\s*)+$", "", out, flags=re.IGNORECASE)

        out = out.strip()
        changed = (out != prev)

    return out

def _extract_best_template_span(text: str) -> str:
    if not text:
        return ""

    candidates: List[str] = []
    patterns = [
        r"<s>\s*(.*?)\s*</s>",
        r"\[/INST\]\s*(.*?)(?=(?:<<SYS>>|\[INST\]|\[/INST\]|$))",
        r"\[/s\]\s*(.*?)(?=(?:\[/s\]|\[/?INST\]|<<SYS>>|$))",
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE | re.DOTALL):
            candidate = _strip_template_artifacts(match.group(1))
            candidate = _strip_role_prefixes(candidate)
            candidate = _strip_edge_artifacts(candidate)
            candidate = re.sub(r"\s+", " ", candidate).strip().strip('"').strip("'")
            if candidate:
                candidates.append(candidate)

    if candidates:
        return max(candidates, key=len)

    return text

def _clean_reply(raw: str) -> str:
    text = (raw or "").strip()

    if not text:
        return "I'm not sure."

    text = text.replace("\r", "\n")
    lower_text = text.lower()
    if any(tok in lower_text for tok in ("<<sys>>", "[inst]", "[/inst]", "<s>", "</s>", "[/s]", "<|")):
        text = _extract_best_template_span(text)

    text = _strip_role_prefixes(text)

    # Stop at leaked next-turn markers
    cut_markers = [
        "\nStudent:",
        "\nstudent:",
        "\nDoctor:",
        "\nAssistant:",
        "\n###",
        "<|eot_id|>",
        "<|end_of_text|>",
    ]
    for marker in cut_markers:
        if marker in text:
            text = text.split(marker, 1)[0].strip()

    # Remove obviously meta lines
    meta_terms = [
        "osce",
        "exam station",
        "patient script",
        "as an ai",
        "language model",
        "system prompt",
        "roleplay instructions",
        "assistant",
    ]

    cleaned_lines: List[str] = []
    for line in text.splitlines():
        line = line.strip(" -*\t")
        if not line:
            continue
        lower = line.lower()
        if any(term in lower for term in meta_terms):
            continue
        if lower.startswith(("student:", "doctor:", "assistant:", "system:")):
            break
        cleaned_lines.append(line)

    text = " ".join(cleaned_lines).strip()
    text = _strip_template_artifacts(text)
    text = _strip_role_prefixes(text)
    text = _strip_edge_artifacts(text)
    text = text.strip().strip('"').strip("'")
    text = re.sub(r"\s+", " ", text).strip()

    if not text:
        return "I'm not sure."

    # Clamp to a sensible number of sentences
    parts = re.split(r"(?<=[.!?])\s+", text)
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) > MAX_SENTENCES:
        text = " ".join(parts[:MAX_SENTENCES]).strip()

    text = _strip_edge_artifacts(text)
    text = re.sub(r"\s+", " ", text).strip()

    if not text:
        return "I'm not sure."

    return text

# ---------------------------------------------------------------------
# Added for exam-question generation
# ---------------------------------------------------------------------
def _extract_json_object(raw_text: str) -> Dict[str, Any]:
    cleaned = (raw_text or "").strip()

    cleaned = re.sub(r"^```json\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^```\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    decoder = json.JSONDecoder()

    for i, ch in enumerate(cleaned):
        if ch != "{":
            continue

        try:
            obj, end_idx = decoder.raw_decode(cleaned[i:])
        except json.JSONDecodeError:
            continue

        if isinstance(obj, dict):
            return obj

    raise ValueError("No JSON object found in LLM response.")

def _normalize_exam_qtype(raw: Any) -> Optional[str]:
    value = str(raw or "").strip().lower()
    mapping = {
        "mcq": "mcq",
        "multiple choice": "mcq",
        "multiple_choice": "mcq",
        "multiple-choice": "mcq",
        "short": "short",
        "short answer": "short",
        "short_answer": "short",
        "short-answer": "short",
        "explain": "explain",
        "explanation": "explain",
        "essay": "explain",
        "long": "explain",
    }
    return mapping.get(value)

def _normalize_single_exam_question(item: Dict[str, Any], expected_type: str) -> Dict[str, Any]:
    text_value = str(item.get("text") or item.get("prompt") or "").strip()
    if not text_value:
        raise ValueError(f"Generated {expected_type} question is missing text.")

    if expected_type == "mcq":
        raw_options = item.get("options") or item.get("choices") or []
        if isinstance(raw_options, dict):
            raw_options = list(raw_options.values())

        options = [str(v).strip() for v in raw_options if str(v).strip()]
        if len(options) < 4:
            raise ValueError("Generated MCQ must contain at least 4 options.")

        options = options[:4]

        raw_correct = item.get("correct_index", item.get("answer_index", 0))
        if isinstance(raw_correct, str):
            raw_correct = {
                "A": 0,
                "B": 1,
                "C": 2,
                "D": 3,
            }.get(raw_correct.strip().upper(), 0)

        try:
            correct_index = int(raw_correct)
        except Exception:
            correct_index = 0

        if correct_index < 0 or correct_index > 3:
            correct_index = 0

        return {
            "type": "mcq",
            "text": text_value,
            "options": options,
            "correct_index": correct_index,
        }

    if expected_type == "short":
        answer = str(item.get("answer") or item.get("reference") or "").strip()
        return {
            "type": "short",
            "text": text_value,
            "answer": answer,
        }

    reference = str(item.get("reference") or item.get("answer") or "").strip()
    return {
        "type": "explain",
        "text": text_value,
        "reference": reference,
    }

def _normalize_generated_exam_questions(
    parsed: Dict[str, Any],
    counts: Dict[str, int],
) -> List[Dict[str, Any]]:
    raw_questions = parsed.get("questions")
    if not isinstance(raw_questions, list):
        raise ValueError("LLM JSON must contain a 'questions' array.")

    buckets: Dict[str, List[Dict[str, Any]]] = {
        "mcq": [],
        "short": [],
        "explain": [],
    }

    for item in raw_questions:
        if not isinstance(item, dict):
            continue
        qtype = _normalize_exam_qtype(item.get("type"))
        if qtype in buckets:
            buckets[qtype].append(item)

    final_questions: List[Dict[str, Any]] = []

    for qtype in ("mcq", "short", "explain"):
        needed = counts[qtype]
        if needed <= 0:
            continue

        available = buckets[qtype]
        if len(available) < needed:
            raise ValueError(
                f"LLM returned {len(available)} '{qtype}' question(s), but {needed} were requested."
            )

        for item in available[:needed]:
            final_questions.append(_normalize_single_exam_question(item, qtype))

    return final_questions

def _generate_with_chat_completion(user_message: str) -> str:
    assert llm is not None

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    with llm_lock:
        out = llm.create_chat_completion(
            messages=messages,
            max_tokens=MAX_TOKENS,
            temperature=TEMP,
            top_p=TOP_P,
            repeat_penalty=REPEAT_PENALTY,
            stop=[
                "Student:",
                "Doctor:",
                "Assistant:",
                "###",
                "<|eot_id|>",
            ],
        )

    return out["choices"][0]["message"]["content"]

def _generate_with_fallback_prompt(user_message: str) -> str:
    assert llm is not None

    prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f"{user_message}\n\n"
        f"Patient:"
    )

    with llm_lock:
        out = llm(
            prompt,
            max_tokens=MAX_TOKENS,
            temperature=TEMP,
            top_p=TOP_P,
            repeat_penalty=REPEAT_PENALTY,
            stop=[
                "\nStudent:",
                "Student:",
                "\nDoctor:",
                "Doctor:",
                "\n###",
                "###",
                "<|eot_id|>",
            ],
        )

    return out["choices"][0]["text"]

def _exam_question_token_budget(
    mcq_count: int,
    short_count: int,
    explain_count: int,
) -> int:
    total = max(
        1,
        int(mcq_count or 0) +
        int(short_count or 0) +
        int(explain_count or 0)
    )

    base_tokens = int(os.getenv("VP_EXAM_Q_BASE_TOKENS", "96"))
    per_question_tokens = int(os.getenv("VP_EXAM_Q_PER_QUESTION_TOKENS", "80"))
    min_tokens = int(os.getenv("VP_EXAM_Q_MIN_TOKENS", "160"))

    return max(
        min_tokens,
        min(EXAM_Q_MAX_TOKENS, base_tokens + total * per_question_tokens)
    )

# exam-question generation
def _generate_exam_questions_with_chat_completion(
    user_message: str,
    max_tokens: Optional[int] = None,
) -> str:
    assert llm is not None

    if max_tokens is None:
        max_tokens = EXAM_Q_MAX_TOKENS

    messages = [
        {"role": "system", "content": EXAM_QUESTION_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    with llm_lock:
        out = llm.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=TEMP,
            top_p=TOP_P,
            repeat_penalty=REPEAT_PENALTY,
            stop=[
                "<|eot_id|>",
            ],
        )

    return out["choices"][0]["message"]["content"]

def _generate_exam_questions_with_fallback_prompt(
    user_message: str,
    max_tokens: Optional[int] = None,
) -> str:
    assert llm is not None

    if max_tokens is None:
        max_tokens = EXAM_Q_MAX_TOKENS

    prompt = (
        f"{EXAM_QUESTION_SYSTEM_PROMPT}\n\n"
        f"{user_message}\n\n"
        f"JSON:"
    )

    with llm_lock:
        out = llm(
            prompt,
            max_tokens=max_tokens,
            temperature=TEMP,
            top_p=TOP_P,
            repeat_penalty=REPEAT_PENALTY,
            stop=[
                "<|eot_id|>",
            ],
        )

    return out["choices"][0]["text"]

def generate_reply(patient_script: str, history: List[ChatTurn], student_message: str) -> str:
    user_message = build_user_message(patient_script, history, student_message)

    try:
        if hasattr(llm, "create_chat_completion"):
            raw = _generate_with_chat_completion(user_message)
        else:
            raw = _generate_with_fallback_prompt(user_message)
    except Exception:
        logger.exception("[VirtualPatientAI] Generation failed.")
        raise

    reply = _clean_reply(raw)
    return reply or "I'm not sure."

# exam-question generation
def generate_exam_questions(
    case_title: str,
    case_details: str,
    mcq_count: int,
    short_count: int,
    explain_count: int,
    station_index: Optional[int] = None,
) -> ExamQuestionGenerateResponse:
    counts = {
        "mcq": mcq_count,
        "short": short_count,
        "explain": explain_count,
    }

    user_message = build_exam_question_user_message(
        case_title=case_title,
        case_details=case_details,
        mcq_count=mcq_count,
        short_count=short_count,
        explain_count=explain_count,
        station_index=station_index,
    )

    token_budget = _exam_question_token_budget(
        mcq_count=mcq_count,
        short_count=short_count,
        explain_count=explain_count,
    )

    try:
        if hasattr(llm, "create_chat_completion"):
            raw = _generate_exam_questions_with_chat_completion(user_message, token_budget)
        else:
            raw = _generate_exam_questions_with_fallback_prompt(user_message, token_budget)
    except Exception:
        logger.exception("[VirtualPatientAI] Exam question generation failed.")
        raise

    parsed = _extract_json_object(raw)
    normalized_questions = _normalize_generated_exam_questions(parsed, counts)

    return ExamQuestionGenerateResponse(
        counts=counts,
        questions=[ExamGeneratedQuestion(**q) for q in normalized_questions],
    )

# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    global llm, ACTIVE_GPU_LAYERS

    if Llama is None:
        logger.warning("[VirtualPatientAI] llama_cpp is not installed; model cannot be loaded.")
        llm = None
        ACTIVE_GPU_LAYERS = None
        yield
        logger.info("[VirtualPatientAI] Shutting down.")
        return

    if not MODEL_PATH.exists():
        logger.error("[VirtualPatientAI] Model file not found: %s", MODEL_PATH)
        llm = None
        ACTIVE_GPU_LAYERS = None
        yield
        logger.info("[VirtualPatientAI] Shutting down.")
        return

    logger.info("[VirtualPatientAI] Loading model from: %s", MODEL_PATH)

    candidate_gpu_layers: List[int] = []
    if PREFERRED_GPU_LAYERS not in candidate_gpu_layers:
        candidate_gpu_layers.append(PREFERRED_GPU_LAYERS)
    if 0 not in candidate_gpu_layers:
        candidate_gpu_layers.append(0)

    load_errors: List[str] = []
    llm = None
    ACTIVE_GPU_LAYERS = None

    for gpu_layers in candidate_gpu_layers:
        try:
            logger.info("[VirtualPatientAI] Trying to load model with gpu_layers=%s", gpu_layers)
            llm = Llama(
                model_path=str(MODEL_PATH),
                n_ctx=CTX,
                n_threads=THREADS,
                n_gpu_layers=gpu_layers,
                use_mmap=True,
                use_mlock=False,
                verbose=False,
            )
            ACTIVE_GPU_LAYERS = gpu_layers
            break
        except Exception as e:
            load_errors.append(f"gpu_layers={gpu_layers}: {e}")
            logger.exception("[VirtualPatientAI] Failed loading model with gpu_layers=%s", gpu_layers)
            llm = None

    if llm is None:
        logger.error("[VirtualPatientAI] Failed to load model. Attempts: %s", " | ".join(load_errors))
    else:
        logger.info(
            "[VirtualPatientAI] Model loaded successfully. ctx=%s, threads=%s, gpu_layers=%s",
            CTX,
            THREADS,
            ACTIVE_GPU_LAYERS,
        )

    yield

    logger.info("[VirtualPatientAI] Shutting down.")

# App
app = FastAPI(
    title="Virtual Patient AI",
    version="2.0",
    lifespan=lifespan,
)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": llm is not None,
        "model_path": str(MODEL_PATH),
        "ctx": CTX,
        "threads": THREADS,
        "preferred_gpu_layers": PREFERRED_GPU_LAYERS,
        "active_gpu_layers": ACTIVE_GPU_LAYERS,
        "max_tokens": MAX_TOKENS,
        "max_history_turns": MAX_HISTORY_TURNS,
    }

@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    if llm is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    student_message = (req.student_message or "").strip()
    if not student_message:
        raise HTTPException(status_code=400, detail="student_message is required")

    try:
        reply = generate_reply(
            patient_script=req.patient_script or "",
            history=req.history or [],
            student_message=student_message,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")

    return GenerateResponse(reply=reply)

# Added for exam-question generation
@app.post("/generate-station-questions", response_model=ExamQuestionGenerateResponse)
def generate_station_questions(req: ExamQuestionGenerateRequest):
    if llm is None:
        raise HTTPException(status_code=500, detail="Model not loaded")

    if (req.mcq_count + req.short_count + req.explain_count) <= 0:
        raise HTTPException(status_code=400, detail="At least one question must be requested")

    if not (req.case_details or "").strip():
        raise HTTPException(status_code=400, detail="case_details is required")

    try:
        result = generate_exam_questions(
            case_title=req.case_title or "",
            case_details=req.case_details or "",
            mcq_count=req.mcq_count,
            short_count=req.short_count,
            explain_count=req.explain_count,
            station_index=req.station_index,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Exam question generation failed: {e}")

    return result

# CLI helpers
def _parse_port(argv: List[str]) -> int:
    port = int(os.getenv("VP_PORT", os.getenv("PORT", "9000")))

    # Supports:
    # python virtual_patient_ai.py
    # python virtual_patient_ai.py 9000
    # python virtual_patient_ai.py port 9000
    if len(argv) >= 2:
        if argv[1].lower() == "port" and len(argv) >= 3:
            try:
                port = int(argv[2])
            except ValueError:
                pass
        else:
            try:
                port = int(argv[1])
            except ValueError:
                pass

    return port

if __name__ == "__main__":
    import uvicorn

    port = _parse_port(sys.argv)

    # Important: keep reload=False here.
    # Reload was contributing to unstable reloading / GPU memory issues.
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        reload=False,
        log_level=os.getenv("VP_UVICORN_LOG_LEVEL", "info"),
    )