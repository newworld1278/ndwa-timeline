# Ask Aya Launch Command Center — NDWA workplan

A live, hosted workplan for the NewWorld × NDWA engagement (SOW 001, Aug 31, 2026 – Jan 8, 2027).
Anyone with the link can read it. Only the team can change it, and changes go live only when
you press **Publish**.

## Deploy (browser only — no terminal)

1. **GitHub.** Create a new repository for this client (never reuse another client's repo).
   Repo root → **Add file → Upload files** → drag the *contents* of this folder (not the folder
   itself) → write a commit message → **Commit changes**.
2. **Netlify.** Add new project → Import from GitHub → pick the repo. Build settings are read
   from `netlify.toml`; leave them alone. Deploy.
3. **Team code.** Netlify → Project configuration → Environment variables → add `TEAM_CODE`
   with a phrase the team will share. Then **Deploys → Trigger deploy → Clear cache and deploy
   site**. Env vars only apply on a fresh build.
4. **Check.** Open `https://<your-site>/api/diagnose`. Every row should show ✓. If not, the first ✕
   tells you what to fix in plain English.
5. **First publish.** Open the site, click **Team editing** in the footer, enter the code, review
   the plan, add your name, press **Publish**. The plan as shown becomes the client's view.

To replace one file later: on GitHub, navigate *into* the matching folder first (e.g.
`src/`), then **Add file → Upload files**. Netlify rebuilds automatically.

If the site goes blank after a change: Netlify → Deploys → click an older deploy →
**Publish deploy**. Then send the failing file and what changed.

## Weekly rhythm

Unlock → update progress and statuses → move dates if needed (the dashed ghost bar records the
original) → rewrite the This Week note → add your name → **Publish**. Download a **Backup**
after any big restructure.

## What lives where

- `src/App.jsx` — the page: seed plan, chart, key dates, MOCHA, editor.
- `src/api.js` — the only file that knows where data is stored.
- `netlify/functions/timeline.mjs` — read (public) and write (team code) for the workplan.
- `netlify/functions/history.mjs` — the last 40 published versions (Versions button).
- `netlify/functions/unlock.mjs` — checks a team code so the unlock button can say "wrong code".
- `netlify/functions/diagnose.mjs` — `/api/diagnose`, the plain-English health check.

Storage: Netlify Blobs, store `askaya-store`, key `askaya-workplan`, snapshots under `history/`.
