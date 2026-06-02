# Cargo Manifest — Webapp (Docker)

A snappy, self-hostable Star Citizen hauling planner (homelab, VPS, LAN) — several people
can use it from a browser, with no server-side data.

Built with **Svelte 5 + Vite + TypeScript**, served as static files by **nginx**.

> **Contributing / picking this up?** Read **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** first —
> it's the exhaustive map of how everything fits together and what *not* to break.
> **[`PARITY.md`](./PARITY.md)** is the dated changelog + decision log.

## Features

- **Manifest grid** — per-trip cargo lines (mission #, commodity, SCU, from, to) that
  auto-break into SCU crates (32/24/16/8/4/2/1), largest-first, per-trip box limits.
- **Missions register** — per-mission rollup (SCU, crate breakdown, pick→drop, reward in
  aUEC); assign a ship per mission with a grid-aware fit check; reorder / delete / add.
- **Fleet & Ship Fit** — your owned ships in the sidebar; "best fit" pinned; realistic
  capacity via per-ship **cargo grids** (max box size + arrangement), not just nominal SCU.
- **Pick Up / Drop Off** — route cards grouped by source / destination with completion
  tracking (pick-up = visual reminder, drop-off = real completion).
- **Screenshot Import** — paste/drop a screenshot of a contract's Primary Objectives; in-
  browser OCR + fuzzy catalog matching fills a mission for you to review and confirm.
- **Light / dark theme**, fast keyboard entry (directional Tab, Ctrl+Arrow), JSON run
  export/import, catalog CSV export.

## Privacy model (important)

- **Your data never touches the server.** The runtime is static nginx — no backend, no
  database, no accounts. There is nowhere on the server to store anything you type.
- Your **run** (trips, items) and your **catalog customizations** (owned ships, capacity
  tweaks, added commodities/locations) live only in your browser's `localStorage`.
- Storage is a **hybrid**: the server hosts the read-only baseline catalog
  (`ships/commodities/locations`); your browser stores only the *delta* on top of it. That
  keeps local data tiny and lets baseline updates (new ships, patched SCU values) flow
  through without wiping your customizations.
- **Clear & reset** (sidebar **⚙** menu → *Clear & reset*) wipes your local run + delta and
  returns to the bundled defaults.

## Run it with Docker

```bash
# from the repo root or this folder:
cd webapp
docker compose up -d --build
# open http://localhost:8081
```

To stop: `docker compose down`. The container runs **unprivileged** (user 1000) and nginx
listens on **8080 inside**; compose publishes it on host **8081** (`"8081:8080"`). Change the
host port by editing `docker-compose.yml`. If you change the *internal* port you must update
all three: `nginx.conf` `listen`, `Dockerfile` `EXPOSE`, and the compose container port.

### Plain docker (no compose)

```bash
# build context must be the repo root so the baseline /data CSVs are included
docker build -f webapp/Dockerfile -t cargo-manifest-webapp .
docker run -d -p 8081:8080 --user 1000:1000 --name cargo-manifest cargo-manifest-webapp
# open http://localhost:8081
```

## Develop locally

```bash
cd webapp
npm install
npm run dev      # http://localhost:5173 (auto-copies ../data/*.csv first)
npm run build    # production build → dist/
npm run preview  # serve the production build on :8080
npm run check    # svelte-check (types + a11y)
```

## Catalog / default data

The baseline catalog is the repo-root **`/data/*.csv`** — the *single source of truth*,
shared with the self-host version. `npm run dev`/`build` (and the Docker build) copy those
files into `public/data/` via `scripts/sync-data.mjs`; `public/data/` is generated and
gitignored. To update defaults (e.g. a new SC patch), edit `../data/*.csv` and rebuild.

### Updating ship / commodity / location data

1. Edit the relevant `/data/*.csv` (any spreadsheet — header row stays on row 1).
2. Rebuild/redeploy: `docker compose up -d --build`.

In the hosted app, end users can only layer **personal** additions and owned-ship flags on
top (stored in their browser, never on the server). Only the `/data` CSVs change the shared
baseline.

### Ship cargo grids (realistic capacity)

`ships.csv` may carry extra columns describing how cargo actually fits, beyond nominal SCU:

```
Name,SCU,MaxSize,Grid32,Grid24,Grid16,Grid8,Grid4,Grid2,Grid1,Owned
Zeus ES,128,16,,,6,,8,,,No
```
- **MaxSize** — the largest container the ship physically accepts.
- **Grid32…Grid1** — how many of each size fit in your most-efficient real arrangement
  (blank where N/A; small leftovers go in the smaller sizes). The realistic capacity used
  by Ship Fit Check is `Σ size×count`.

Ships without these columns just use nominal SCU (fully backward-compatible; the self-host
single-file app ignores the extra columns).

**Easiest way to fill them in:** in the app, click **▦** on a fleet row, or **⚙ → Edit
ship data…** for any ship. Edits save to your browser instantly (so you see them at once);
**⚙ → Export catalog CSVs** then gives you an updated `ships.csv` to drop into `/data` and
rebuild for everyone.

> Note: the exported `ships.csv` reflects *your* fleet in the `Owned` column. When committing
> to the master set, keep `Owned` as `No` (owned status is per-user browser state) — the grid
> columns are what you want to share.

## Status

Actively developed; this is the primary app. It has moved well beyond the original single-
file tool (missions, ship cargo grids, screenshot OCR import, theming). Architecture is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md); the dated changelog + design decisions are in
[`PARITY.md`](./PARITY.md).
