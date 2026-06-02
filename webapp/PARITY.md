# Webapp — Feature Parity & Decision Log

Tracks the Docker-hosted **webapp** rewrite (Svelte 5 + Vite + TS) against the original
single-file self-host app (`../cargo-manager.html`, documented in `../README.md` and
`../ARCHITECTURE.md`). When a behaviour is unclear, the single-file app is the reference.

**Legend:** ✅ done · 🟡 in progress · ⛔ intentionally dropped (with reason) · 🔵 changed by design · ⬜ not started

---

## v0.10 — sidebar run info, grid QOL (quick-fill + tab direction)

- **Removed the on-page manifest-name box**; the run name + live totals now live in the
  sidebar under the brand. The name is edited in the Export dialog. Overview is the page top
  (the sticky work-head is gone; mobile gets a small floating ☰).
- **Quick-fill rail** right of each trip grid: the distinct commodities/locations already used
  in that trip as click-to-fill chips — clicking drops the value into the focused cell and
  copies it to the clipboard (paste still works).
- **Directional grid navigation**: Tab moves by a chosen primary direction (vertical by
  default, matching manifest entry), Shift+Tab reverses, Enter always moves down; a
  **Tab ↓/→ toggle** in the Manifest header switches it (persisted). **Ctrl/Cmd + Arrow** is a
  one-off override to move any direction (no auto-add). Tabbing past the last row auto-adds a
  commodity line. `lib/prefs.svelte.ts`.

## v0.9 — contrast pass, distinct completion, dark mode

- **Light theme toned down** (warmer manila, less stark white); table headers get a tinted
  band, stat values/body text bumped for readability behind charts & lists.
- **Completed items** now use a distinct **greenish-grey wash** + struck text (rows, group
  cards, and item lines) instead of plain fade-out.
- **Full dark mode** toggle (☾/☀ in the sidebar footer): palette split into shared tokens +
  `[data-theme=light|dark]` overrides; flips the whole page (sidebar already dark). Persists
  to localStorage (`cargo:webapp:theme`), defaults to OS `prefers-color-scheme`, and sets
  `color-scheme` so native controls follow. `lib/theme.svelte.ts`.

## v0.8 — dispatch-desk redesign (sidebar + light workspace)

- **Full visual redesign** away from the dark sci-fi look: a **dark operations sidebar**
  (brand + Fleet management, persistent) beside a **light "manila/paper" workspace** with
  solid matte section-header fills (no transparency overlays, no clip-paths/glow). Reads like
  a logistics dispatch tool.
- **Overview section** = Missions + Loadout Summary merged (replaces the separate Missions and
  Loadout zones; `Overview.svelte`, old `Summary.svelte` removed).
- **Mission crate breakdown is now column-based** (one column per crate size, like the trips
  table) instead of `#×#` text.
- **Fleet moved to the sidebar** and simplified: each ship is `fit-dot · name · SCU` at a
  glance; click to expand capacity edit / grid summary / remove. Compact fit-mode toggle
  (Per mission / Largest trip / Combined) + add-ship row at the bottom.
- **Sentences removed from the page** — all hints/intro/mini-notes folded into the `?` help
  modal; section headers carry only short labels. Trip-row mission color is now a left color
  bar on the light row (was a full dark fill).
- Responsive: sidebar collapses to an off-canvas drawer (☰) under 900px.

## v0.7 — missions, card reorder, SCADA restyle

- **Industrial / SCADA restyle**: flat charcoal surfaces, hairline gridline texture, square
  corners (all angular `clip-path` panels removed), denser rows, mono/upper labels, signal
  colors, left-accent zone bars with a register feel. No glows/gradients. More "control panel
  a logistics company actually uses" than sci-fi.
- **Missions register** (`Missions.svelte`, zone 2): one row per in-use mission (1–10) with
  color swatch, editable label, total SCU, crates (+leftover), crate breakdown, distinct
  pickup/dropoff counts, and a **per-mission ship assignment** with a grid-aware FIT badge.
- **Ship Fit Check 3rd mode**: **Per mission** (sizes the global fleet for the largest single
  mission) / Largest trip / Combined total. Per-mission assignment lives in the Missions panel
  so you can split a run across several hulls or view the largest/combined total.
- **Card reorder**: Pick Up and Drop Off cards have a ⠿ grip; manual order persists per column
  (`pickOrder`/`dropOrder`), pointer-based (mouse + touch). New cards fall in by SCU desc.
- Run state gains `missionShips`, `missionNames`, `pickOrder`, `dropOrder` (all defaulted in
  `migrate`); `fitMode` widened to `mission|largest|combined`. Shared `shipFit()` helper in
  catalog.ts powers both the fleet and mission fit badges.
- Section order: 1 Ship Fit · 2 Missions · 3 Manifest (Trips) · 4 Loadout Summary · 5 Pick Up |
  6 Drop Off.

## v0.6 — ship cargo grids (realistic capacity & fit)

- `ships.csv` gains optional columns `MaxSize, Grid32…Grid1` (between SCU and Owned):
  max container size + how many of each size fit in the ship's most-efficient real
  arrangement. Realistic capacity = `Σ size×count`. Backward compatible — ships without
  these columns use nominal SCU, and the self-host single-file app ignores the extra cols.
- **Ship Fit Check is grid-aware**: when a ship has grid data, fit uses its realistic
  capacity AND gates on max container size (e.g. a 120-SCU ship that maxes at 16 shows
  "✕ needs ≤16" if the load contains a 32 crate). Falls back to plain SCU otherwise.
  Capacity column shows a green ▦ chip (realistic SCU · max size).
- **In-app grid editor** (`ShipGridEditor.svelte`): ▦ on any fleet row, or ⚙ → "Edit ship
  data…" for *any* catalog ship. Live grid-total vs nominal check; auto-suggests MaxSize.
  Saves to the browser delta instantly (dual nature) and exports via Export catalog CSVs.
- Delta schema → v2: added `shipGrids` (per-ship `{scu,maxSize,grid}`); `normalizeDelta`
  back-fills it for older saves.

## v0.5 — column cleanup, (i) tip, spelling

- **Tighter default column widths** (commodity 300→210, from 200→160, to 200→175) so the
  Commodity/From/To columns don't leave a big dead zone before SCU. One-time migration
  adopts the new defaults for anyone still on the old ones (custom widths preserved).
- **Resize handles are now visible & obvious**: a persistent vertical divider on the
  Commodity/From/To headers (faint → cyan on hover), bigger hit area, header padding so it
  no longer floats in empty space. Dragging unchanged (already worked well).
- **Trips intro text moved behind an (i)** next to “+ Add Trip” → opens a small tip modal
  (avoids the long paragraph cluttering the section). Uses the shared Modal (no clip-path
  clipping issues).
- **Spelling: “colour” → “color”** throughout (American English).

## v0.4 — header, density, toggle clarity + phase-2 polish

- **Header reworked**: removed the always-on manifest-name box; that area now shows the
  **data status** (ships / commodities / locations, stacked) plus a **Help (?)** button and
  the ⚙ menu. The run name is now asked for in an **Export dialog** when you export.
- **Help modal** (`Modal.svelte`): short what-to-do steps + a worked crate example.
- **Privacy line moved to the page footer** (was a top strip).
- **Tighter spacing** between/within zones (less empty separation).
- **Crate-size toggles are now obviously switches**: ON = solid cyan + ✓ + "ON"; OFF =
  dashed, dimmed + "OFF"; with a "click a size to switch it on/off" hint. (Flagship feature
  — clarity matters.)
- **Column resize** ✅ — pointer-based drag handles on Commodity/From/To headers; width is
  shared across trips and persisted in `state.colW`.
- **Touch-friendly drag-reorder** ✅ — replaced HTML5 DnD with Pointer Events (works on
  mouse and touch); live reorder via row midpoints.

## v0.3 — Pick Up | Drop Off rework

- **Side by side**, one section: **Pick Up** (left, violet, #4) and **Drop Off** (right,
  orange, #5) with a vertical divider (`components/Routes.svelte`). Stacks on narrow screens.
- Renamed from "What To Pick Up & Where" / "What To Drop Off & Where" → **Pick Up** / **Drop Off**.
- One card per location; each cargo line shows a **mission chip** (number + mission colour)
  next to it (`.mchip`).
- **Two completion states** (new `Item.pickedUp`, separate from `Item.done`):
  - **Drop Off** check = the real completion → sets `done` (fades the trip line). 
  - **Pick Up** check = visual reminder only → sets `pickedUp`; does **not** complete the line.
  - A line is "collected" if `pickedUp || done`, so a pickup card **auto-checks** once all
    its cargo has been dropped off; otherwise pickup is just your own where-to-go tracker.
- Replaces the old single bidirectional `done` model for these cards. `setGroupPicked()`
  added; collapse on these two sections dropped (always shown side by side).

## v0.2 — UI redesign (flow + colour)

Addresses "map-shock / everything is blue". The page is now five distinct, accent-themed,
numbered **zones** (`components/Zone.svelte`) that flow top→bottom:

1. **Ship Fit Check** — green — *moved to the top* (decide the hull first)
2. **Trips** — cyan — `+ Add Trip` lives in the zone header
3. **Loadout Summary** — amber
4. **What To Pick Up & Where** — violet — *now before drop-off* (haul order: collect first)
5. **What To Drop Off & Where** — orange

Other changes:
- Each zone has a coloured header band (accent gradient + left border), a numbered badge,
  and inherits its accent into its panel/cards (group cards use `var(--accent)`).
- Utility actions (Export Run, Import Run, Export CSVs, Clear data & load defaults) moved
  out of the body into a **⚙ cog menu** in the top bar; the big buttons are gone.
- The button-heavy data bar is replaced by a slim one-line privacy/status strip.
- New tokens `--violet`, `--orange`; pick-up/drop-off card accents are zone-driven.
- nginx.conf `listen` corrected to **8080** to match the unprivileged image + `EXPOSE 8080`
  (the unprivileged nginx can't bind 80).

## Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | **Svelte 5 (runes) + Vite + TypeScript** | Compiles away to a tiny bundle (no VDOM runtime) → snappy; TS gives the data model real types. |
| Runtime | **Static files behind `nginx:alpine`** | No backend, no DB → user data *structurally* cannot be stored server-side. |
| Storage | **Hybrid: server baseline + localStorage delta** | Baseline catalog (CSVs) is served read-only; only the user's *delta* (owned ships + added entries) and the run live in the browser. Tiny footprint; baseline patches flow through; nothing leaves the browser. |
| Cookies | **Not used for data** | ~4 KB cap can't hold the catalog and cookies are sent to the server every request — both fight the requirements. localStorage is the correct fit. |
| Default data | **Single source of truth = repo-root `/data/*.csv`** | `scripts/sync-data.mjs` copies them into `public/data/` at dev/build time; `public/data` is gitignored (generated). No drift with the self-host version. |
| Core logic | **Ported verbatim where possible** | `csv.ts`, `crate.ts`, `mission.ts` are line-for-line ports of the proven algorithms so packing/colour behaviour is identical. |

### Storage model (detail)
```
localStorage["cargo:webapp:run"]   = RunState         (trips, items, view settings)
localStorage["cargo:webapp:delta"] = CatalogDelta {
  shipsOwned:       { [lowerName]: { name, cap|null, added } }   // presence = owned; cap null = use baseline
  commoditiesAdded: CatalogRow[]                                  // user-added only
  locationsAdded:   CatalogRow[]                                  // user-added only
}
```
Materialized catalog = baseline ⟕ delta. "Clear data & load defaults" removes both keys.

---

## Feature parity checklist

### Core data / persistence
- ✅ CSV parse/serialize (quote-aware, CRLF, BOM) — `lib/csv.ts`
- ✅ Crate packing (greedy largest-first cascade) + aggregation — `lib/crate.ts`
- ✅ Mission colours + contrast FG — `lib/mission.ts`
- ✅ Hybrid baseline+delta catalog model — `lib/catalog.ts`
- ✅ localStorage run + delta persistence, clear-all — `lib/storage.ts`
- ✅ Run state reactive store + debounced autosave — `stores/run.svelte.ts` + `App.svelte` effect
- ✅ Catalog reactive store (materialized $derived views, mutations write delta) — `stores/catalog.svelte.ts`
- ✅ Migration of legacy run shape (single-list `{items,sizes}` → sections) on Import — `migrate()`

### Planner UI (Trips)
- ✅ Trips: add / rename / remove (keep ≥1), live subtotal
- ✅ Per-trip crate-size toggles (32…1)
- ✅ Item rows: mission #, commodity, SCU, from, to, per-size cells, crates, done, delete
- ✅ Per-row mission colouring + auto text contrast
- ✅ Datalist autocomplete (commodity/location/ship) + novelty "+" to add to catalog
- ✅ Column sort (M/Commodity/SCU/From/To)
- ✅ Drag-to-reorder rows (desktop, HTML5 DnD) — clears column sort like the original
- 🟡 **Column resize** (Commodity/From/To) — widths render from `state.colW` but the drag handle isn't wired yet → **phase 2**
- 🟡 **Touch drag-reorder** — desktop works; pointer-event/touch variant is **phase 2**

### Read-outs
- ✅ Loadout Summary (totals, per-size chips, leftover warning)
- ✅ What To Drop Off / Pick Up — grouped cards, collapsible
- ✅ Bidirectional completion (item ↔ card; card checkbox indeterminate state)
- ✅ Ship Fit Check (owned ships, best-fit pin, largest-trip/combined toggle, sort, add/edit/remove)
- ✅ Copy Summary Text

### Top bar / data controls
- ✅ Run name, Export Run / Import Run (JSON)
- 🔵 **Clear** → "Clear my data & load defaults" (wipes run + delta, reloads baseline) — *expanded per request; also surfaced in the data bar*
- ✅ Export CSVs (download materialized catalog)
- ✅ Privacy/status line ("your data stays in this browser — nothing is sent to the server")
- ⛔ **Connect data folder** (File System Access write-back) — meaningless on a shared host; baseline is read-only and edits live client-side
- ⛔ **Load CSVs…** — dropped in hosted mode: defaults are server-provided and per-user additions go through the inline "+"/fleet. (Import Run still moves a whole plan between devices.)

### Packaging
- ✅ Dockerfile (multi-stage `node` → `nginx:alpine`), HEALTHCHECK
- ✅ nginx.conf (gzip, asset cache, no-store index, security headers + CSP, SPA fallback)
- ✅ docker-compose.yml (one-command self-host, context = repo root)
- ✅ webapp/README.md (run instructions + privacy model)

### Verification status
- ✅ `npm run build` (vite) — bundle ≈ 76 KB JS (28 KB gzip) + 16 KB CSS
- ✅ `npm run check` (svelte-check) — 0 errors, 0 warnings
- ✅ Served production build smoke-tested: index mounts, hashed JS loads, baseline `/data/ships.csv` served (HTTP 200)
- ⏳ `docker build` — not run here (no Docker daemon in this sandbox); pipeline is standard and the underlying `npm build` + static serving are verified. Run on a host with the daemon.

---

## Intentional deviations from the single-file app
1. **No folder write-back.** Hosted catalog is read-only; customisations persist as a local delta. (Self-host single-file app still has full File System Access.)
2. **Clear expands to "clear + load defaults"** per request.
3. **Touch-friendly drag/resize** planned via Pointer Events (the original uses HTML5 DnD, which doesn't work on mobile).
4. **Baseline updates are non-destructive**: shipping new SCU values updates everyone's defaults while keeping their owned/custom delta.

## Phase 2 — done (v0.4)
- ✅ **Column resize** drag handles (pointer-based, shared width in `state.colW`).
- ✅ **Touch** drag-reorder via Pointer Events (replaced HTML5 DnD).
- Still optional/ideas: per-trip collapse; a first-run tip; keyboard column resize.

## Resolved decisions
- **Load CSVs… dropped** in hosted mode (baseline is server-provided; per-user additions use the inline "+"). Import Run (JSON) covers moving a plan between devices.
