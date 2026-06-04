# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is
An IELTS testing and auto-grading platform (test version). Teachers import full
tests; students take them; the platform auto-grades Reading and Listening
instantly and surfaces each student's mistake patterns by sub-skill.

The codebase was adapted from an older OSCE medical-exam app — most OSCE-specific
code has been removed and remaining work targets IELTS only.

## Stack
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (ORM + `create_all`),
  psycopg2-binary. Run from the repo root: `uvicorn backend.main:app --reload`.
- **Database:** Supabase Postgres (session pooler). `DATABASE_URL` lives in
  `backend/.env` (gitignored).
- **Frontend:** React 19 + Vite, MUI, recharts. Dev server: `cd frontend && npm run dev`.

## Architecture
- `backend/main.py` — app factory + lifespan (`create_all`). Registers five
  routers: `auth`, `tests_io`, `autograde`, `analytics`, `student_flow`.
- `backend/service/models.py` — all SQLAlchemy models.
- `backend/service/autograde.py` — MCQ + short-answer scoring, raw→band
  conversion, ErrorTag writes for analytics.
- `backend/service/{config,database}.py` — settings + engine/`get_db`.
- `frontend/src/App.jsx` — routes. Live student pages: `ExamList`, `ExamTake`,
  `ExamResults`, plus `dashboard`, `flashcard`, `teacherDashboard`, `CreateNewExam`,
  `login` and the shared `navbar`.

## Core flows
- **Test import/export** — `POST /api/tests/import`, `GET /api/tests/{id}/export`.
- **Auto-grade** — `POST /api/autograde/exam/{id}` and `/station/{id}`. MCQ matches
  `correct_index`; short answers normalise and match `accept_answers`; raw score
  scales to /40 then a band lookup table. Writing/Speaking are skipped.
- **Analytics** — `GET /api/analytics/student/{id}` and `/class/{id}` aggregate
  `ErrorTag` rows into mistake-pattern counts by skill + sub_skill.
- **Student exam flow** — `backend/routers/student_flow.py` (`/api/attempts/*`):
  start attempt → fetch content → submit answers → results.

## Status & boundaries
- **Test version.** Schema is created with `create_all` (no Alembic yet).
- **Auth is a placeholder** — `POST /api/auth/login` verifies bcrypt and returns
  `token: "test-{user_id}"`. No JWT, no route guards. Replace before any real deploy.
- **AI Writing/Speaking grading is future work**, not implemented.

## When changing things
- Keep the `sub_skill` vocab a closed list, or analytics fragments.
- Don't swap `create_all` for migrations casually — it's intentional for the test version.
- Treat the active routers/models/autograde and the live frontend pages above as
  working code; don't refactor them without a reason.
