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
- `frontend/src/App.jsx` — routes. Every page is **code-split with `React.lazy`**
  behind a `<Suspense>` fallback, so the initial bundle only ships the app shell
  (recharts and per-page code load on demand). Pages: `ExamList`, `ExamTake`,
  `ExamResults`, `dashboard`, `teacherDashboard`, `CreateNewExam`, `Writing`,
  `Speaking`, `Review`, `flashcard`, `History`, `Settings`, `Help`, `login`, plus
  the shared `navbar`.
- `frontend/src/auth.js` — client session helpers (`setAuthed`, `logout`,
  `getRole`, `isAuthed`, `landingFor`). Kept separate from the (lazy) Login page
  so any module can import them synchronously. `login.jsx` re-exports them for
  back-compat. JWT/token + `apiFetch` live in `frontend/src/api.js`.
- `frontend/src/theme/index.js` — `createAppTheme(mode)`. Beyond the MUI palette
  it exposes custom tokens read across pages: `theme.gradients`
  (`brand`/`hero`/`ocean`/`sunset`/`emerald`/`mesh`), `theme.glass`,
  `theme.customShadows` (`card`/`hover`/`glow`/`brandButton`) and `theme.brandStops`.
  The signature look is an indigo→violet→fuchsia brand gradient with a faint
  fixed background mesh; contained-primary buttons use it.
- `frontend/src/component/ui.jsx` — shared presentational helpers (`PageHeader`,
  `StatCard`, `SkillChip`, `AiBadge`, `BandPill`, `GradientText`, `AnimatedNumber`,
  `SectionHeading`, `bandColor`, `skillHex`/`skillGradient`) and `chartTheme(theme)`,
  which returns themed Recharts props (axis ticks/lines, grid, tooltip) so every
  chart stays readable in both light and dark mode. Kept framer-motion-free so it
  stays in the light shell; richer motion lives in the lazy pages.

## Core flows
- **Test import/export** — `POST /api/tests/import`, `GET /api/tests/{id}/export`.
- **AI test importer** — `POST /api/import/ai` (`backend/routers/ai_import.py`).
  Teachers upload a PDF/Word/image/text test file, plus an **optional
  `answer_sheet` file** (same formats). When present, the answer sheet is passed
  to the LLM as the authoritative answer key — `correct_index`/`accept_answers`
  are filled from it instead of the model solving the test. The chosen LLM
  returns the `build_ielts_test` JSON schema, which the frontend loads into the
  visual builder for review before saving. The provider is chosen with
  `LLM_PROVIDER` (default `gemini`):
  - **`gemini` (recommended free online option)** — Google Gemini via the
    `google-genai` SDK. Multimodal: PDFs/images are sent as raw bytes (no OCR/text
    pre-extraction — it reads charts, scans and layout natively) with JSON-mode
    `response_schema`. Needs `GEMINI_API_KEY`; `GEMINI_MODEL` defaults to
    `gemini-2.5-flash`. Free tier is rate-limited (~1500 req/day), so it's fine
    for test/low-volume use only.
  - **`claude`** — Anthropic Claude via tool-use. Images and PDFs sent as base64
    (PDFs as native document blocks, so scans work); other files have text
    extracted locally first. Needs `ANTHROPIC_API_KEY`.
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
- **Auth is real JWT.** `POST /api/auth/login` and `/register` verify bcrypt and
  return a signed token (`user_id`, `role`, 24h expiry) read from `JWT_SECRET`.
  Identity is derived only from the verified `Authorization: Bearer` token via the
  `get_current_user` / `require_role("teacher"|"admin")` dependencies in
  `backend/service/auth_deps.py` — never from a client header. `/api/health` and
  `/api/auth/*` are public; everything else requires a token. The frontend stores
  the JWT and attaches it on every request (`frontend/src/api.js`), redirecting to
  `/login` on a 401.
- **AI Writing/Speaking grading** is implemented (Gemini) with teacher review.

## When changing things
- Keep the `sub_skill` vocab a closed list, or analytics fragments.
- Don't swap `create_all` for migrations casually — it's intentional for the test version.
- Treat the active routers/models/autograde and the live frontend pages above as
  working code; don't refactor them without a reason.
