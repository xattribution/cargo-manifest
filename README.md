# Cargo Manifest — Star Citizen Hauling Planner

A self-hostable web tool for planning multi-stop cargo runs in Star Citizen. Break a
contract's commodities into SCU crates, see which of your ships actually fits the load,
group the route by pickup/drop-off, track progress, and even **import a mission straight
from a screenshot** (in-browser OCR — no upload).

**Everything runs in your browser.** The server is static nginx with no backend and no
database — your manifests, fleet, and catalog edits live only in your browser's
`localStorage`. Nothing you type leaves your device.

Built with **Svelte 5 + Vite + TypeScript**, shipped as static files in a small Docker image.

---

## Quick start (Docker)

```bash
cd webapp
docker compose up -d --build
# open http://localhost:8081
```

Runs unprivileged (user 1000); nginx listens on 8080 inside the container, published on host
**8081**. Full deploy/develop instructions: **[`webapp/README.md`](./webapp/README.md)**.

## Repository layout

```
data/                 ★ catalog source of truth (CSV): ships, commodities, locations
└── ships.csv         Name,SCU,MaxSize,Grid32..Grid1,Owned
    commodities.csv   Name,Type
    locations.csv     Name,Type,System,Planet,Moon,Place
webapp/               the app (Svelte + Vite + TS, served by nginx in Docker)
├── README.md         run / deploy / develop guide
├── ARCHITECTURE.md   ★ full architecture & "autopsy" — read this before editing code
├── PARITY.md         dated changelog + design-decision log
└── src/              app source
LICENSE
```

To update the catalog (new ships, patched SCU values, etc.), edit **`data/*.csv`** and
rebuild — those files are the single source of truth and are copied into the build.

## Documentation

- **Using / deploying it:** [`webapp/README.md`](./webapp/README.md)
- **How it's built & why (start here before changing code):**
  [`webapp/ARCHITECTURE.md`](./webapp/ARCHITECTURE.md)
- **What changed, when, and the reasoning:** [`webapp/PARITY.md`](./webapp/PARITY.md)

> **History:** this project began as a single self-contained `cargo-manager.html` file. That
> version is **deprecated and has been removed from `main`** (archived in a fork); the
> `webapp/` is the only maintained app. The CSV catalog format carries over unchanged.
