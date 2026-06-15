# Frontend (React + Vite)

The IELTS Platform web client: **React 19 + Vite**, **MUI** for components,
**Recharts** for charts and **Framer Motion** for motion. For the full product
overview, setup and usage, see the [root README](../README.md).

## Scripts

Run these from the `frontend/` directory:

| Command           | What it does                                                        |
|-------------------|---------------------------------------------------------------------|
| `npm install`     | Install dependencies.                                               |
| `npm run dev`     | Start the dev server at http://localhost:3000 (HMR).                |
| `npm run dev -- --host` | Same, but reachable from other devices on your network (phone/tablet testing). |
| `npm run build`   | Production build to `dist/`.                                         |
| `npm run preview` | Serve the production build locally to sanity-check it.              |

## Talking to the backend

The dev server proxies `/api` to `http://localhost:8000` (see `vite.config.js`),
so just start the backend (`uvicorn backend.main:app --reload --port 8000`) and
the frontend works with no extra config. To point at a different API, set
`VITE_API_URL` in a `.env` file.

## Project layout

```
src/
  App.jsx                 Routes + the responsive app shell (side rail / mobile dock)
  api.js                  fetch wrapper that attaches the JWT and handles 401s
  auth.js                 client session helpers (role, token, isAuthed)
  theme/                  MUI theme — palette, gradients, light/dark mode
  component/              shared UI (navbar, TopBar, PageHeader, StatCard, charts…)
  pages/                  one file per route (ExamTake, Writing, Speaking, Admin…)
```

Every page is **code-split with `React.lazy`**, so the initial bundle only ships
the app shell. Theme tokens (palette, gradients, shadows) live in
`src/theme/index.js`; reusable presentational helpers live in
`src/component/ui.jsx`.

## Notes

- **Responsive:** a collapsible side rail on desktop (≥1200px) and a bottom
  navigation dock + slide-in drawer on phone/tablet.
- **Light/dark mode** is toggled in the top bar and persisted per device.
- See [`../CLAUDE.md`](../CLAUDE.md) for the architecture and data model.
