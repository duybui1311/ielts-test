from __future__ import annotations
import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Literal, cast
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Body, status
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
from ..service.database import get_db
from ..service.redis_cache import (
    draft_save_answer, draft_get_answers,
    draft_append_msg, draft_get_msgs, draft_clear_attempt
)
from ..service.schemas import StationContentOut, QuestionOut, ChatIn, AnswerIn
# ---------- Logging & Config ----------

logger = logging.getLogger("attempts")
if not logger.handlers:
    logging.basicConfig(
        level=os.getenv("APP_LOG_LEVEL", "INFO"),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

VP_SERVICE_URL = os.getenv("VP_SERVICE_URL", "http://127.0.0.1:9000").rstrip("/")
VP_GENERATE_PATH = os.getenv("VP_GENERATE_PATH", "/generate")
VP_CONNECT_TIMEOUT_S = float(os.getenv("VP_CONNECT_TIMEOUT_S", "10"))
VP_READ_TIMEOUT_S = float(os.getenv("VP_READ_TIMEOUT_S", "180"))

router = APIRouter(prefix="/api/attempts", tags=["attempts"])

CASE_TITLE_COL = "title"        # cases.title
CASE_SCRIPT_COL = "body_md"     # cases.body_md
Q_OPTIONS_COL  = "options_json" # questions.options_json
Q_ORDER_COL    = "display_order"
MSG_TEXT_COL   = "content"      # chat_messages.content

# ---------- SQL strings  ----------
SQL_GET_ATTEMPT = """
SELECT id FROM exam_attempts WHERE exam_id=:e AND user_id=:u
"""

SQL_CREATE_ATTEMPT = """
INSERT INTO exam_attempts (exam_id, user_id, status, started_at)
VALUES (:e, :u, 'draft', NOW())
"""

SQL_LAST_INSERT_ID = "SELECT LAST_INSERT_ID()"

SQL_GET_STATION_BY_POS = f"""
SELECT s.id AS station_id, c.{CASE_TITLE_COL} AS patient_name, c.{CASE_SCRIPT_COL} AS patient_script
FROM stations s
JOIN cases c ON c.id = s.case_id
WHERE s.exam_id = :e AND s.position = :p
LIMIT 1
"""

SQL_GET_STATION_ATTEMPT = """
SELECT id FROM station_attempts
WHERE exam_attempt_id=:a AND station_id=:s
LIMIT 1
"""

SQL_CREATE_STATION_ATTEMPT = """
INSERT INTO station_attempts (exam_attempt_id, station_id, status, started_at)
VALUES (:a, :s, 'draft', NOW())
"""

SQL_LOAD_QUESTIONS = f"""
SELECT id, qtype, prompt, {Q_OPTIONS_COL} AS opts
FROM questions
WHERE station_id=:sid
ORDER BY {Q_ORDER_COL} ASC, id ASC
"""

SQL_SA_BELONGS = """
SELECT sa.id, ea.user_id
FROM station_attempts sa
JOIN exam_attempts ea ON ea.id = sa.exam_attempt_id
WHERE sa.id = :sa AND ea.id = :a
LIMIT 1
"""

SQL_SA_TO_ATTEMPT = """
SELECT ea.id AS attempt_id, ea.user_id
FROM station_attempts sa
JOIN exam_attempts ea ON ea.id = sa.exam_attempt_id
WHERE sa.id = :sa
LIMIT 1
"""

SQL_QTYPES_FOR_IDS = """
SELECT id, qtype FROM questions WHERE id IN :ids
"""

SQL_UPSERT_ANSWER = """
INSERT INTO answers (station_attempt_id, question_id, value_text, choice_index, created_at)
VALUES (:sa, :q, :vt, :ci, NOW())
ON DUPLICATE KEY UPDATE
  value_text = VALUES(value_text),
  choice_index = VALUES(choice_index),
  created_at = VALUES(created_at)
"""

SQL_INSERT_CHAT = f"""
INSERT INTO chat_messages (station_attempt_id, side, {MSG_TEXT_COL}, created_at)
VALUES (:sa, :sd, :ct, NOW())
"""

SQL_MARK_SA_SUBMITTED = """
UPDATE station_attempts
SET status = 'submitted', submitted_at = NOW()
WHERE id = :sa
"""

SQL_MARK_ATTEMPT_SUBMITTED = """
UPDATE exam_attempts
SET status = 'submitted', submitted_at = NOW()
WHERE id = :a
"""

# get patient_script from a station_attempt_id
SQL_GET_PATIENT_SCRIPT_FOR_SA = f"""
SELECT c.{CASE_SCRIPT_COL} AS patient_script
FROM station_attempts sa
JOIN stations s ON s.id = sa.station_id
JOIN cases c ON c.id = s.case_id
WHERE sa.id = :sa
LIMIT 1
"""

def _require_user(x_user_id: Optional[str]) -> int:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    try:
        return int(x_user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid X-User-Id header")

def _get_or_create_attempt(db: Session, user_id: int, exam_id: int) -> int:
    row = db.execute(text(SQL_GET_ATTEMPT), {"e": exam_id, "u": user_id}).mappings().fetchone()
    if row:
        return int(row["id"])
    db.execute(text(SQL_CREATE_ATTEMPT), {"e": exam_id, "u": user_id})
    db.commit()
    attempt_id = int(db.execute(text(SQL_LAST_INSERT_ID)).scalar() or 0)
    return attempt_id

def _get_station_by_position(db: Session, exam_id: int, position: int):
    return db.execute(text(SQL_GET_STATION_BY_POS), {"e": exam_id, "p": position}).mappings().fetchone()

def _get_or_create_station_attempt(db: Session, attempt_id: int, station_id: int) -> int:
    row = db.execute(
        text(SQL_GET_STATION_ATTEMPT),
        {"a": attempt_id, "s": station_id}
    ).mappings().fetchone()
    if row:
        return int(row["id"])
    db.execute(text(SQL_CREATE_STATION_ATTEMPT), {"a": attempt_id, "s": station_id})
    db.commit()
    sa_id = int(db.execute(text(SQL_LAST_INSERT_ID)).scalar() or 0)
    return sa_id

def _load_questions(db: Session, station_id: int) -> List[QuestionOut]:
    rows = db.execute(text(SQL_LOAD_QUESTIONS), {"sid": station_id}).mappings().fetchall()
    out: List[QuestionOut] = []
    import json as _json
    for r in rows:
        raw = r.get("opts")
        opts = None
        if isinstance(raw, list):
            opts = raw
        elif isinstance(raw, (str, bytes)) and raw:
            try:
                parsed = _json.loads(raw)
                if isinstance(parsed, list):
                    opts = parsed
            except Exception:
                opts = None

        qtype: Literal["mcq", "short", "explain"] = cast(
            Literal["mcq", "short", "explain"], str(r["qtype"])
        )
        out.append(QuestionOut(
            id=int(r["id"]),
            type=qtype,
            prompt=str(r["prompt"]),
            options=opts
        ))
    return out

def _ensure_station_attempt_belongs(db: Session, station_attempt_id: int, attempt_id: int, user_id: int):
    row = db.execute(text(SQL_SA_BELONGS), {"sa": station_attempt_id, "a": attempt_id}).mappings().fetchone()
    if not row or int(row["user_id"]) != user_id:
        raise HTTPException(status_code=404, detail="Station attempt not found for this user/attempt")

# ---------- Virtual Patient helpers ----------
def _build_vp_history(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    history: List[Dict[str, str]] = []
    for m in messages or []:
        txt = (m.get("text") or "").strip()
        if not txt:
            continue
        side_raw = (m.get("side") or "").lower()
        if side_raw in ("user", "right", "student"):
            side = "student"
        else:
            side = "patient"
        history.append({"side": side, "text": txt})
    return history

def _call_virtual_patient(
    patient_script: str,
    history: List[Dict[str, str]],
    student_message: str,
) -> str:
    payload = {
        "patient_script": patient_script,
        "history": history,
        "student_message": student_message,
    }

    timeout = httpx.Timeout(
        connect=VP_CONNECT_TIMEOUT_S,
        read=VP_READ_TIMEOUT_S,
        write=30.0,
        pool=30.0,
    )

    last_error = None

    for base_url in _vp_candidate_urls():
        url = f"{base_url}{VP_GENERATE_PATH}"

        try:
            logger.info("Calling virtual patient service at %s", url)

            resp = httpx.post(
                url,
                json=payload,
                timeout=timeout,
            )

            if resp.status_code != 200:
                logger.error(
                    "virtual_patient_ai returned %s from %s: %s",
                    resp.status_code,
                    url,
                    resp.text,
                )
                last_error = f"HTTP {resp.status_code} from {url}: {resp.text}"
                continue

            data = resp.json()
            reply = (data.get("reply") or "").strip()

            if not reply:
                logger.error("virtual_patient_ai returned empty reply from %s: %s", url, data)
                last_error = f"Empty reply from {url}"
                continue

            logger.info("Virtual patient service succeeded via %s", url)
            return reply

        except httpx.ReadTimeout as e:
            last_error = f"ReadTimeout from {url}: {e}"
            logger.exception("Read timeout calling virtual patient service at %s", url)

        except httpx.ConnectError as e:
            last_error = f"ConnectError from {url}: {e}"
            logger.exception("Connect error calling virtual patient service at %s", url)

        except Exception as e:
            last_error = f"{type(e).__name__} from {url}: {e}"
            logger.exception("Failed calling virtual patient service at %s", url)

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Could not reach virtual patient service: {last_error}",
    )

def _vp_candidate_urls() -> List[str]:
    """
    Try a few practical local addresses.
    This helps when localhost/127.0.0.1 behave differently
    depending on Windows / Docker / WSL setup.
    """
    base = VP_SERVICE_URL.rstrip("/")
    candidates = [base]

    if "localhost" in base:
        candidates.append(base.replace("localhost", "127.0.0.1"))
    elif "127.0.0.1" in base:
        candidates.append(base.replace("127.0.0.1", "localhost"))

    # Useful when attempts runs in Docker but VP runs on host machine
    candidates.append("http://host.docker.internal:9000")

    # de-duplicate while preserving order
    seen = set()
    ordered = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            ordered.append(c)
    return ordered

# ================== Endpoints ==================
@router.get("/circuits/{exam_id}/stations/{position}", response_model=StationContentOut)
def get_station(
    exam_id: int,
    position: int,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    user_id = _require_user(x_user_id)
    try:
        # Find the station row (joins stations + cases)
        st = _get_station_by_position(db, exam_id, position)
        if not st:
            raise HTTPException(status_code=404, detail="Station not found")

        station_id = int(st["station_id"])
        # Get or create the overall exam_attempt for this user/exam
        attempt_id = _get_or_create_attempt(db, user_id, exam_id)
        # Get or create the station_attempt
        station_attempt_id = _get_or_create_station_attempt(db, attempt_id, station_id)
        # Load questions for this station
        questions = _load_questions(db, station_id)
        # Try to load any draft messages from Redis.
        # If Redis is down or misconfigured, we just log and continue with [].
        try:
            draft_msgs = draft_get_msgs(attempt_id, station_attempt_id)
        except Exception as e:
            logger.error("draft_get_msgs failed: %s", e)
            draft_msgs = []
        return StationContentOut(
            attempt_id=attempt_id,
            station_attempt_id=station_attempt_id,
            patient_name=st.get("patient_name") or "",
            patient_script=st.get("patient_script") or "",
            questions=questions,
            initial_messages=draft_msgs or [],
        )
    except HTTPException:
        # Re-raise explicit HTTP errors unchanged
        raise
    except Exception as e:
        # Log full traceback on the server and return a useful message
        logger.exception("get_station failed for exam_id=%s position=%s", exam_id, position)
        raise HTTPException(
            status_code=500,
            detail=f"get_station failed: {e}",
        )

@router.post("/station/{station_attempt_id}/answers", status_code=status.HTTP_204_NO_CONTENT)
def draft_answer(
    station_attempt_id: int,
    payload: AnswerIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    user_id = _require_user(x_user_id)
    row = db.execute(text(SQL_SA_TO_ATTEMPT), {"sa": station_attempt_id}).mappings().fetchone()
    if not row or int(row["user_id"]) != user_id:
        raise HTTPException(status_code=404, detail="Station attempt not found")
    attempt_id = int(row["attempt_id"])
    qid = int(payload.question_id)
    draft_save_answer(attempt_id, station_attempt_id, qid, payload.value)
    return  # 204

@router.post("/station/{station_attempt_id}/chat")
def draft_chat(
    station_attempt_id: int,
    payload: ChatIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    user_id = _require_user(x_user_id)
    # Ensure station_attempt belongs to this user and get attempt_id
    row = db.execute(text(SQL_SA_TO_ATTEMPT), {"sa": station_attempt_id}).mappings().fetchone()
    if not row or int(row["user_id"]) != user_id:
        raise HTTPException(status_code=404, detail="Station attempt not found")
    attempt_id = int(row["attempt_id"])
    student_text = (payload.text or "").strip()
    if not student_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    # Get patient_script for this station_attempt
    ps_row = db.execute(
        text(SQL_GET_PATIENT_SCRIPT_FOR_SA),
        {"sa": station_attempt_id}
    ).mappings().fetchone()
    if not ps_row:
        raise HTTPException(status_code=400, detail="No patient script found for this station_attempt")
    patient_script = (ps_row.get("patient_script") or "").strip()
    if not patient_script:
        raise HTTPException(status_code=400, detail="Empty patient script for this station_attempt")
    # Load existing draft messages to build conversation history
    draft_msgs = draft_get_msgs(attempt_id, station_attempt_id) or []
    history_for_vp = _build_vp_history(draft_msgs)
    history_for_vp.append({"side": "student", "text": student_text})

    patient_reply = _call_virtual_patient(
        patient_script=patient_script,
        history=history_for_vp,
        student_message=student_text,
    )
    # Only persist chat after VP succeeded
    draft_append_msg(attempt_id, station_attempt_id, side="user", text=student_text)
    ai = draft_append_msg(attempt_id, station_attempt_id, side="ai", text=patient_reply)
    return {"message": ai}

@router.post("/submit")
def submit_attempt(
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """
    {
      "attempt_id": <int|null>,
      "circuit_id": <exam_id>,
      "stations": [
        {
          "station_attempt_id": <int>,
          "answers":  { "123": 1, "124": "text" },
          "messages": [ { "side":"right|left", "text":"..." } ]
        }
      ]
    }
    """
    user_id = _require_user(x_user_id)
    exam_id = int(body.get("circuit_id") or 0)
    if not exam_id:
        raise HTTPException(status_code=400, detail="Missing circuit_id")

    attempt_id = body.get("attempt_id")
    if attempt_id is None:
        row = db.execute(text(SQL_GET_ATTEMPT), {"e": exam_id, "u": user_id}).mappings().fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Attempt not found")
        attempt_id = int(row["id"])
    else:
        row = db.execute(
            text("SELECT user_id FROM exam_attempts WHERE id=:a AND exam_id=:e"),
            {"a": attempt_id, "e": exam_id}
        ).mappings().fetchone()
        if not row or int(row["user_id"]) != user_id:
            raise HTTPException(status_code=404, detail="Attempt invalid")

    stations = body.get("stations") or []

    try:
        for st in stations:
            sa_id = int(st.get("station_attempt_id") or 0)
            if not sa_id:
                continue

            owner = db.execute(
                text("""
                SELECT ea.user_id
                FROM station_attempts sa
                JOIN exam_attempts ea ON ea.id = sa.exam_attempt_id
                WHERE sa.id = :sa AND ea.id = :a
                LIMIT 1
                """),
                {"sa": sa_id, "a": attempt_id}
            ).mappings().fetchone()
            if not owner or int(owner["user_id"]) != user_id:
                raise HTTPException(status_code=404, detail="Station attempt does not belong to user/attempt")

            # ---- persist answers ----
            draft_ans = draft_get_answers(attempt_id, sa_id)  # {qid: value}
            payload_ans: Dict[str, Any] = st.get("answers") or {}
            merged: Dict[int, Any] = dict(draft_ans)
            for k, v in payload_ans.items():
                try:
                    merged[int(k)] = v
                except Exception:
                    pass

            if merged:
                qids = tuple(merged.keys())
                stmt = text(SQL_QTYPES_FOR_IDS).bindparams(bindparam("ids", expanding=True))
                qrows = db.execute(stmt, {"ids": qids}).mappings().fetchall()
                qtype_by_id = {int(r["id"]): str(r["qtype"]) for r in qrows}

                for qid, val in merged.items():
                    qtype = qtype_by_id.get(int(qid), "short")
                    choice_index = None
                    value_text = None
                    if qtype == "mcq":
                        try:
                            choice_index = int(val) if val is not None else None
                        except Exception:
                            choice_index = None
                    else:
                        value_text = str(val) if val is not None else None

                    db.execute(
                        text(SQL_UPSERT_ANSWER),
                        {"sa": sa_id, "q": int(qid), "vt": value_text, "ci": choice_index}
                    )

            # ---- persist chat ----
            draft_msgs = draft_get_msgs(attempt_id, sa_id)  # [{side,text}]
            payload_msgs = st.get("messages") or []
            normalized: List[Dict[str, str]] = []

            for m in payload_msgs:
                side = "user" if (m.get("side") or "").lower() in ("right", "user") else "ai"
                txt = (m.get("text") or "").strip()
                if txt:
                    normalized.append({"side": side, "text": txt})

            for dm in draft_msgs:
                txt = (dm.get("text") or "").strip()
                sd = (dm.get("side") or "user").lower()
                if txt:
                    normalized.append({"side": "user" if sd in ("user", "right") else "ai", "text": txt})

            for m in normalized:
                db.execute(text(SQL_INSERT_CHAT), {"sa": sa_id, "sd": m["side"], "ct": m["text"]})

            db.execute(text(SQL_MARK_SA_SUBMITTED), {"sa": sa_id})

        db.execute(text(SQL_MARK_ATTEMPT_SUBMITTED), {"a": attempt_id})
        db.commit()
        draft_clear_attempt(attempt_id)

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Submit failed: {e}")

    ref = f"SUB-{attempt_id}-{int(datetime.now().timestamp())}"
    return {"ok": True, "reference_id": ref}
