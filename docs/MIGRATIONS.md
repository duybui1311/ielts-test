# Database migrations (Alembic)

**Alembic owns the schema.** The app no longer calls `create_all`; migrations run
automatically at deploy time via the Docker entrypoint
(`alembic -c alembic.ini upgrade head && uvicorn ...`). A failed migration fails
the deploy, so the app is never served against a mismatched schema.

The live DB was already stamped at the baseline (`0001_baseline`), so on every
deploy `upgrade head` is a no-op until there's a new migration to apply.

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

Then commit the generated migration — the next deploy applies it automatically.

Config: `alembic.ini` (script location) + `backend/migrations/env.py` (reads
`DATABASE_URL` via the app settings and uses `Base.metadata`). The baseline
(`0001_baseline`) delegates to `create_all`, so it's guaranteed identical to the
current schema.
