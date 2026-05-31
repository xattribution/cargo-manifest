# Cargo Manifest — Webapp (Docker)

A snappy, self-contained **webapp build** of the Star Citizen hauling planner, meant to be
hosted (homelab, VPS, LAN) so several people can use it from a browser. It is a separate
artifact from the root single-file `cargo-manager.html` self-host tool — that one is
untouched and still works by double-clicking.

Built with **Svelte 5 + Vite + TypeScript**, served as static files by **nginx**.

## Privacy model (important)

- **Your data never touches the server.** The runtime is static nginx — no backend, no
  database, no accounts. There is nowhere on the server to store anything you type.
- Your **run** (trips, items) and your **catalog customizations** (owned ships, capacity
  tweaks, added commodities/locations) live only in your browser's `localStorage`.
- Storage is a **hybrid**: the server hosts the read-only baseline catalog
  (`ships/commodities/locations`); your browser stores only the *delta* on top of it. That
  keeps local data tiny and lets baseline updates (new ships, patched SCU values) flow
  through without wiping your customizations.
- **Clear my data & load defaults** (top bar *Clear*, or the button in the data bar) wipes
  your local run + delta and returns to the bundled defaults.

## Run it with Docker

```bash
# from the repo root or this folder:
cd webapp
docker compose up -d --build
# open http://localhost:8080
```

To stop: `docker compose down`. Change the published port by editing `docker-compose.yml`
(`"8080:80"`).

### Plain docker (no compose)

```bash
# build context must be the repo root so the baseline /data CSVs are included
docker build -f webapp/Dockerfile -t cargo-manifest-webapp .
docker run -d -p 8080:80 --name cargo-manifest cargo-manifest-webapp
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

## Status

Feature parity with the single-file app, plus the hosted-mode changes (client-only
persistence, clear/defaults). Progress and intentional deviations are tracked in
[`PARITY.md`](./PARITY.md).
