# Apex Pathway

Production dashboard for automotive build tracking: **Vite + React + TypeScript** on the frontend, **Supabase** for auth/data/realtime, ready for **Vercel** and **GitHub**.

Legacy vanilla files (`js/`, old static entry) remain for reference; the live app is the Vite project at the repository root.

## Quick start

```bash
cp .env.example .env.local
# Edit .env.local — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run **`supabase/schema.sql`** once (core tables, RLS, triggers, planner templates).
3. Add **Authentication → URL Configuration** entries for your local and production origins if you use email links.
4. Create users (no public signup in the UI):
   - Auth user email pattern: `username@{VITE_USERNAME_EMAIL_DOMAIN}` (default `apex-pathway.local`).
   - Row in `public.users` with the same `id` as `auth.users.id`.

### Seed demo customer (optional)

With **service role** key (never expose to the browser):

```bash
set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE
node scripts/seed-customers.mjs
```

Also available: `tools/seed-demo-e46.ps1` and `supabase-seed-demo-e46.sql`.

## Environment variables

See **`.env.example`**. Only variables prefixed with **`VITE_`** are available in the React app.

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Publishable / anon key |
| `VITE_USERNAME_EMAIL_DOMAIN` | Fake email domain for username login |
| `VITE_CURRENCY` / `VITE_LOCALE` | Display formatting |

## Fallback / empty data behavior

- After login, if the user has **no builds** in Supabase, the app shows an **embedded demo E46 project** so the dashboard is never empty. Saving is disabled until a real build exists (`useFallbackWorkspace`).
- If **planner templates** are missing from the database, the app loads **fallback template JSON** for the Planner page.

## Build & deploy

```bash
npm run build
npm run preview   # optional local check of dist/
```

### Vercel

- Connect the GitHub repo, framework **Vite**, build `npm run build`, output **`dist`**.
- Set the same `VITE_*` variables in the Vercel project **Environment Variables**.

### GitHub Actions

`.github/workflows/ci.yml` runs `npm install` and `npm run build` on push/PR.

## Project layout

| Path | Description |
|------|-------------|
| `src/` | React app (routing, pages, Zustand store) |
| `src/lib/supabaseBrowser.ts` | Browser Supabase client |
| `src/lib/fallbackSeed.ts` | Client-side demo data |
| `src/state/apexStore.ts` | Auth, workspace load, realtime, CRUD |
| `supabase/schema.sql` | Single-file production schema |
| `scripts/seed-customers.mjs` | Service-role seed script |
| `styles.css` | Existing design system (imported from `src/main.tsx`) |

## Data rules

- Builds are scoped by `user_id`; parts by `build_id`.
- Budget totals come from part prices; “spent” excludes `planned` status.
- Timeline rows for part status changes are created by Postgres triggers.
- Maintenance is separate from parts/timeline.
- Realtime channels refresh the active build when data changes (disabled while viewing client-only fallback).
