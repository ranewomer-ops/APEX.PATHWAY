# Apex Pathway

Premium dark-mode automotive build planner that runs without login or Supabase.

## How It Works

- No login page.
- No Supabase setup.
- Data is saved in this browser with `localStorage`.
- The Planner page includes a local Apex AI Build Agent for customer briefs.
- The agent turns a short request into an editable build plan.

## Files

- `index.html` - static app entry
- `styles.css` - responsive Apex Pathway design system
- `js/app.js` - app events and routing
- `js/store.js` - local data store and persistence
- `js/vehicleAgent.js` - local automotive build-planning agent
- `js/views.js` - dashboard/page rendering
- `js/utils.js` - budget, formatting, and estimator helpers
- `assets/apex-logo.png` - Apex Pathway logo
- `dev-server.mjs` - optional local static preview server

## Local Preview

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:4173/
```

## Planner Example

Open **Planner** and paste:

```text
Customer has a turbo car, wants more power, a safe tune, cooling, exhaust, better brakes, and a clear budget/timeline.
```

The app will create an editable build with recommended parts, costs, estimated horsepower gain, and timeline.

## Vercel

Vercel should use:

- Build command: `npm run build`
- Output directory: `dist`
