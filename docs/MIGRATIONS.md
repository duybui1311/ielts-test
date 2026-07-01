# Database migrations (Alembic)

Alembic is set up but **not yet wired into deploy** — the app still creates tables
with `create_all` on startup, so nothing changed at runtime. Adopt it when you're
ready to evolve the schema safely.

## One-time adoption on the live database
The live Supabase DB already has every table (from `create_all`). Tell Alembic the
baseline is already applied — do **not** run `upgrade` on it (that would try to
re-create existing tables):

```bash
# with DATABASE_URL pointing at the live DB
alembic -c alembic.ini stamp head
```

After stamping, remove `create_all` from `backend/main.py`'s lifespan and let
migrations own the schema.

## Fresh database (local/staging)
```bash
alembic -c alembic.ini upgrade head
```

## Adding a change from here on
```bash
# 1. edit backend/service/models.py
# 2. autogenerate a migration
alembic -c alembic.ini revision --autogenerate -m "add xyz"
# 3. review the file in backend/migrations/versions/, then
alembic -c alembic.ini upgrade head
```

Config: `alembic.ini` (script location) + `backend/migrations/env.py` (reads
`DATABASE_URL` via the app settings and uses `Base.metadata`). The baseline
(`0001_baseline`) delegates to `create_all`, so it's guaranteed identical to the
current schema.
