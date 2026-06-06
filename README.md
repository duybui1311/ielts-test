# IELTS Platform

A web app for practising and marking IELTS tests across **all four skills**.
Students take Reading and Listening tests with **instant band scores**, and
practise Writing and Speaking that are **graded by AI and reviewed by a teacher**.
Teachers build tests (by hand or with an AI importer), mark work with inline
comments, and track how their class is doing.

> This is a **test version** — sign-in uses real JWT auth, but the schema is
> created with `create_all` (no migrations yet). See
> [`CLAUDE.md`](./CLAUDE.md) for the deep technical reference.

---

## Features

- **Take a test** — Reading/Listening questions answered inline, numbered like a
  real IELTS paper; answers autosave, a question navigator shows progress, and the
  test auto-submits when the timer ends.
- **Instant results** — overall band, per-question breakdown, and a chart of your
  most common mistake types.
- **Writing & Speaking** — students submit essays / recorded answers as **tasks**;
  they're graded by **AI (Google Gemini)** against the official band descriptors
  (per-criterion bands, error tags, improvement tips), then a **teacher reviews,
  edits and approves** before the student sees the grade.
- **Inline comments** — teachers highlight any span of a student's writing and
  attach a margin note, Google-Docs style; students see the highlights on their
  result page.
- **AI test importer** — upload a PDF/Word/image of a test and Gemini converts it
  into the visual builder for review before saving.
- **Test Manage** (teacher/admin) — create, edit, rename, delete, search and sort
  every test and task; take any test yourself.
- **Dashboards** — student band trend + weak spots (including Writing/Speaking);
  teacher class average, attempts and recent submissions.
- **Admin area** — manage users (roles, activation, deletion) and all tests.
- **Flashcards**, **light/dark mode**, profile & password settings.

---

## Quick start

**Prerequisites:** Python 3.12, Node.js 18+, and a PostgreSQL database
(the project is set up for Supabase).

### 1. Configure the database

Create `backend/.env`:

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:3000

# Required — secret used to sign/verify JWT access tokens (a long random string)
JWT_SECRET=change-me-to-a-long-random-string

# Optional — AI test importer & AI Writing/Speaking grading (Google Gemini)
GEMINI_API_KEY=
LLM_PROVIDER=gemini
# AI_GRADES_AUTO_VISIBLE=false   # true = students see AI grades without teacher approval

# Optional — uploads (Writing charts, Listening/Speaking audio) via Supabase Storage
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

Use the **Session Pooler** URL from Supabase → Project Settings → Database.
(The direct connection is IPv6-only and won't work from most machines.)
The Supabase **service key is server-side only** — never expose it to the browser.

### 2. Start the backend

```powershell
# from the repo root
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

API: http://localhost:8000 · interactive docs: http://localhost:8000/docs

### 3. Add demo data (recommended)

```powershell
python -m backend.seed
```

This creates demo accounts, an IELTS test, flashcards, and a sample graded
result so every page has something to show.

**Demo logins:**

| Role    | Email              | Password    |
|---------|--------------------|-------------|
| Student | `student@demo.io`  | `demo1234`  |
| Teacher | `teacher@demo.io`  | `demo1234`  |
| Admin   | `admin@demo.io`    | `admin1234` |

### 4. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and sign in with a demo account. The frontend proxies
`/api` to the backend automatically, so you don't need to configure anything.

---

## How to use it

**As a student**
1. **My Tests** has a tab per skill. Reading/Listening → **Start Test**, answer
   (answers autosave), submit, and see your **band + breakdown**.
2. **Writing/Speaking** tabs → open a task, write or record, and submit. Once your
   teacher approves the grade, open **View result** to see your band, the AI
   criterion breakdown, tips, feedback and any inline comments on your writing.
3. Check the **Dashboard** for your trend and weak spots; review **Flashcards**.

**As a teacher**
1. **Test Manage → Create ▾**: a **Reading/Listening test** (skill-first visual
   builder, or use **Import from file (AI)**), or a **Writing/Speaking task**.
2. **Review** pending submissions: click **AI grade** for a draft, optionally add
   inline comments on the essay, choose whether to share the AI breakdown, then
   **Approve & save**. (Self-sign-up is students only; teacher accounts are seeded
   or made by an admin.)
3. Watch progress on the **Class Dashboard**.

**As an admin**
- **Admin** → site stats, manage users (role / active / delete) and all tests.

---

## Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (Postgres / Supabase)
- **Frontend:** React 19 + Vite, MUI, Recharts
- **AI:** Google Gemini (`google-genai`) for the test importer and Writing/Speaking grading
- **Auto-grading:** Reading & Listening scored on submit; raw score → IELTS band

---

## Troubleshooting

- **Pages are empty after logging in** — run `python -m backend.seed`, or take a
  test to generate data.
- **Login fails / `Unable to sign in`** — make sure the backend is running on
  port 8000 and `backend/.env` has a valid `DATABASE_URL`.
- **Keep getting bounced to `/login` (401)** — every API call needs a valid JWT;
  set `JWT_SECRET` in `backend/.env` (auth fails clearly without it) and sign in
  again. Tokens expire after 24h, so a stale session will redirect to login.
- **Database connection hangs** — use the Supabase **Session Pooler** URL
  (port 5432), not the direct connection.
- **AI import/grading says "busy" or "not configured"** — set `GEMINI_API_KEY`
  in `backend/.env` and restart; transient "high demand" 503s retry automatically.
- **Uploads fail** — set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (and ensure the
  `writing-charts` / `speaking-audio` Storage buckets exist).

---

For architecture, data model, API reference and roadmap, see
[`CLAUDE.md`](./CLAUDE.md).
