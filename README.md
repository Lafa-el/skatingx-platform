# SkatingX Platform

Unified training, analysis, and AI coaching platform for short track speed skating.

## Monorepo layout

| Path | Purpose |
|------|---------|
| `apps/web` | Vite + React + TypeScript SPA |
| `packages/schema` | Firestore path helpers and constants |
| `packages/skating-domain` | Pure domain logic (migrated from legacy later) |
| `packages/firebase-client` | Firebase init from `VITE_FIREBASE_*` env vars |
| `packages/content` | Academy, plans, i18n JSON (later) |
| `packages/ui` | Shared UI primitives |

## Prerequisites

- Node.js 20+
- npm 10+ (workspaces)

## Quick start

From the repository root:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The app redirects `/` to `/dashboard`.

## Firebase configuration

Copy `.env.example` to `apps/web/.env.local` (or root `.env` — Vite loads env from the app directory) and fill in values from your Firebase console:

```bash
cp .env.example apps/web/.env.local
```

Required variables (names only in `.env.example`):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

If variables are missing, the app still runs; Firebase initialization is skipped with a console warning.

## Build

```bash
npm run build
```

## Status (skeleton)

- Placeholder routes and pages only
- No authentication
- No Firestore reads/writes
- Legacy Training and Analysis apps are **not** migrated yet

See `docs/SKATINGX_ARCHITECTURE_BLUEPRINT.md` for the target architecture.
