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
- **Storage:** Supabase Storage holds uploaded chart images (`writing-charts`) and
  speaking audio (`speaking-audio`); see `backend/service/storage.py`.
- **Deploy:** root `Dockerfile` builds the backend (Python 3.12-slim, installs
  `backend/requirements.txt`, runs `uvicorn backend.main:app` on `$PORT`). Required
  env: `DATABASE_URL`, `FRONTEND_URL`; optional: `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`
  (AI import), `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (uploads).

## Architecture
- `backend/main.py` — app factory + lifespan (`create_all`), CORS (allows
  `FRONTEND_URL` + localhost), and the `/uploads` static mount. Registers all
  routers: `auth`, `tests_io`, `autograde`, `analytics`, `student_flow`,
  `dashboard`, `me`, `flashcards`, `teacher`, `writing`, `speaking`, `review`,
  `ai_import`.
- `backend/service/models.py` — all SQLAlchemy models.
- `backend/service/autograde.py` — MCQ + short-answer scoring, raw→band
  conversion, ErrorTag writes for analytics.
- `backend/service/{config,database}.py` — settings + engine/`get_db`.
- `backend/service/storage.py` — uploads bytes to Supabase Storage and returns the
  public URL. Buckets: `writing-charts` (Task 1 images), `speaking-audio`. Needs
  `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (service key is server-side only).
- `frontend/src/App.jsx` — routes. Pages: `ExamList`, `ExamTake`, `ExamResults`,
  `dashboard`, `teacherDashboard`, `CreateNewExam`, `Writing`, `Speaking`,
  `Review`, `flashcard`, `History`, `Settings`, `Help`, `login`, plus the shared
  `navbar`.
- `frontend/src/component/ui.jsx` — shared presentational helpers (`PageHeader`,
  `StatCard`, `SkillChip`, `bandColor`) and `chartTheme(theme)`, which returns
  themed Recharts props (axis ticks/lines, grid, tooltip) so every chart stays
  readable in both light and dark mode.

## Core flows
- **Test import/export** — `POST /api/tests/import`, `GET /api/tests/{id}/export`.
- **AI test importer** — `POST /api/import/ai` (`backend/routers/ai_import.py`).
  Teachers upload a PDF/Word/image; the chosen LLM returns the `build_ielts_test`
  JSON schema, which the frontend loads into the visual builder for review before
  saving. The provider is chosen with `LLM_PROVIDER` (default `gemini`):
  - **`gemini` (recommended free online option)** — Google Gemini via the
    `google-genai` SDK. Multimodal: PDFs/images are sent as raw bytes (no OCR/text
    pre-extraction — it reads charts, scans and layout natively) with JSON-mode
    `response_schema`. Needs `GEMINI_API_KEY`; `GEMINI_MODEL` defaults to
    `gemini-2.5-flash`. Free tier is rate-limited (~1500 req/day), so it's fine
    for test/low-volume use only.
  - **`claude`** — Anthropic Claude via tool-use. Images sent as base64; other
    files have text extracted locally first. Needs `ANTHROPIC_API_KEY`.
  - **`local`** — no external API; extracts text and returns it as a single
    reading section for the teacher to finish by hand (can't read images).
  Each provider returns the same shape; missing API keys return 503 with a
  "set up AI import" message.
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
  `token: "test-{user_id}"`; the frontend passes identity via the `X-User-Id`
  header and routers trust it. No JWT, no route guards. **Replace with JWT before
  public launch.**
- **AI Writing/Speaking grading is future work**, not implemented.

## When changing things
- Keep the `sub_skill` vocab a closed list, or analytics fragments.
- Don't swap `create_all` for migrations casually — it's intentional for the test version.
- Treat the active routers/models/autograde and the live frontend pages above as
  working code; don't refactor them without a reason.
