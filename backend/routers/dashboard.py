from __future__ import annotations

import json
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..service.database import get_db
from ..service.schemas import (
    AttemptPoint,
    DashboardOut,
    KpiOut,
    NoteOut,
    StationHistoryItem,
)
from .attempts import _require_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _relative_time(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    now = datetime.utcnow()
    if getattr(dt, "tzinfo", None) is not None and dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    secs = int((now - dt).total_seconds())
    if secs < 60:
        return "just now"
    if secs < 3600:
        return f"{secs // 60}m ago"
    if secs < 86400:
        return f"{secs // 3600}h ago"
    if secs < 604800:
        return f"{secs // 86400}d ago"
    return dt.strftime("%d %b %Y")


def _tags_to_system(tags: Any) -> Optional[str]:
    if tags is None:
        return None
    if isinstance(tags, list):
        return ", ".join(str(t) for t in tags[:5]) if tags else None
    if isinstance(tags, str):
        try:
            parsed = json.loads(tags)
            if isinstance(parsed, list):
                return ", ".join(str(t) for t in parsed[:5])
        except Exception:
            pass
        return tags[:200] if tags else None
    return str(tags)[:200]


def _diff_ui(d: Optional[str]) -> Optional[str]:
    m = {"low": "Low", "medium": "Medium", "high": "High"}
    return m.get((d or "").lower(), (d or "").capitalize() or None)


def _type_ui(t: Optional[str]) -> str:
    return "Exam" if (t or "").lower() == "exam" else "Practice"


def _status_from_pct(pct: float) -> str:
    if pct >= 0.70:
        return "Pass"
    if pct >= 0.50:
        return "Borderline"
    return "Fail"


@router.get("", response_model=DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> DashboardOut:
    user_id = _require_user(x_user_id)

    row = db.execute(
        text(
            """
            SELECT
                (
                    SELECT COALESCE(SUM(sa.work_min), 0)
                    FROM station_attempts sa
                    INNER JOIN exam_attempts ea2 ON ea2.id = sa.exam_attempt_id
                    WHERE ea2.user_id = :uid
                      AND COALESCE(sa.submitted_at, sa.started_at)
                          >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
                ) AS time_spent_min,
                (SELECT COUNT(*) FROM exam_attempts WHERE user_id = :uid) AS attempts
            """
        ),
        {"uid": user_id},
    ).mappings().fetchone()
    time_spent_min = int(row["time_spent_min"] or 0) if row else 0
    attempts_count = int(row["attempts"] or 0) if row else 0

    graded_rows = db.execute(
        text(
            """
            SELECT ea.exam_id, ea.total_score
            FROM exam_attempts ea
            WHERE ea.user_id = :uid
              AND ea.status = 'graded'
              AND ea.total_score IS NOT NULL
            ORDER BY COALESCE(ea.graded_at, ea.submitted_at, ea.started_at) DESC,
                     ea.id DESC
            LIMIT 10
            """
        ),
        {"uid": user_id},
    ).mappings().fetchall()

    pct_values: List[float] = []
    for gr in graded_rows:
        eid = int(gr["exam_id"])
        ts = float(gr["total_score"] or 0)
        mx_row = db.execute(
            text(
                """
                SELECT COALESCE(SUM(r.max_points), 0) AS mx
                FROM rubrics r
                INNER JOIN stations s ON s.id = r.station_id
                WHERE s.exam_id = :eid
                """
            ),
            {"eid": eid},
        ).mappings().fetchone()
        mx = float(mx_row["mx"] or 0) if mx_row else 0.0
        if mx > 0:
            pct_values.append(min(100.0, max(0.0, ts * 100.0 / mx)))
    avg_score_pct = sum(pct_values) / len(pct_values) if pct_values else 0.0

    latest = db.execute(
        text(
            """
            SELECT id FROM exam_attempts
            WHERE user_id = :uid
            ORDER BY COALESCE(submitted_at, started_at) DESC, id DESC
            LIMIT 1
            """
        ),
        {"uid": user_id},
    ).mappings().fetchone()
    critical_misses = 0
    if latest:
        aid = int(latest["id"])
        miss_row = db.execute(
            text(
                """
                SELECT COUNT(*) AS n
                FROM rubric_marks rm
                INNER JOIN station_attempts sa ON sa.id = rm.station_attempt_id
                WHERE sa.exam_attempt_id = :aid AND rm.met = 0
                """
            ),
            {"aid": aid},
        ).mappings().fetchone()
        critical_misses = int(miss_row["n"] or 0) if miss_row else 0

    chart_rows = db.execute(
        text(
            """
            SELECT
                YEAR(ea.started_at) AS y,
                MONTH(ea.started_at) AS m,
                CONCAT(LEFT(MONTHNAME(ea.started_at), 3), ' ', YEAR(ea.started_at)) AS month_lbl,
                COUNT(*) AS cnt
            FROM exam_attempts ea
            WHERE ea.user_id = :uid
              AND ea.started_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 12 MONTH)
            GROUP BY y, m, month_lbl
            ORDER BY y ASC, m ASC
            """
        ),
        {"uid": user_id},
    ).mappings().fetchall()
    chart = [
        AttemptPoint(month=str(r["month_lbl"]), attempts=int(r["cnt"] or 0))
        for r in chart_rows
    ]

    station_rows = db.execute(
        text(
            """
            SELECT
                sa.id AS sa_id,
                c.title AS case_title,
                e.exam_type,
                e.difficulty,
                c.tags,
                sa.station_id,
                COALESCE(SUM(rm.points), 0) AS earned_pts,
                (
                    SELECT COALESCE(SUM(r2.max_points), 0)
                    FROM rubrics r2
                    WHERE r2.station_id = sa.station_id
                ) AS max_pts
            FROM station_attempts sa
            INNER JOIN exam_attempts ea ON ea.id = sa.exam_attempt_id
            INNER JOIN stations st ON st.id = sa.station_id
            INNER JOIN cases c ON c.id = st.case_id
            INNER JOIN exams e ON e.id = st.exam_id
            LEFT JOIN rubric_marks rm ON rm.station_attempt_id = sa.id
            WHERE ea.user_id = :uid
              AND sa.status IN ('submitted', 'graded')
            GROUP BY sa.id, c.title, e.exam_type, e.difficulty, c.tags, sa.station_id
            ORDER BY COALESCE(sa.submitted_at, sa.started_at) DESC
            LIMIT 48
            """
        ),
        {"uid": user_id},
    ).mappings().fetchall()

    stations: List[StationHistoryItem] = []
    for sr in station_rows:
        earned = float(sr["earned_pts"] or 0)
        max_pts = float(sr["max_pts"] or 0)
        if max_pts > 0:
            progress = min(1.0, max(0.0, earned / max_pts))
            pct = progress
        else:
            progress = 0.0
            pct = 0.0
        stations.append(
            StationHistoryItem(
                id=int(sr["sa_id"]),
                title=str(sr["case_title"] or "Station"),
                type=_type_ui(sr["exam_type"]),
                system=_tags_to_system(sr["tags"]),
                difficulty=_diff_ui(sr["difficulty"]),
                progress=progress,
                status=_status_from_pct(pct),
            )
        )

    note_rows = db.execute(
        text(
            """
            SELECT f.text, f.created_at
            FROM feedback f
            INNER JOIN station_attempts sa ON sa.id = f.station_attempt_id
            INNER JOIN exam_attempts ea ON ea.id = sa.exam_attempt_id
            WHERE ea.user_id = :uid
            ORDER BY f.created_at DESC
            LIMIT 30
            """
        ),
        {"uid": user_id},
    ).mappings().fetchall()
    notes = [
        NoteOut(time=_relative_time(nr["created_at"]), text=str(nr["text"] or ""))
        for nr in note_rows
        if nr.get("text")
    ]

    return DashboardOut(
        kpis=KpiOut(
            time_spent_min=time_spent_min,
            avg_score_pct=round(avg_score_pct, 1),
            critical_misses=critical_misses,
            attempts=attempts_count,
        ),
        chart=chart,
        stations=stations,
        notes=notes,
    )
