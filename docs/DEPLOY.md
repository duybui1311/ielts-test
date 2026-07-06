# Deployment guide

## Architecture
```
Cloudflare (DNS + TLS)
├── app.<domain>      → Frontend  (Vite static build; Cloudflare Pages or Render Static Site)
└── api.<domain>      → Backend   (Render web service, Docker — this repo's Dockerfile)
Supabase             → Postgres (session pooler) + Storage (uploads)
```

## Backend (Render)
Uses the root `Dockerfile`. Health check path: `/api/health` (declared in `render.yaml`).

**Deploys are CI-driven.** Render's own GitHub webhook proved unreliable (pushes
silently didn't deploy while `alembic upgrade head` migrations moved ahead — the
recipe for the crash-loop we hit on 2026-07-05), so the `deploy` job in
`.github/workflows/ci.yml` triggers the Render **Deploy Hook** after both test
jobs pass on `main`, then polls `/api/health` and fails the run if the API does
not come back. Setup:

1. Render → service → Settings → Deploy Hook → copy the URL into the repo
   secret `RENDER_DEPLOY_HOOK_URL`.
2. Set the repo secret `API_HEALTH_URL` to `https://<api-domain>/api/health`
   (the keep-alive workflow uses the same one).
3. Turn Render's **Auto-Deploy off** (Settings → Build & Deploy) so a revived
   webhook can't race the CI deploy.

Never run `alembic upgrade` against the production DB from a laptop — the
deploy pipeline is the only thing that should migrate it.

**Environment variables to set in Render:**
| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase **session pooler** connection string |
| `JWT_SECRET` | ✅ | Long random string. **Keep it stable** — changing it logs everyone out |
| `FRONTEND_URL` | ✅ | Exact frontend origin, e.g. `https://app.yourdomain.com`. Supports a comma‑separated list (prod + preview) |
| `LLM_PROVIDER` | – | `gemini` (default), `claude`, or `local` |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | – | Only for AI import/grading |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | – | Only for uploads (service key is server‑side only) |

Schema is created on startup (`create_all` + idempotent column adds) — no migration step yet.

## Frontend (Vite)
The API base URL is **baked in at build time** from `VITE_API_URL` (`frontend/src/api.js`).
This is the #1 deployment gotcha:

- Set `VITE_API_URL=https://api.yourdomain.com` in the **build** environment
  (Cloudflare Pages → Settings → Environment variables, or Render Static Site).
- If it's empty, the frontend calls its **own** origin and every API call 404s.
- Rebuild after changing it — it is not read at runtime.

## CORS
`FRONTEND_URL` must exactly match the browser's Origin (scheme + host, no trailing
slash). The backend normalizes trailing slashes and accepts a comma‑separated list.
If the app loads but API calls fail with CORS errors, this is almost always the cause.

## Cloudflare settings
- **SSL/TLS mode:** Full (strict) — Render serves valid TLS.
- **DNS:** `CNAME api → <service>.onrender.com` (proxied is fine).
- **Cache:** add a rule to **bypass cache for `api.<domain>/*`** so API responses
  aren't cached. Static frontend assets can be cached aggressively.
- Keep the security headers the backend now sends (`X-Frame-Options`, `nosniff`, …).

## Free‑tier cold starts
Render free spins the service down after ~15 min idle. Two options:
1. **This repo's `.github/workflows/keep-alive.yml`** — set repo secret
   `API_HEALTH_URL=https://api.yourdomain.com/api/health`; it pings every 14 min.
2. An external cron (e.g. cron-job.org) hitting the same URL.

## Verifying a deploy
```bash
curl -i https://api.yourdomain.com/api/health      # expect {"status":"ok"} + security headers
```
Then load the frontend, open DevTools → Network, and confirm API calls hit
`api.yourdomain.com` (not the frontend origin) and return 200.
