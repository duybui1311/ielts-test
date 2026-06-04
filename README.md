# IELTS Platform

A simple web app for practising IELTS tests. Students take Reading and Listening
tests and get an **instant band score** plus a breakdown of the question types
they get wrong most often. Teachers build tests and watch how their class is
doing. Vocabulary flashcards are built in.

> This is a **test version** — sign-in is simplified and Writing/Speaking are
> saved for manual marking (automatic AI grading is planned). See
> [`CLAUDE.md`](./CLAUDE.md) for the deep technical reference.

---

## Features

- **Take a test** — answer Reading/Listening questions inline; answers save as
  you go and the test auto-submits when the timer ends.
- **Instant results** — overall band, per-question breakdown, and a chart of your
  most common mistake types.
- **Student dashboard** — band trend over time, KPIs, and recent tests.
- **Teacher dashboard** — classes, exams, class-average trend and recent
  submissions.
- **Create exams** — a visual builder for teachers (no JSON required).
- **Flashcards** — build decks and study them in flip-card mode.
- **Light & dark mode** — toggle in the sidebar, remembered per device.

---

## Quick start

**Prerequisites:** Python 3.12, Node.js 18+, and a PostgreSQL database
(the project is set up for Supabase).

### 1. Configure the database

Create `backend/.env`:

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:3000
```

Use the **Session Pooler** URL from Supabase → Project Settings → Database.
(The direct connection is IPv6-only and won't work from most machines.)

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

This creates a demo teacher and student, one IELTS test, some flashcards, and a
sample graded result so every page has something to show.

**Demo logins** (password `demo1234` for both):

| Role    | Email              |
|---------|--------------------|
| Student | `student@demo.io`  |
| Teacher | `teacher@demo.io`  |

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
1. **My Tests** → pick a test → **Start Test**.
2. Answer the questions — they save automatically. Submit (or let the timer
   submit for you).
3. See your **band score and breakdown**, then check the **Dashboard** for your
   trend and weak spots. Review vocabulary under **Flashcards**.

**As a teacher**
1. **Create Exam** → name the test, add Reading/Listening sections with a
   passage, then add multiple-choice / short-answer questions and mark the
   correct answers → **Save**. It instantly appears in students' My Tests.
2. Watch progress on the **Class Dashboard** (class average, attempts, recent
   submissions).

---

## Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (Postgres / Supabase)
- **Frontend:** React 19 + Vite, MUI, Recharts
- **Auto-grading:** Reading & Listening scored on submit; raw score → IELTS band

---

## Troubleshooting

- **Pages are empty after logging in** — run `python -m backend.seed`, or take a
  test to generate data.
- **Login fails / `Unable to sign in`** — make sure the backend is running on
  port 8000 and `backend/.env` has a valid `DATABASE_URL`.
- **Database connection hangs** — use the Supabase **Session Pooler** URL
  (port 5432), not the direct connection.
- **Frontend can't reach the API** — start the backend first; the dev server
  proxies `/api` to `http://localhost:8000`.

---

For architecture, data model, API reference and roadmap, see
[`CLAUDE.md`](./CLAUDE.md).
