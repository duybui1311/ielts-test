import hashlib
from typing import Optional
from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..service.database import get_db
from ..service.models import AttemptStatus
from ..service.schemas import (
    CircuitListOut,
    CircuitItemOut,
    CircuitAccessIn,
    CircuitAccessOut,
)
from .attempts import _require_user
router = APIRouter(
    prefix="/api/circuits",
    tags=["circuits"],
)
@router.get("", response_model=CircuitListOut)
@router.get("", response_model=CircuitListOut)
def list_circuits(
    request: Request,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    search: str = Query("", description="Search by circuit/exam name"),
    status_filter: str = Query("all", alias="status"),
    difficulty: str = Query("all"),
    type_filter: str = Query("all", alias="type"),
    sort: str = Query("progress_desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=50),
) -> CircuitListOut:
    """
    Returns circuits (exams) visible to the user, with per-station progress.
    Simplified list **all** exams in the system, without requiring
    class_enrolments. Access control is still enforced by the access-code
    endpoint.
    """
    user_id = _require_user(x_user_id)

    where_clauses: list[str] = []
    params: dict[str, object] = {"user_id": user_id}

    if search:
        where_clauses.append("e.name LIKE :search")
        params["search"] = f"%{search}%"

    # difficulty: "all" | "Low" | "Medium" | "High"
    if difficulty and difficulty.lower() != "all":
        where_clauses.append("e.difficulty = :difficulty")
        params["difficulty"] = difficulty.lower()

    # type_filter: "all" | "Exam" | "Practice"
    if type_filter and type_filter.lower() != "all":
        where_clauses.append("e.exam_type = :etype")
        params["etype"] = type_filter.lower()

    where_sql = " AND ".join(where_clauses) or "1=1"

    sql = f"""
        SELECT
            e.id,
            e.name,
            e.exam_type,
            e.difficulty,
            e.total_stations,
            e.time_limit_min,
            e.reading_min,
            ea.status AS attempt_status,
            COUNT(CASE WHEN sa.status <> 'draft' THEN 1 END) AS done_stations
        FROM exams e
        LEFT JOIN exam_attempts ea
               ON ea.exam_id = e.id AND ea.user_id = :user_id
        LEFT JOIN station_attempts sa
               ON sa.exam_attempt_id = ea.id
        WHERE {where_sql}
        GROUP BY
            e.id, e.name, e.exam_type, e.difficulty,
            e.total_stations, e.time_limit_min, e.reading_min, ea.status
    """
    rows = db.execute(text(sql), params).mappings().all()
    items: list[CircuitItemOut] = []
    for row in rows:
        total_stations = int(row["total_stations"])
        done = int(row["done_stations"] or 0)
        total_time = int(row["time_limit_min"])
        reading_min = int(row["reading_min"] or 0)
        # ---- Progress % (0–100) ----
        if total_stations > 0:
            progress = int(round(100.0 * done / total_stations))
        else:
            progress = 0
        # ---- Map DB enums -> UI labels ----
        exam_type_db = (row["exam_type"] or "").lower()
        difficulty_db = (row["difficulty"] or "").lower()
        attempt_status = row["attempt_status"]
        type_ui = "Exam" if exam_type_db == "exam" else "Practice"
        if difficulty_db == "low":
            difficulty_ui = "Low"
        elif difficulty_db == "medium":
            difficulty_ui = "Medium"
        elif difficulty_db == "high":
            difficulty_ui = "High"
        else:
            difficulty_ui = difficulty_db.capitalize() or "Unknown"
        # statusState: "not_started" | "in_progress" | "submitted" | "graded"
        if attempt_status is None:
            status_state = "not_started"
        else:
            status_str = str(attempt_status)
            if status_str == AttemptStatus.draft.value:
                status_state = "in_progress"
            elif status_str == AttemptStatus.submitted.value:
                status_state = "submitted"
            elif status_str == AttemptStatus.graded.value:
                status_state = "graded"
            else:
                status_state = "in_progress"
        # statusColor for UI
        status_color = "ok" if status_state in ("submitted", "graded") else "fail"
        # Per-station label
        if total_stations > 0:
            work_per_station = max(
                1, int(round((total_time - reading_min) / total_stations))
            )
        else:
            work_per_station = 0
        if reading_min > 0:
            per_station_label = f"{work_per_station} min + {reading_min} min reading"
        else:
            per_station_label = f"{work_per_station} min"
        items.append(
            CircuitItemOut(
                id=int(row["id"]),
                name=row["name"],
                type=type_ui,
                difficulty=difficulty_ui,
                stations=total_stations,
                timeLimit=total_time,
                perStation=per_station_label,
                progress=progress,
                statusState=status_state,
                statusColor=status_color,
            )
        )
    # ---- Filter by status ----
    allowed_status = {"all", "not_started", "in_progress", "submitted", "graded"}
    if status_filter not in allowed_status:
        raise HTTPException(status_code=400, detail="Invalid status filter")
    if status_filter != "all":
        items = [i for i in items if i.statusState == status_filter]
    # ---- Sorting ----
    if sort == "progress_desc":
        items.sort(key=lambda i: i.progress, reverse=True)
    elif sort == "progress_asc":
        items.sort(key=lambda i: i.progress)
    elif sort == "name_asc":
        items.sort(key=lambda i: i.name.lower())
    elif sort == "name_desc":
        items.sort(key=lambda i: i.name.lower(), reverse=True)
    elif sort == "time_desc":
        items.sort(key=lambda i: i.timeLimit, reverse=True)
    elif sort == "time_asc":
        items.sort(key=lambda i: i.timeLimit)
    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]
    return CircuitListOut(items=page_items, total=total)
# ---------------------------------------------------------------------
# POST /api/circuits/{exam_id}/access
# Verify access code + academic integrity, log to exam_access_logs.
# ---------------------------------------------------------------------
@router.post("/{exam_id}/access", response_model=CircuitAccessOut)
def verify_access_code(
    exam_id: int,
    payload: CircuitAccessIn,
    request: Request,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> CircuitAccessOut:
    """
    Used by Stations' access modal when user presses "Start circuit".

    Flow:
      1) Require X-User-Id header (same helper as attempts.py).
      2) Check exam exists.
      3) Verify SHA-256(access_code) == exams.access_code_hash.
      4) Require academic integrity checkbox.
      5) Log into exam_access_logs.
      6) Return basic exam info for the frontend.
    """
    user_id = _require_user(x_user_id)

    if not payload.accept_integrity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must accept the academic integrity declaration.",
        )

    # Fetch exam + stored hash
    row = db.execute(
        text(
            """
            SELECT id, name, total_stations, access_code_hash
            FROM exams
            WHERE id = :id
            LIMIT 1
            """
        ),
        {"id": exam_id},
    ).mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Exam not found")

    expected_hash = row["access_code_hash"]
    provided_hash = hashlib.sha256(payload.access_code.encode("utf-8")).hexdigest()

    if provided_hash != expected_hash:
        # Wrong code → do not log successful access
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid access code",
        )

    total_stations = int(row["total_stations"])
    name = row["name"]

    # ---- Log access to exam_access_logs ----
    ip_addr = request.client.host if request.client else ""
    user_agent = request.headers.get("User-Agent", "")

    db.execute(
        text(
            """
            INSERT INTO exam_access_logs
                (exam_id, user_id, ip, user_agent, accepted_integrity)
            VALUES
                (:exam_id, :user_id, :ip, :user_agent, :accepted)
            """
        ),
        {
            "exam_id": exam_id,
            "user_id": user_id,
            "ip": ip_addr[:64],
            "user_agent": user_agent[:500],
            "accepted": payload.accept_integrity,
        },
    )
    db.commit()

    return CircuitAccessOut(
        ok=True,
        circuit_id=exam_id,
        total_stations=total_stations,
        name=name,
    )
