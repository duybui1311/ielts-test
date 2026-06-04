# IELTS Platform 

## What this project is
An IELTS testing and auto-grading platform adapted from an OSCE medical-exam codebase. Teachers import full tests; students take them; the platform auto-grades Reading and Listening instantly and tracks mistake patterns by sub-skill.

## Stack
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (ORM + `create_all`), psycopg2-binary
- **Database:** Supabase Postgres (session pooler, `aws-1-ap-southeast-1`)
- **Frontend:** React 19 (Vite), recharts for analytics charts
- **Runtime:** uvicorn with `--reload`, started from repo root as `uvicorn backend.main:app`

## Running locally
```powershell
# from repo root
.\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --port 8000
# frontend (separate terminal)
cd frontend && npm run dev
```
Backend: http://localhost:8000 — Swagger UI: http://localhost:8000/docs  
Frontend: http://localhost:3000

## Environment
`backend/.env` (gitignored) — required vars:
```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:3000
```
Use the **Session Pooler** URL from Supabase → Project Settings → Database. The direct connection is IPv6-only and won't work from most local machines.

## Key backend files
```
backend/main.py                  FastAPI app factory, lifespan (create_all), 4 routers
backend/service/models.py        All SQLAlchemy models (User, Exam, Station, Question, Answer, ErrorTag, …)
backend/service/autograde.py     Auto-grade logic: MCQ + short-answer scoring, raw→band conversion, ErrorTag writes
backend/service/config.py        Reads DATABASE_URL from .env, normalises postgres:// → postgresql+psycopg2://
backend/service/database.py      SQLAlchemy engine (session pooler settings), get_db dependency
backend/routers/auth.py          Login endpoint — bcrypt verify, returns placeholder test-{id} token
backend/routers/tests_io.py      POST /api/tests/import, GET /api/tests/{id}/export
backend/routers/autograde.py     POST /api/autograde/station/{id}, POST /api/autograde/exam/{id}
backend/routers/analytics.py     GET /api/analytics/student/{id}, GET /api/analytics/class/{id}
```

## API endpoints (active)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness check |
| POST | `/api/auth/login` | Login → `{user_id, name, role, token}` |
| POST | `/api/tests/import` | Bulk-import a full test (JSON) |
| GET | `/api/tests/{id}/export` | Export test back to JSON |
| POST | `/api/autograde/exam/{id}` | Auto-grade all stations, set overall_band |
| POST | `/api/autograde/station/{id}` | Auto-grade one station |
| GET | `/api/analytics/student/{id}` | Mistake counts by skill+sub_skill |
| GET | `/api/analytics/class/{id}` | Cohort mistake heatmap |

## Data model — IELTS additions on top of the OSCE base
- `Station.skill` — `listening|reading|writing|speaking`
- `Station.audio_url` — Supabase Storage URL for Listening clips
- `Question.sub_skill` — closed vocab: `multiple_choice`, `gap_fill`, `true_false_notgiven`, `matching_headings`, `sentence_completion`, etc.
- `Question.accept_answers` — JSON array of normalised correct strings for `short` questions
- `StationAttempt.raw_score`, `.band` — set by autograde
- `ExamAttempt.overall_band` — mean of station bands, rounded to nearest 0.5
- `ErrorTag` — one row per wrong answer; drives analytics

## Auth status — TEST VERSION ONLY
`POST /api/auth/login` verifies bcrypt and returns `token: "test-{user_id}"`. This is a placeholder. Before any real deploy, replace with signed JWT (`pyjwt`), add `get_current_user` / `require_role` FastAPI dependencies on every non-public route, and remove `created_by` / `user_id` from request bodies (read from token instead).

## Auto-grade logic
- **MCQ:** `is_auto_correct = (answer.choice_index == question.correct_index)`
- **Short:** normalise both sides (lowercase, strip, collapse spaces), match against `accept_answers` list
- **Band conversion:** configurable lookup table in `autograde.py` (`LISTENING`, `READING`) — raw score scaled to /40, then table lookup. Returns 2.5 floor.
- **Writing/Speaking (`explain` qtype):** skipped by autograde — reserved for future AI grading

## Future work (not yet implemented)
1. **Real JWT auth** — `pyjwt`, `get_current_user` dependency, role guards
2. **Multi-tenancy** — `tenant_id` on users/classes/exams, per-tenant query filtering
3. **AI Writing grading** — Claude Sonnet API, structured JSON rubric output → `RubricMark`/`Feedback`, teacher review loop
4. **AI Speaking grading** — faster-whisper or Whisper API transcription → LLM band scoring
5. **Alembic migrations** — replace `create_all` before any prod schema change
6. **Staging/prod split** — separate Supabase projects, Render + Cloudflare Pages deploy, GitHub Actions CI

## What NOT to change without reading the docs
- The `create_all` in `main.py` lifespan — intentional for test version; swap to Alembic before prod
- The `NullPool` comment in `database.py` — needed if switching to transaction pooler (port 6543)
- The `sub_skill` vocab in question imports — keep it a closed list or analytics fragments
