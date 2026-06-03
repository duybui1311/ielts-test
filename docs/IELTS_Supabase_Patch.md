# Supabase Postgres — Adaptation Patch
Apply these changes to the OSCE base **instead of** the MySQL bits in the Implementation Guide. Everything else in that guide (Steps 1–6: import, autograde, analytics, frontend) is unchanged — it never touches MySQL directly.

---

## 1. Driver — `backend/requirements.txt`
Remove `mysql-connector-python`, add the Postgres driver:
```
fastapi
uvicorn[standard]
sqlalchemy
pydantic
python-dotenv
bcrypt
pyjwt
redis
httpx
psycopg2-binary
```

---

## 2. Connection config — replace `backend/service/config.py`
Read a single `DATABASE_URL` (the string Supabase gives you) and normalise the scheme so SQLAlchemy + psycopg2 accept it:
```python
import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    def __init__(self):
        url = os.getenv("DATABASE_URL", "")
        # SQLAlchemy needs the +psycopg2 driver tag
        if url.startswith("postgres://"):
            url = "postgresql+psycopg2://" + url[len("postgres://"):]
        elif url.startswith("postgresql://") and "+psycopg2" not in url:
            url = "postgresql+psycopg2://" + url[len("postgresql://"):]
        self.DATABASE_URL = url

        self.API_HOST = os.getenv("API_HOST", "0.0.0.0")
        self.API_PORT = int(os.getenv("API_PORT", "8000"))
        self.FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
        self.REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.REDIS_DRAFT_TTL = int(os.getenv("REDIS_DRAFT_TTL", "3600"))
        self.VP_SERVICE_URL = os.getenv("VP_SERVICE_URL", "")

settings = Settings()
```
> This removes the old MySQL `DATABASE_URL` property — `database.py` already calls `create_engine(settings.DATABASE_URL, ...)`, which now receives a Postgres string.

---

## 3. Engine — replace `backend/service/database.py`
The old MySQL pool settings (`pool_recycle=280`) are gone. **Which engine block to use depends on which Supabase connection string you pick** (see §6):
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

# Use this with the SESSION pooler (port 5432) or the direct connection.
engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    future=True,
)

# --- If you use the TRANSACTION pooler (port 6543) instead, use this block:
# from sqlalchemy.pool import NullPool
# engine = create_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool, future=True)
# (Transaction-mode PgBouncer is incompatible with SQLAlchemy's own pool.)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 4. JSON columns — one import in `backend/service/models.py`
Change the MySQL-specific import:
```python
# OLD:
# from sqlalchemy.dialects.mysql import JSON
# NEW (generic, works on Postgres):
from sqlalchemy import JSON
```
All `JSON` columns (`Case.tags`, `Question.options_json`, `Question.accept_answers`) now map to Postgres `json`. *Optional upgrade:* use `from sqlalchemy.dialects.postgresql import JSONB as JSON` for indexable JSONB — better on Postgres, but plain `JSON` is fine for the test version.
> The `Enum(...)` columns work as-is; on Postgres they become native enum types. No change needed now, just know that altering enum values later requires a migration.

---

## 5. Environment — `backend/.env` (gitignored, never committed)
```
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379/0
REDIS_DRAFT_TTL=3600
VP_SERVICE_URL=
```
Grab the exact string from **Supabase → Project Settings → Database → Connection string → URI**. Add `?sslmode=require` on the end if your host doesn't negotiate SSL automatically.
Frontend `frontend/.env` is unchanged: `REACT_APP_API_URL=http://localhost:8000`.

---

## 6. Which Supabase connection string to use
- **Session pooler** (`...pooler.supabase.com:5432`) → recommended. Works with the normal SQLAlchemy pool in §3. Use this from a long-running FastAPI server (Render, etc.), since the old direct connection is IPv6-only and many hosts are IPv4.
- **Transaction pooler** (`...pooler.supabase.com:6543`) → only if you need it; then switch to the `NullPool` engine block in §3.
- **Direct connection** (`db.<ref>.supabase.co:5432`) → fine for local dev if your network has IPv6.

---

## 7. Rebuilding the schema (replaces the MySQL `DROP DATABASE` step)
You don't drop the Supabase *database* — you reset the `public` schema. In **Supabase → SQL Editor**, run:
```sql
drop schema public cascade;
create schema public;
grant all on schema public to postgres, anon, authenticated, service_role;
```
Then restart the app; `Base.metadata.create_all` rebuilds every table with the new columns. (Safe because this is a throwaway test project. Before prod, switch to Alembic migrations instead of dropping anything.)

---

## 8. Things you already know how to use — wire them in
- **Listening audio → Supabase Storage.** Create a bucket (e.g. `ielts-audio`), upload the clips, and paste the public/signed URL into `Station.audio_url` (the column you added in Step 0). No backend change needed for the test version; add in-app uploads later via signed URLs.
- **Auth (prod phase) → Supabase Auth.** Instead of the app's bcrypt/JWT, let Supabase issue the JWT and have FastAPI verify it with your project's JWT secret — same pattern you use on AutoQA. Keep the app's `users` table for roles/profile and key it by the Supabase user id.

---

## 9. Repo move (your "clone everything to a new GitHub" plan)
```powershell
cd D:\project
git clone https://github.com/KvaoDH/OSCE-Virtual-Patient.git ielts-platform
cd ielts-platform
Remove-Item -Recurse -Force .git
Remove-Item -Force backend\.env, frontend\.env -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .idea, frontend\.idea -ErrorAction SilentlyContinue
# add the .gitignore from the Runbook BEFORE the first commit, then:
git init
git add -A
git commit -m "Initial commit: IELTS platform (Supabase Postgres)"
gh repo create <your-username>/ielts-platform --private --source=. --remote=origin --push
```
Create the new Supabase **project** first (separate from AutoQA), grab its `DATABASE_URL` for §5, and you're isolated from your other work.

---

### Net change vs the MySQL guide
Only files touched: `requirements.txt`, `service/config.py`, `service/database.py`, one import in `service/models.py`, and `.env`. Steps 1–6 of the Implementation Guide (import, autograde, analytics, frontend, end-to-end test) apply **unchanged** — except step 6a seeds the teacher via the Supabase SQL Editor instead of a MySQL client.
