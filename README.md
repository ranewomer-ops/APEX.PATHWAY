# Apex Pathway

Premium dark-mode automotive build planner that runs without login or Supabase.

## How It Works

- No login page.
- No Supabase setup.
- Data is saved in this browser with `localStorage`.
- Customer brief templates are stored in `js/store.js`.
- The Planner page can turn a short request into an editable build plan.

## Files

- `index.html` - static app entry
- `styles.css` - responsive Apex Pathway design system
- `js/app.js` - app events and routing
- `js/store.js` - local data store, templates, and persistence
- `js/views.js` - dashboard/page rendering
- `js/utils.js` - budget, formatting, and estimator helpers
- `assets/apex-logo.png` - Apex Pathway logo
- `dev-server.mjs` - optional local static preview server

## Local Preview

```bash
node dev-server.mjs
```

Then open:

```text
http://127.0.0.1:4173/
```

## Planner Example

Open **Planner** and paste:

```text
I have a BMW M340i, I want more turbo power, Stage 2 tune, and supporting upgrades.
```

The app will create an editable BMW M340i Stage 2 build with recommended parts, costs, estimated horsepower gain, and timeline.
