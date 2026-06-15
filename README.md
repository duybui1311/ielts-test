# IELTS Platform

A web app for practising and marking IELTS tests across **all four skills**.
Students take Reading and Listening tests with **instant band scores**, and
practise Writing and Speaking that are **graded by AI and reviewed by a teacher**.
Teachers build tests (by hand or with an AI importer), mark work with inline
comments, and track how their class is doing. The whole app is **responsive** —
it works on desktop, tablet and phone — and supports **light/dark mode**.

> This is a **test version** — sign-in uses real JWT auth, but the schema is
> created with `create_all` (no migrations yet). See
> [`CLAUDE.md`](./CLAUDE.md) for the deep technical reference.

---

## Contents

- [What you can do](#what-you-can-do)
- [Quick start](#quick-start)
- [How to use it](#how-to-use-it) — [Student](#as-a-student) · [Teacher](#as-a-teacher) · [Admin](#as-an-admin)
- [Using it on phone & tablet](#using-it-on-phone--tablet)
- [Tech stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## What you can do

- **Take a test** — Reading/Listening questions answered inline, numbered like a
  real IELTS paper; answers autosave, a question navigator shows progress, and the
  test auto-submits when the timer ends.
- **Instant results** — overall band, per-question breakdown with explanations,
  and a chart of your most common mistake types.
- **Writing & Speaking** — students submit essays / recorded answers as **tasks**;
  they're graded by **AI (Google Gemini)** against the official band descriptors
  (per-criterion bands, error tags, improvement tips), then a **teacher reviews,
  edits and approves** before the student sees the grade.
- **Speaking recorder** — record audio in the browser (works on phones), with an
  optional live transcript in Chrome/Edge; play it back before you submit.
- **Practice by Type** — focused drills for a single question type, with instant
  grading and AI explanations; jump straight in from a weak spot on your dashboard.
- **Review (spaced repetition)** — questions you got wrong come back at the right
  time so they stick; a badge shows how many are due today.
- **Flashcards** — build vocab/collocation decks and study them in flip-card mode.
- **Inline comments** — teachers highlight any span of a student's writing and
  attach a margin note, Google-Docs style; students see the highlights on results.
- **AI test importer** — upload a PDF/Word/image of a test and Gemini converts it
  into the visual builder for review before saving.
- **Test Manage** (teacher/admin) — create, edit, rename, delete, search and sort
  every test and task; take any test yourself.
- **Dashboards** — student band trend + weak spots (including Writing/Speaking);
  teacher class average, attempts and recent submissions.
- **Admin area** — manage users (roles, activation, password reset, deletion) and
  all tests.
- **Quality-of-life** — responsive bottom navigation on mobile, light/dark mode,
  a "back to top" button on long pages, and profile/password settings.

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

> **Tip:** to try the app on your phone, run the frontend with `npm run dev -- --host`
> and open `http://<your-computer-ip>:3000` on the phone (same Wi-Fi). Microphone
> recording needs a secure context, so use `localhost` or HTTPS for Speaking.

---

## How to use it

### As a student

1. **My Tests** has a tab per skill, and it remembers the last tab you used.
   For **Reading/Listening**, press **Start Test**, answer the questions (they
   autosave, and you can tap the navigator numbers to jump around), then **Submit**
   to see your **band + per-question breakdown**.
2. **Writing/Speaking** tabs → open a task, then **write your essay** or **record
   your answer** (tap the mic, tap again to stop, play it back) and submit. Once
   your teacher approves the grade, tap **View result** for your band, the AI
   criterion breakdown, tips, feedback and any inline comments on your writing.
3. **Practice by Type** drills a single question type with instant grading and AI
   explanations — great for your weak spots (tap a cell on the dashboard heatmap to
   jump straight in).
4. **Review** brings back questions you missed as spaced repetition; **Flashcards**
   help you memorise vocabulary; the **Dashboard** shows your trend and weaknesses,
   and **History** lists your past attempts.

### As a teacher

1. **Test Manage → Create**: build a **Reading/Listening test** (skill-first visual
   builder), or use **Import from file (AI)** to turn a PDF/Word/image into a draft
   test, or add a **Writing/Speaking task**.
2. **Review** pending submissions: click **AI grade** for a draft, optionally add
   inline comments on the essay, choose whether to share the AI breakdown, then
   **Approve & save** to release it. (Self-sign-up is students only; teacher
   accounts are seeded or made by an admin.)
3. Watch progress on the **Class Dashboard** — class average band, attempts,
   weakness heatmap and recent submissions.

### As an admin

- **Admin** → site stats, plus user management (change role, activate/deactivate,
  **reset password with a one-click generator + copy**, delete) and a list of all
  tests. On mobile the user/test lists render as cards; on desktop, as tables.

---

## Using it on phone & tablet

The app is fully responsive:

- **Navigation** — a thumb-friendly **bottom bar** with your main destinations
  (plus **More** for the full menu) on phone and tablet; a collapsible **side rail**
  on desktop.
- **Taking tests** — on a single-column screen the reading passage / listening audio
  scrolls inline above the questions; on wider screens it sits beside them.
- **Speaking** — record, play back and submit straight from the phone.
- **Light/dark mode** and a **back-to-top** button work everywhere.

---

## Tech stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2 (Postgres / Supabase)
- **Frontend:** React 19 + Vite, MUI, Recharts, Framer Motion
- **AI:** Google Gemini (`google-genai`) for the test importer and Writing/Speaking grading
- **Auto-grading:** Reading & Listening scored on submit; raw score → IELTS band

See [`frontend/README.md`](./frontend/README.md) for frontend-only dev notes.

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
- **Speaking recording won't play back** — allow microphone access and use a secure
  context (`localhost` or HTTPS). Recording uses the browser's native format
  (e.g. mp4 on iPhone); if it still fails, try Chrome/Edge or Safari 14.3+.

---

## FAQ

**How is the band score calculated?**
Reading and Listening are scored automatically: raw score is scaled to /40 and
mapped to a band with the standard conversion table; the overall band is the
average of the section bands, rounded to the nearest 0.5.

**Are Writing and Speaking really graded?**
Yes — by AI (Google Gemini) against the official band descriptors, then reviewed,
edited and approved by a teacher before the student sees the result.

**Can students sign themselves up?**
Students can self-register. Teacher and admin accounts are created by an admin in
the Admin area (or seeded with `python -m backend.seed`).

**Does it work offline?**
No — it needs the backend API for content, saving and grading.

---

For architecture, data model, API reference and roadmap, see
[`CLAUDE.md`](./CLAUDE.md).
