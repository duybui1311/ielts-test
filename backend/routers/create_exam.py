from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, List, Optional
import hashlib
import json
import os
import httpx
from pydantic import BaseModel, Field
from ..service.database import get_db
from ..service.schemas import ExamCreateFullIn, ExamCreateOut

router = APIRouter(prefix="/api", tags=["exams"])

# Local schemas for AI station generation
class StationQuestionGenerateIn(BaseModel):
    case_id: int
    mcq_count: int = Field(0, ge=0, le=20)
    short_count: int = Field(0, ge=0, le=20)
    explain_count: int = Field(0, ge=0, le=20)
    station_index: Optional[int] = None

class GeneratedQuestionOut(BaseModel):
    type: str
    text: str
    options: Optional[List[str]] = None
    correct_index: Optional[int] = None
    answer: Optional[str] = None
    reference: Optional[str] = None

class StationQuestionGenerateOut(BaseModel):
    case_id: int
    counts: Dict[str, int]
    questions: List[GeneratedQuestionOut]

# --------------------------------------------------------------------
# Helpers for AI question generation
# --------------------------------------------------------------------
IGNORED_CASE_KEYS = {
    "id",
    "created_at",
    "updated_at",
    "deleted_at",
    "owner_id",
    "created_by",
    "updated_by",
}

def _build_case_context(case_row: Dict[str, Any]) -> Dict[str, str]:
    title = str(
        case_row.get("title")
        or case_row.get("name")
        or f"Case #{case_row.get('id', 'Unknown')}"
    ).strip()

    lines: List[str] = []
    for key, value in case_row.items():
        if key in IGNORED_CASE_KEYS or value is None:
            continue
        if isinstance(value, (bytes, bytearray)):
            continue

        if isinstance(value, (dict, list)):
            rendered = json.dumps(value, ensure_ascii=False)
        else:
            rendered = str(value).strip()

        if not rendered:
            continue

        pretty_key = key.replace("_", " ").strip().title()
        lines.append(f"{pretty_key}: {rendered}")

    return {
        "title": title,
        "context": "\n".join(lines),
    }

def _parse_timeout_env(name: str, default: Optional[float]) -> Optional[float]:
    raw = os.getenv(name)

    if raw is None:
        return default

    value = str(raw).strip().lower()
    if value in {"", "none", "null", "off", "false", "0", "-1"}:
        return None

    try:
        parsed = float(value)
    except ValueError:
        return default

    if parsed <= 0:
        return None

    return parsed

def _call_llm_generator(payload: Dict[str, Any]) -> Dict[str, Any]:
    base_url = os.getenv("LLM_SERVICE_URL", "http://127.0.0.1:9000").rstrip("/")
    url = f"{base_url}/generate-station-questions"

    connect_timeout = _parse_timeout_env("LLM_CONNECT_TIMEOUT_SEC", 10.0)
    read_timeout = _parse_timeout_env("LLM_READ_TIMEOUT_SEC", None)   # None = wait as long as needed
    write_timeout = _parse_timeout_env("LLM_WRITE_TIMEOUT_SEC", 60.0)
    pool_timeout = _parse_timeout_env("LLM_POOL_TIMEOUT_SEC", 60.0)

    timeout = httpx.Timeout(
        connect=connect_timeout,
        read=read_timeout,
        write=write_timeout,
        pool=pool_timeout,
    )

    try:
        with httpx.Client(timeout=timeout) as client:
            res = client.post(url, json=payload)

    except httpx.ConnectTimeout:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach the LLM question generator: {url} -> connect timed out after {connect_timeout}s",
        )
    except httpx.ReadTimeout:
        wait_label = "unlimited wait disabled by timeout config" if read_timeout is None else f"{read_timeout}s"
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach the LLM question generator: {url} -> read timed out after {wait_label}",
        )
    except httpx.WriteTimeout:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach the LLM question generator: {url} -> write timed out after {write_timeout}s",
        )
    except httpx.PoolTimeout:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach the LLM question generator: {url} -> connection pool timed out after {pool_timeout}s",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach the LLM question generator: {url} -> {exc}",
        )

    if not res.is_success:
        try:
            err_data = res.json()
            err_detail = err_data.get("detail", err_data)
        except Exception:
            err_detail = res.text

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM question generator failed: {url} -> HTTP {res.status_code}. {err_detail}",
        )

    try:
        data = res.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM question generator returned invalid JSON: {exc}",
        )

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LLM question generator returned a non-object JSON response.",
        )

    return data

# Metadata for CreateNewExam: classes + enums
@router.get("/debug-classes")
def debug_classes(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT id, name, owner_id FROM classes ORDER BY id")
    ).mappings().all()
    return [dict(r) for r in rows]

@router.get("/exams/metadata")
def get_exams_metadata(db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = db.execute(
        text("SELECT id, name FROM classes ORDER BY name ")
    ).mappings().all()

    classes = [{"id": row["id"], "name": row["name"]} for row in rows]

    return {
        "classes": classes,
        "types": ["Exam", "Practice"],
        "difficulties": ["Low", "Medium", "High"],
    }

# Case search for the station builder
@router.get("/cases")
def search_cases(
    search: str = "",
    page: int = 1,
    page_size: int = 6,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    search = (search or "").strip()
    params: Dict[str, Any] = {}
    where_sql = ""

    if search:
        where_sql = "WHERE title LIKE :q"
        params["q"] = f"%{search}%"

    total = db.execute(
        text(f"SELECT COUNT(*) AS c FROM cases {where_sql}"),
        params,
    ).scalar_one()

    page = max(page, 1)
    page_size = max(min(page_size, 50), 1)
    offset = (page - 1) * page_size
    params.update({"limit": page_size, "offset": offset})

    rows = db.execute(
        text(
            f"""
            SELECT id, title
            FROM cases
            {where_sql}
            ORDER BY id
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).mappings().all()

    items = [{"id": row["id"], "name": row["title"]} for row in rows]

    return {"items": items, "total": total}

# AI station question generation
@router.post(
    "/exams/generate-station-questions",
    response_model=StationQuestionGenerateOut,
)
def generate_station_questions(
    payload: StationQuestionGenerateIn,
    db: Session = Depends(get_db),
) -> StationQuestionGenerateOut:
    counts = {
        "mcq": payload.mcq_count,
        "short": payload.short_count,
        "explain": payload.explain_count,
    }

    total_requested = sum(counts.values())
    if total_requested <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one question must be requested.",
        )

    case_row = db.execute(
        text("SELECT * FROM cases WHERE id = :case_id LIMIT 1"),
        {"case_id": payload.case_id},
    ).mappings().first()

    if not case_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case {payload.case_id} was not found.",
        )

    case_info = _build_case_context(dict(case_row))

    data = _call_llm_generator(
        {
            "case_title": case_info["title"],
            "case_details": case_info["context"],
            "mcq_count": payload.mcq_count,
            "short_count": payload.short_count,
            "explain_count": payload.explain_count,
            "station_index": payload.station_index,
        }
    )

    try:
        returned_counts = data.get("counts", counts)
        raw_questions = data.get("questions", [])

        if not isinstance(returned_counts, dict):
            raise ValueError("counts is missing or invalid")
        if not isinstance(raw_questions, list):
            raise ValueError("questions is missing or invalid")

        normalized_counts = {
            "mcq": int(returned_counts.get("mcq", counts["mcq"])),
            "short": int(returned_counts.get("short", counts["short"])),
            "explain": int(returned_counts.get("explain", counts["explain"])),
        }

        return StationQuestionGenerateOut(
            case_id=payload.case_id,
            counts=normalized_counts,
            questions=[GeneratedQuestionOut(**q) for q in raw_questions],
        )

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM question generator returned invalid station-question payload: {exc}",
        )

# Create exam + stations + questions
@router.post("/exams", response_model=ExamCreateOut, status_code=status.HTTP_201_CREATED)
def create_exam(
    payload: ExamCreateFullIn,
    db: Session = Depends(get_db),
) -> ExamCreateOut:
    if payload.total_stations != len(payload.stations):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="total_stations does not match number of stations in payload.",
        )

    for st in payload.stations:
        if st.case_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Station {st.index} is missing case_id.",
            )
        if not st.questions:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Station {st.index} has no questions.",
            )

    exam_type_db = payload.exam_type.lower()
    difficulty_db = payload.difficulty.lower()

    if exam_type_db not in ("exam", "practice"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid exam_type: {payload.exam_type}",
        )
    if difficulty_db not in ("low", "medium", "high"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid difficulty: {payload.difficulty}",
        )

    access_hash = hashlib.sha256(payload.access_code.encode("utf-8")).hexdigest()
    created_by = 1

    with db.begin():
        db.execute(
            text(
                """
                INSERT INTO exams
                (class_id,
                 name,
                 exam_type,
                 difficulty,
                 total_stations,
                 time_limit_min,
                 reading_min,
                 access_code_hash,
                 description,
                 start_at,
                 created_by)
                VALUES (:class_id,
                        :name,
                        :exam_type,
                        :difficulty,
                        :total_stations,
                        :time_limit_min,
                        :reading_min,
                        :access_code_hash,
                        :description,
                        :start_at,
                        :created_by)
                """
            ),
            {
                "class_id": payload.class_id,
                "name": payload.name,
                "exam_type": exam_type_db,
                "difficulty": difficulty_db,
                "total_stations": payload.total_stations,
                "time_limit_min": payload.time_limit_min,
                "reading_min": payload.per_station.reading_min,
                "access_code_hash": access_hash,
                "description": payload.description or "",
                "start_at": payload.start_at,
                "created_by": created_by,
            },
        )
        exam_id = db.execute(text("SELECT LAST_INSERT_ID()")).scalar_one()

        for st in payload.stations:
            db.execute(
                text(
                    """
                    INSERT INTO stations (exam_id, position, case_id)
                    VALUES (:exam_id, :position, :case_id)
                    """
                ),
                {
                    "exam_id": exam_id,
                    "position": st.index,
                    "case_id": st.case_id,
                },
            )
            station_id = db.execute(text("SELECT LAST_INSERT_ID()")).scalar_one()

            for order_idx, q in enumerate(st.questions, start=1):
                qtype = q.type

                if qtype == "mcq":
                    options_json = json.dumps(q.options or [])
                    correct_index = q.correct_index if q.correct_index is not None else 0
                    reference_text = None
                elif qtype == "short":
                    options_json = None
                    correct_index = None
                    reference_text = q.answer or None
                else:
                    options_json = None
                    correct_index = None
                    reference_text = q.reference or None

                db.execute(
                    text(
                        """
                        INSERT INTO questions
                          (station_id,
                           qtype,
                           prompt,
                           options_json,
                           correct_index,
                           reference_text,
                           display_order)
                        VALUES
                          (:station_id,
                           :qtype,
                           :prompt,
                           :options_json,
                           :correct_index,
                           :reference_text,
                           :display_order)
                        """
                    ),
                    {
                        "station_id": station_id,
                        "qtype": qtype,
                        "prompt": q.text,
                        "options_json": options_json,
                        "correct_index": correct_index,
                        "reference_text": reference_text,
                        "display_order": order_idx,
                    },
                )

    return ExamCreateOut(id=exam_id)