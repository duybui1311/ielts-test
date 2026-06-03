# IELTS Platform — Implementation Guide (Test Version)
Companion to the Runbook. Every code block tells you the **exact file** and whether to **add** or **edit**. Build top to bottom; each step is runnable.

> Conventions: backend is a package, so routers import `from backend.service...` and you run uvicorn from the **repo root**. Auth is deferred for the test version (endpoints take ids directly) — locked down in the Prod phase.

---

## STEP 0 — Add the IELTS fields to the data model

**Edit `backend/service/models.py`.** The imports you need (`String`, `Float`, `Text`, `JSON`) are already imported at the top.

**0a. Add new columns to `Station`** (inside `class Station`):
```python
    skill: Mapped[Optional[str]] = mapped_column(String(20))        # listening|reading|writing|speaking
    audio_url: Mapped[Optional[str]] = mapped_column(String(500))   # Listening audio
```

**0b. Add new columns to `Question`** (inside `class Question`):
```python
    sub_skill: Mapped[Optional[str]] = mapped_column(String(50))    # e.g. matching_headings, gap_fill
    accept_answers: Mapped[Optional[list]] = mapped_column(JSON)    # accepted strings for `short` answers
```

**0c. Add score fields to `StationAttempt`** (inside `class StationAttempt`):
```python
    raw_score: Mapped[Optional[float]] = mapped_column(Float)
    band: Mapped[Optional[float]] = mapped_column(Float)
```

**0d. Add overall band to `ExamAttempt`** (inside `class ExamAttempt`):
```python
    overall_band: Mapped[Optional[float]] = mapped_column(Float)
```

**0e. Add the new `ErrorTag` table** (at the end of the file):
```python
class ErrorTag(Base):
    __tablename__ = "error_tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    station_attempt_id: Mapped[int] = mapped_column(ForeignKey("station_attempts.id"), nullable=False)
    answer_id: Mapped[int] = mapped_column(ForeignKey("answers.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), nullable=False)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), nullable=False)
    skill: Mapped[Optional[str]] = mapped_column(String(20))
    question_type: Mapped[Optional[str]] = mapped_column(String(20))
    sub_skill: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

**0f. Rebuild the test database** (because `create_all` won't add columns to existing tables):
```sql
DROP DATABASE ielts; CREATE DATABASE ielts;
```
Restart the app — `Base.metadata.create_all` rebuilds every table with the new columns.

---

## STEP 1 — Bulk import / export of IELTS tests

**Create `backend/routers/tests_io.py`:**
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import bcrypt
from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/tests", tags=["tests"])

class QuestionIn(BaseModel):
    qtype: str                              # mcq | short | explain
    prompt: str
    options: Optional[List[str]] = None     # for mcq
    correct_index: Optional[int] = None     # for mcq
    accept_answers: Optional[List[str]] = None  # for short
    sub_skill: Optional[str] = None
    display_order: int = 1

class SectionIn(BaseModel):
    position: int
    skill: str                              # listening | reading | writing | speaking
    title: str
    passage_md: str = ""
    audio_url: Optional[str] = None
    questions: List[QuestionIn] = []

class TestIn(BaseModel):
    name: str
    difficulty: str = "medium"              # low | medium | high
    time_limit_min: int = 60
    reading_min: int = 0
    access_code: str = "1234"
    class_id: Optional[int] = None
    created_by: int                         # teacher id (until auth is wired)
    sections: List[SectionIn]

@router.post("/import")
def import_test(payload: TestIn, db: Session = Depends(get_db)):
    # resolve / create a sandbox class so we don't need the full class UI yet
    class_id = payload.class_id
    if not class_id:
        klass = (db.query(models.Class)
                 .filter(models.Class.name == "Sandbox",
                         models.Class.owner_id == payload.created_by).first())
        if not klass:
            klass = models.Class(name="Sandbox", owner_id=payload.created_by)
            db.add(klass); db.flush()
        class_id = klass.id

    code_hash = bcrypt.hashpw(payload.access_code.encode(), bcrypt.gensalt()).decode()
    exam = models.Exam(
        class_id=class_id, name=payload.name,
        exam_type=models.ExamType.practice,
        difficulty=models.DifficultyLevel(payload.difficulty),
        total_stations=len(payload.sections),
        time_limit_min=payload.time_limit_min, reading_min=payload.reading_min,
        access_code_hash=code_hash, created_by=payload.created_by,
    )
    db.add(exam); db.flush()

    for s in payload.sections:
        case = models.Case(title=s.title, body_md=s.passage_md, created_by=payload.created_by)
        db.add(case); db.flush()
        station = models.Station(exam_id=exam.id, position=s.position,
                                 case_id=case.id, skill=s.skill, audio_url=s.audio_url)
        db.add(station); db.flush()
        for q in s.questions:
            db.add(models.Question(
                station_id=station.id, qtype=models.QuestionType(q.qtype),
                prompt=q.prompt, options_json=q.options, correct_index=q.correct_index,
                accept_answers=q.accept_answers, sub_skill=q.sub_skill,
                display_order=q.display_order,
            ))
    db.commit()
    return {"exam_id": exam.id, "sections": len(payload.sections)}

@router.get("/{exam_id}/export")
def export_test(exam_id: int, db: Session = Depends(get_db)):
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    out = {"name": exam.name, "time_limit_min": exam.time_limit_min, "sections": []}
    for st in sorted(exam.stations, key=lambda x: x.position):
        out["sections"].append({
            "position": st.position, "skill": st.skill,
            "title": st.case.title, "passage_md": st.case.body_md,
            "audio_url": st.audio_url,
            "questions": [{
                "qtype": q.qtype.value, "prompt": q.prompt,
                "options": q.options_json, "correct_index": q.correct_index,
                "accept_answers": q.accept_answers, "sub_skill": q.sub_skill,
            } for q in st.questions],
        })
    return out
```

---

## STEP 2 — Auto-grade Reading & Listening (the core)

**Create `backend/service/autograde.py`:**
```python
from datetime import datetime
from sqlalchemy.orm import Session
from backend.service.models import (
    StationAttempt, Station, Question, Answer, ErrorTag,
    ExamAttempt, AttemptStatus,
)

# Approximate raw(/40) -> band. EDITABLE — official tables vary per test.
LISTENING = [(39,9.0),(37,8.5),(35,8.0),(32,7.5),(30,7.0),(26,6.5),(23,6.0),(18,5.5),(16,5.0),(13,4.5),(10,4.0),(6,3.5)]
READING   = [(39,9.0),(37,8.5),(35,8.0),(33,7.5),(30,7.0),(27,6.5),(23,6.0),(19,5.5),(15,5.0),(13,4.5),(10,4.0),(6,3.5)]

def raw_to_band(raw: int, total: int, skill: str) -> float:
    scaled = round(raw / total * 40) if total else 0
    table = LISTENING if skill == "listening" else READING
    for threshold, band in table:
        if scaled >= threshold:
            return band
    return 2.5

def _norm(t):  # normalise short answers
    return " ".join((t or "").strip().lower().split())

def autograde_station_attempt(db: Session, station_attempt_id: int):
    sa = db.query(StationAttempt).filter(StationAttempt.id == station_attempt_id).first()
    if not sa:
        return None
    station = db.query(Station).filter(Station.id == sa.station_id).first()
    questions = {q.id: q for q in db.query(Question).filter(Question.station_id == sa.station_id).all()}
    answers = db.query(Answer).filter(Answer.station_attempt_id == station_attempt_id).all()

    db.query(ErrorTag).filter(ErrorTag.station_attempt_id == station_attempt_id)\
        .delete(synchronize_session=False)

    correct = 0
    autogradable = [q for q in questions.values() if q.qtype.value in ("mcq", "short")]
    for a in answers:
        q = questions.get(a.question_id)
        if not q or q.qtype.value == "explain":   # writing -> AI later
            continue
        if q.qtype.value == "mcq":
            ok = a.choice_index is not None and a.choice_index == q.correct_index
        else:  # short
            accept = {_norm(x) for x in (q.accept_answers or [])}
            ok = _norm(a.value_text) in accept
        a.is_auto_correct = ok
        a.auto_score = 1.0 if ok else 0.0
        if ok:
            correct += 1
        else:
            db.add(ErrorTag(
                station_attempt_id=sa.id, answer_id=a.id,
                user_id=sa.exam_attempt.user_id, exam_id=sa.exam_attempt.exam_id,
                station_id=sa.station_id, skill=station.skill,
                question_type=q.qtype.value, sub_skill=q.sub_skill,
            ))

    sa.raw_score = float(correct)
    if station.skill in ("listening", "reading"):
        sa.band = raw_to_band(correct, len(autogradable), station.skill)
    sa.status = AttemptStatus.graded
    db.commit()
    return {"raw_score": correct, "total": len(autogradable), "band": sa.band}

def autograde_exam_attempt(db: Session, exam_attempt_id: int):
    ea = db.query(ExamAttempt).filter(ExamAttempt.id == exam_attempt_id).first()
    if not ea:
        return None
    sas = db.query(StationAttempt).filter(StationAttempt.exam_attempt_id == exam_attempt_id).all()
    bands = []
    for sa in sas:
        autograde_station_attempt(db, sa.id)
        if sa.band is not None:
            bands.append(sa.band)
    if bands:
        ea.overall_band = round((sum(bands) / len(bands)) * 2) / 2   # nearest 0.5
    ea.status = AttemptStatus.graded
    ea.graded_at = datetime.utcnow()
    db.commit()
    return ea
```

**Create `backend/routers/autograde.py`:**
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.service.database import get_db
from backend.service.autograde import autograde_station_attempt, autograde_exam_attempt

router = APIRouter(prefix="/api/autograde", tags=["autograde"])

@router.post("/station/{station_attempt_id}")
def grade_station(station_attempt_id: int, db: Session = Depends(get_db)):
    res = autograde_station_attempt(db, station_attempt_id)
    if res is None:
        raise HTTPException(404, "Station attempt not found")
    return res

@router.post("/exam/{exam_attempt_id}")
def grade_exam(exam_attempt_id: int, db: Session = Depends(get_db)):
    ea = autograde_exam_attempt(db, exam_attempt_id)
    if ea is None:
        raise HTTPException(404, "Exam attempt not found")
    return {"exam_attempt_id": ea.id, "overall_band": ea.overall_band, "status": ea.status.value}
```

---

## STEP 3 — Mistake-pattern analytics

**Create `backend/routers/analytics.py`:**
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/student/{user_id}")
def student_patterns(user_id: int, db: Session = Depends(get_db)):
    rows = (db.query(models.ErrorTag.skill, models.ErrorTag.sub_skill,
                     func.count().label("misses"))
            .filter(models.ErrorTag.user_id == user_id)
            .group_by(models.ErrorTag.skill, models.ErrorTag.sub_skill)
            .order_by(func.count().desc()).all())
    return [{"skill": r[0], "sub_skill": r[1], "misses": r[2]} for r in rows]

@router.get("/class/{class_id}")
def class_patterns(class_id: int, db: Session = Depends(get_db)):
    user_ids = [e.user_id for e in db.query(models.ClassEnrolment)
                .filter(models.ClassEnrolment.class_id == class_id).all()]
    if not user_ids:
        return []
    rows = (db.query(models.ErrorTag.sub_skill, func.count().label("misses"))
            .filter(models.ErrorTag.user_id.in_(user_ids))
            .group_by(models.ErrorTag.sub_skill)
            .order_by(func.count().desc()).all())
    return [{"sub_skill": r[0], "misses": r[1]} for r in rows]
```

---

## STEP 4 — Register the new routers

**Edit `backend/main.py`.** Add the imports and `include_router` calls:
```python
from .routers import auth, attempts, create_exam, circuits, grading, stt, dashboard
from .routers import tests_io, autograde, analytics   # <-- add
...
    app.include_router(tests_io.router)     # <-- add inside create_app()
    app.include_router(autograde.router)    # <-- add
    app.include_router(analytics.router)    # <-- add
```

Restart uvicorn and confirm the new routes appear at `http://localhost:8000/docs`.

---

## STEP 5 — Frontend: student weakness dashboard

`recharts` is already installed. **Create `frontend/src/pages/Weakness.js`:**
```jsx
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = process.env.REACT_APP_API_URL;

export default function Weakness({ userId }) {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/analytics/student/${userId}`)
      .then(r => r.json())
      .then(rows => setData(rows.map(d => ({ name: d.sub_skill || d.skill, misses: d.misses }))));
  }, [userId]);

  return (
    <div style={{ width: "100%", height: 320 }}>
      <h3>Your most frequent mistakes</h3>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={120} />
          <Tooltip />
          <Bar dataKey="misses" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```
Add a route for it in `frontend/src/App.js` next to the other `<Route>` entries (e.g. `<Route path="/weakness" element={<Weakness userId={1} />} />`), and a navbar link. Build the class version the same way against `/api/analytics/class/{id}`.

---

## STEP 6 — Run the full test version end to end

**6a. Seed a teacher** (so imports have an owner). In MySQL, with a bcrypt hash (generate one with `python -c "import bcrypt;print(bcrypt.hashpw(b'pass123', bcrypt.gensalt()).decode())"`):
```sql
INSERT INTO users (email, username, full_name, role, password_hash, is_active)
VALUES ('t@test.com','teacher','Teacher One','teacher','<bcrypt-hash>',1);
```

**6b. Import a sample test** — `POST http://localhost:8000/api/tests/import`:
```json
{
  "name": "IELTS Reading Practice 1",
  "created_by": 1,
  "time_limit_min": 60,
  "sections": [{
    "position": 1, "skill": "reading", "title": "Passage 1: Bees",
    "passage_md": "Bees are vital pollinators...",
    "questions": [
      {"qtype":"mcq","prompt":"Bees mainly help plants by...","options":["Eating pests","Pollination","Making soil"],"correct_index":1,"sub_skill":"multiple_choice","display_order":1},
      {"qtype":"short","prompt":"What do bees collect from flowers?","accept_answers":["nectar","pollen and nectar"],"sub_skill":"gap_fill","display_order":2},
      {"qtype":"mcq","prompt":"The passage suggests bee numbers are...","options":["Rising","Stable","Falling"],"correct_index":2,"sub_skill":"true_false_notgiven","display_order":3}
    ]
  }]
}
```

**6c. Simulate a student attempt** (until the take-exam UI is wired, insert rows directly to test grading):
```sql
INSERT INTO exam_attempts (exam_id, user_id, status, started_at) VALUES (1, 1, 'submitted', NOW());
INSERT INTO station_attempts (exam_attempt_id, station_id, status, started_at) VALUES (1, 1, 'submitted', NOW());
-- answer Q1 wrong (choice 0), Q2 right ("nectar"), Q3 wrong (choice 1)
INSERT INTO answers (station_attempt_id, question_id, choice_index, created_at) VALUES (1, 1, 0, NOW());
INSERT INTO answers (station_attempt_id, question_id, value_text, created_at) VALUES (1, 2, 'nectar', NOW());
INSERT INTO answers (station_attempt_id, question_id, choice_index, created_at) VALUES (1, 3, 1, NOW());
```

**6d. Grade and inspect:**
```
POST http://localhost:8000/api/autograde/exam/1      -> { overall_band, status: "graded" }
GET  http://localhost:8000/api/analytics/student/1   -> [{skill:"reading", sub_skill:"multiple_choice", misses:1}, ...]
```

If you see a band on the exam attempt and the two wrong answers show up as error tags in the analytics, the test version works: **import → take → instant Reading/Listening band → mistake patterns.**

---

## LATER — Prod + subscription layer (outline, not yet)

Build only after the test version is solid.

1. **Lock down auth (Phase 0 of the Runbook).** Real JWT + `get_current_user` / `require_role` dependencies on every route; remove the `created_by`/`user_id` params from these endpoints and read them from the token instead.
2. **Multi-tenancy.** Add a `tenants` (institutions) table and a `tenant_id` column on `users`, `classes`, `exams`; filter every query by the caller's tenant so institutions can't see each other's data.
3. **Billing + plans.** Stripe for international cards, or VNPay/MoMo for local Vietnamese customers. A `subscriptions` table (tenant_id, plan, status, current_period_end); a webhook flips status on payment. A dependency gates features by plan (e.g. number of tests, students, monthly AI-grading quota).
4. **AI Writing/Speaking** (Runbook Phase 6): Claude API grading into the existing `RubricMark`/`Feedback` tables, with teacher review. This is the paid tier's headline feature and the main variable cost.
5. **Staging + prod split** (Runbook Phase 5): two environments, Alembic migrations, secrets only in the host dashboards.
6. **Deploy:** backend on Render, frontend on Cloudflare Pages, managed DB (Supabase/PlanetScale), audio in object storage.

Suggested cut line for a paid launch: Reading/Listening auto-grading + analytics = **free/trial tier**; AI Writing/Speaking grading = **paid tier**.
