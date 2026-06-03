# IELTS Platform — Build & Deploy Runbook
**Base repo:** `KvaoDH/OSCE-Virtual-Patient` (FastAPI + SQLAlchemy + MySQL + Redis backend, React 19 frontend, local Llama-3-8B + faster-whisper AI)

This adapts an existing, well-structured exam platform into an IELTS testing + auto-grading system. You are modifying, not rebuilding.

---

## Phase 0 — Critical fixes (do first, before any deploy or demo)

1. **Rotate the leaked DB password.** `service/config.py` defaults `MYSQL_PASSWORD` to `Matkhaucu1@`, and `backend/.env` / `frontend/.env` are committed. Change the password on the DB, remove the default from `config.py` (make it required, no fallback).
2. **Purge secrets from git history.** Add `.env`, `**/.env`, `__pycache__/`, `.idea/`, `*.gguf` to `.gitignore`. Then scrub history with `git filter-repo --path backend/.env --path frontend/.env --invert-paths` (or BFG) and force-push. Treat every value that was in those files as compromised.
3. **Delete `GET /api/auth/debug-users`** in `routers/auth.py` — it returns every user's password hash.
4. **Add real auth.** Issue a signed JWT on login (include `user_id`, `role`, expiry). Write a `get_current_user` dependency that validates it, and a `require_role("teacher"|"admin")` dependency. Attach these to every non-public route (all of `grading`, `marking`, `create_exam`, `dashboard`, `admin_users`). Remove the plaintext-password fallback in `verify_password`. Replace the hard-coded `teacher_id=1` with `current_user.id`.
5. **Create `backend/requirements.txt`.** Pin at least: `fastapi`, `uvicorn[standard]`, `sqlalchemy`, `pydantic`, `python-dotenv`, `bcrypt`, `pyjwt`, `redis`, `httpx`, plus DB driver (`mysql-connector-python` *or* `psycopg2-binary` if you migrate), and for AI: `faster-whisper`, `llama-cpp-python` (only where the model actually runs — see Phase 6).

---

## Phase 1 — Repurpose the data model (OSCE → IELTS)

The existing tables map cleanly. Most changes are additive.

| OSCE concept | IELTS meaning | Action |
|---|---|---|
| `Exam` | An IELTS test (a full test or a single-skill practice) | Add `skill` enum: `listening / reading / writing / speaking / full`. Keep `time_limit_min`, `reading_min`, `access_code_hash` as-is — already perfect for timed delivery. |
| `Station` | A section/part (Listening Part 1–4, Reading Passage 1–3, Writing Task 1/2, Speaking Part 1–3) | Reuse `position` for ordering. Add optional `audio_url` (Listening) and `passage_md` lives in the linked `Case.body_md`. |
| `Case.body_md` | Reading passage / Listening transcript / Writing prompt | No change needed. |
| `Question` (`qtype`) | `mcq` + `short` = Reading/Listening items; `explain` = Writing task | Already has `options_json`, `correct_index`, `reference_text`. For `short`, store an accept-list of correct answers in `reference_text` (JSON array). |
| `Answer` | Student response | Already has `is_auto_correct`, `auto_score` — currently unused. Phase 3 fills them. |
| `Rubric` / `RubricMark` | IELTS band-descriptor criteria (Task Response, Coherence, Lexical, Grammar; or Fluency/Lexical/Grammar/Pronunciation) | Reuse directly for Writing/Speaking. |
| `Feedback` | Teacher/AI comments | No change. |
| `ChatMessage` + `stt` router | Speaking conversation + transcription | Already exists. Reuse for Speaking (Phase 6). |
| **NEW: `error_tag`** | One row per wrong answer, categorised | Add table (Phase 4). |
| **NEW: `band_scale`** | Raw-score → IELTS band mapping per test | Add table; bands vary slightly per test, so make it configurable, not hard-coded. |

Migrations: the app currently uses `Base.metadata.create_all` (no migration tool). Add **Alembic** before prod so schema changes are versioned and repeatable across staging/prod.

---

## Phase 2 — Efficient upload / download of IELTS tests

Right now exams are built one field at a time via `create_exam`. For an institution uploading whole tests, add bulk I/O.

1. **Bulk import endpoint** `POST /api/tests/import`: accept a single JSON document describing the whole test (test meta → sections → passages → questions with answers). Create `Exam + Station + Case + Question` rows in **one transaction** so a bad file imports nothing.
2. **Import templates.** Publish a JSON schema, and optionally accept `.xlsx` (one sheet per section, columns: question, type, options, correct answer, sub-skill tag) and `.docx` (parse headings/numbered lists). `.xlsx` is the easiest for non-technical staff.
3. **Listening audio.** `POST /api/tests/{id}/audio` to upload the section audio to object storage (Supabase Storage / Cloudflare R2 / S3); save the URL on the `Station`.
4. **Export / download** `GET /api/tests/{id}/export?format=json|xlsx`: round-trips a test back out for backup, editing, or sharing between branches. Also useful to generate a printable PDF version.
5. **Versioning.** Stamp each imported test with a version + created_by so re-imports don't silently overwrite a live test.

---

## Phase 3 — Auto-grade Reading & Listening (no AI needed)

The schema is ready; the scoring code is missing. This is pure logic and is the cheapest, highest-certainty feature.

1. On `StationAttempt` submit, run an **auto-grade pass** over every `Answer`:
   - `mcq`: `is_auto_correct = (answer.choice_index == question.correct_index)`.
   - `short`: normalise (lowercase, strip, collapse spaces) and compare against the accept-list in `reference_text`; handle common variants (e.g. `colour/color`, numerals vs words). `is_auto_correct = match`.
   - Set `auto_score = 1.0 if correct else 0.0` (or per-question weight).
2. Sum correct answers per section → raw score (Listening and Academic Reading are out of 40).
3. **Raw → band conversion** via the configurable `band_scale` table (official tables differ slightly between tests, so keep it editable per test rather than hard-coded). Store the band on the `StationAttempt` / `ExamAttempt`.
4. Mark the attempt `graded` immediately for Reading/Listening — no teacher step required.

This alone delivers "upload a test, students take it, instant Reading & Listening scores."

---

## Phase 4 — Find patterns where students usually make mistakes

This is the feature that makes the product worth paying for. It is downstream of Phase 3.

1. **`error_tag` table:** `(id, answer_id, user_id, exam_id, skill, question_type, sub_skill, created_at)`. On every wrong answer during auto-grade, write a tag.
2. **Define a closed list of `sub_skill` categories** and tag each question with one at import time. Examples:
   - Reading: True/False/Not Given, Matching Headings, Gap Fill, Multiple Choice, Sentence Completion, Skimming vs Detail.
   - Listening: Part 1–4, Detail, Main Idea, Spelling/Numbers, Distractor traps.
   - Keep the list fixed — free-text tags fragment and make analytics useless.
3. **Analytics endpoints:**
   - `GET /api/analytics/student/{id}` → top error categories, trend over time, weakest sub-skills.
   - `GET /api/analytics/class/{id}` → cohort heatmap ("62% of this class miss Matching Headings").
4. **Dashboard:** build with `recharts` (already installed). Per-student "your 3 weakest areas," per-class bar/heatmap for teachers. This is where the existing `teacherDashboard.js` and `dashboard.js` pages get extended.

---

## Phase 5 — Test (staging) and Prod environments

Goal: two fully isolated, identical stacks so you can break staging freely.

**Branch/deploy flow:** `develop` branch → staging auto-deploy; `main` branch → prod auto-deploy. Use GitHub Actions to build/test on push and deploy on merge.

**Two of everything, separated by env vars** (the app already reads all config from env — good):

| Layer | Staging | Prod |
|---|---|---|
| Backend (FastAPI) | Render service `ielts-api-staging` | `ielts-api-prod` |
| Database | separate DB/schema (`ielts_staging`) | `ielts_prod`, daily backups |
| Frontend (React) | Cloudflare Pages preview / `staging.yourdomain` | `app.yourdomain` |
| Audio storage | staging bucket | prod bucket |
| AI grading | shared or cheaper model | production model |
| Secrets | staging keys | prod keys (never reused) |

**Concrete steps:**
1. Add `ENV` env var (`staging`/`prod`) and a startup log line so you always know which DB you're hitting.
2. **Backend → Render:** add a `Dockerfile` (or use the Python buildpack), `requirements.txt`, start command `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`, and an `/api/health` check (already exists). Set all env vars in the Render dashboard, never in the repo.
3. **Frontend → Cloudflare Pages:** build command `npm run build`, output dir `build`, env var `REACT_APP_API_URL` pointing at the matching backend. (React 19 + CRA builds to a static `build/` — trivial on Pages.)
4. **Database:** if staying on MySQL → PlanetScale / Railway / Aiven. If migrating → Supabase Postgres (recommended for you): swap `mysql+mysqlconnector` → `postgresql+psycopg2`, change `from sqlalchemy.dialects.mysql import JSON` → the generic/`postgresql` JSON, re-test enums. You also gain Supabase Auth + Storage + RLS.
5. **CORS:** set `FRONTEND_URL` per environment so staging API only accepts staging frontend.
6. **Migrations:** run Alembic on deploy, not `create_all`, so staging and prod schemas stay in lockstep.

---

## Phase 6 — Future: Writing & Speaking grading via AI

**Writing (do this first of the two):**
1. On submit, send the essay + a system prompt encoding the 4 IELTS Writing band descriptors to an LLM. **Recommended: Claude Sonnet API** rather than the bundled local Llama-3-8B — no GPU to host, far better grading quality, and you can cache the rubric prompt.
2. Force **structured JSON output**: `{ overall_band, criteria: {task, coherence, lexical, grammar}, inline_comments: [...], error_tags: [{category, excerpt, suggestion}] }`.
3. Persist into the existing `RubricMark` (scores) + `Feedback` (comments) tables, and write the `error_tags` into the Phase 4 table so writing mistakes flow into the same analytics.
4. **Keep a teacher in the loop:** AI drafts the band + comments, a teacher reviews/overrides, the student sees the approved version. Essential for a high-stakes score and a genuine selling point.

**Speaking (Phase 2 of AI):**
1. Student records answers → upload audio → existing `stt` router (faster-whisper) transcribes. Note: faster-whisper needs real CPU/RAM; run it on a worker, not a tiny web dyno. Whisper API is the no-infra alternative.
2. Feed transcript (+ optional audio features) to the LLM, graded on Fluency, Lexical Resource, Grammar, Pronunciation. Reuse `ChatMessage` for the conversation and `Rubric/RubricMark` for the bands.

**Hosting the AI:** Reading/Listening (Phases 3–4) need **no AI** and run anywhere. For Writing/Speaking, choose: (a) **Claude/Whisper APIs** — no GPU, pay per use, simplest, recommended to start; or (b) **self-host the GGUF model** on a GPU box (RunPod/Vast.ai/local) — cheaper at very high volume, much more ops. Don't try to run Llama-3-8B on a standard Render instance; it will be unusably slow.

---

## Cost estimate (USD)

**Fixed infrastructure — per environment.** Run prod always-on; keep staging on cheap/free tiers.

| Item | Staging | Prod |
|---|---|---|
| Backend (Render) | $0–7/mo | $7–25/mo |
| Database (Supabase Pro / PlanetScale) | $0 (free tier) | $25/mo |
| Frontend (Cloudflare Pages) | $0 | $0 |
| Audio/object storage | ~$0 | ~$1–5/mo |
| Domain | — | ~$1/mo |
| **Subtotal** | **~$0–7/mo** | **~$35–55/mo** |

**Variable AI cost — Writing/Speaking only (Phases 3–4 are free).** Current Claude API rates: Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15, Opus 4.6 $5/$25 per million input/output tokens; prompt caching saves up to 90% on the cached rubric, batch API 50%.

- One Writing essay graded with Sonnet 4.6 ≈ ~3k input + ~1.5k output ≈ **~$0.03**, dropping to **~$0.012–0.015** with caching + batch.
- ~300 essays/mo ≈ **$4–10**; ~1,500/mo ≈ **$20–45**; ~5,000/mo ≈ **$70–150**.
- Speaking adds transcription: Whisper API ≈ $0.05–0.10 per ~12-min test (or self-host faster-whisper for compute cost only).

**Bottom line:** a production single-institution beta runs roughly **$40–100/month all-in** at typical volume. Reading/Listening auto-grading + the mistake-pattern dashboard cost essentially nothing to run — the AI spend only starts with Writing/Speaking, and even then it's modest until you're grading thousands of essays. Your real cost is engineering time, concentrated on the auth/security fixes and the Writing grading prompt.

---

## Suggested order of work

1. Phase 0 (security) — non-negotiable, ~days.
2. Phase 1 + Phase 3 (model tweaks + Reading/Listening auto-grade) — fastest path to a usable demo.
3. Phase 2 (bulk upload/download) — so staff can load real tests.
4. Phase 4 (mistake analytics) — the differentiator.
5. Phase 5 (staging + prod split) — before any paying customer.
6. Phase 6 (AI Writing, then Speaking) — the roadmap items.
