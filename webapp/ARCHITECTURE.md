# Cargo Manifest Webapp — Architecture & Autopsy

> **Read this first.** This document is the authoritative, deliberately-exhaustive
> reference for the Docker-hosted webapp under `webapp/`. It exists so a future
> contributor — human or AI — can make changes **without breaking working features**
> or reintroducing bugs we already fixed. If you are an LLM picking this project up
> cold: read §0–§3 fully, then the section for whatever you're touching, then the
> **Gotchas (§13)** and **Invariants (§14)** before editing.
>
> When you change behaviour, **update this file and `PARITY.md` in the same commit.**

---

## 0. TL;DR / orientation

- **What it is:** a client-only web tool to plan multi-stop Star Citizen cargo hauls —
  break commodities into SCU crates, see which owned ship fits, track pickups/drop-offs,
  group missions, and import missions from in-game screenshots via OCR.
- **Stack:** Svelte 5 (runes) + Vite + TypeScript, no SSR, no backend. Served as static
  files by **nginx** (unprivileged image) in Docker.
- **Privacy is the core constraint:** the runtime is static nginx; there is **no server
  state**. Everything the user does lives in their browser `localStorage`. The OCR runs
  in-browser (Tesseract.js, locally vendored — no cloud, no upload). *Do not* introduce
  anything that sends user data off-device.
- **Two apps in one repo:**
  - **`/cargo-manager.html`** (repo root) — the original **single-file** self-host app.
    Self-contained, documented by **root `/README.md`** and **root `/ARCHITECTURE.md`**.
    *Largely frozen.* The webapp is where active development happens.
  - **`/webapp/`** — this app. The modern rewrite. Shares **only** the `/data/*.csv`
    catalog with the single-file app (build-time copy; see §5).
- **Source of truth for catalog data:** repo-root **`/data/*.csv`** (`ships`,
  `commodities`, `locations`). Never edited inside `webapp/`; copied in at build.

---

## 1. Why this exists / product intent

The user hauls cargo in Star Citizen. A single contract ("mission") asks you to deliver
N SCU of commodities from source(s) to destination(s). Cargo physically ships in
**crates** of fixed SCU sizes (32/24/16/8/4/2/1). A real run combines **several missions**
onto **one or more ship-loads ("trips")**, and you need to know:

1. How many crates of each size each commodity becomes (largest-first packing).
2. Which of *your* ships can actually carry a given load (not just by nominal SCU, but by
   the ship's real cargo **grid** — some ships can't take big boxes).
3. The route: where to pick up, where to drop off, grouped so you can plan stops.
4. Progress tracking as you fly the run.
5. Per-mission economics (reward in aUEC).

The OCR importer exists because you **cannot copy text out of the SC client** — a
screenshot is the only way to get mission data out, so we read it with OCR and match it
against the catalog.

**Design ethos:** an industrial "dispatch desk" tool a logistics company would actually
use — dense, document-like, matte, not flashy. The user explicitly rejected the earlier
glossy sci-fi look. **Less is more; no full sentences on the page** (explanatory prose
lives behind the `?` help and `(i)` info buttons).

---

## 2. Repository map

```
/                         repo root
├── cargo-manager.html    SINGLE-FILE app (frozen-ish). Self-contained.
├── README.md             user guide for the single-file app
├── ARCHITECTURE.md       tech reference for the single-file app
├── LICENSE
├── data/                 ★ SOURCE OF TRUTH catalog CSVs (shared by both apps)
│   ├── ships.csv         Name,SCU,MaxSize,Grid32..Grid1,Owned
│   ├── commodities.csv   Name,Type
│   └── locations.csv     Name,Type,System,Planet,Moon,Place
└── webapp/               ★ THIS APP
    ├── ARCHITECTURE.md   ← you are here
    ├── PARITY.md         feature changelog + decision log (vX.Y entries)
    ├── README.md         how to run/deploy the webapp
    ├── Dockerfile        multi-stage: node build → nginx-unprivileged
    ├── docker-compose.yml one-command self-host (port 8081→8080)
    ├── nginx.conf        static serving; listen 8080; gzip; cache; CSP
    ├── .dockerignore     (context = repo root)
    ├── index.html        Vite entry; <head> fonts + favicons
    ├── package.json      scripts: dev/build/preview/check/fetch-tessdata
    ├── tsconfig.json / svelte.config.js / vite.config.ts
    ├── scripts/
    │   ├── sync-data.mjs       copies /data CSVs + vendors OCR runtime → public/
    │   └── fetch-tessdata.mjs  one-time download of eng.traineddata (committed)
    ├── vendor/tessdata/eng.traineddata.gz   ← COMMITTED (offline OCR; ~10MB)
    ├── public/            (favicons committed; data/ + ocr/ generated & gitignored)
    └── src/
        ├── main.ts            mounts App.svelte
        ├── App.svelte         shell: sidebar + workspace + all modals
        ├── app.css            ★ ALL styling (global, not scoped). ~450 lines.
        ├── components/        Svelte UI components (see §6)
        ├── stores/           reactive global state (run, catalog)
        └── lib/              framework-agnostic logic + helpers (see §4)
```

---

## 3. Mental model: the three data domains

There are **three separate data domains**. Keeping them separate is essential — mixing
them is the #1 source of bugs.

| Domain | What | Where it lives | Persisted as |
|---|---|---|---|
| **Run** | The user's plan: trips, cargo lines, mission metadata, view prefs | `stores/run.svelte.ts` → `RunState` | `localStorage["cargo:webapp:run"]` |
| **Catalog** | The reference lists (ships/commodities/locations) | `stores/catalog.svelte.ts` | **baseline** = server CSVs (read-only) + **delta** = `localStorage["cargo:webapp:delta"]` |
| **UI prefs** | Theme, tab direction, fleet-collapsed | `lib/theme.svelte.ts`, `lib/prefs.svelte.ts`, inline | small individual `localStorage` keys |

**Run vs Catalog is the critical split.** The run references catalog entries *by name
string* (not by id). The catalog is a lookup/autocomplete source; the run is the user's
work. Owned ships live in the **catalog delta**, NOT the run (so exporting a run as JSON
does not carry your fleet — that's intentional).

### The hybrid catalog (baseline + delta) — read this carefully

The server ships read-only **baseline** CSVs. The browser stores only a small **delta**:
- `shipsOwned` — which ships you own (+ optional capacity override)
- `shipGrids` — per-ship cargo-grid data (max box size + grid arrangement)
- `commoditiesAdded` / `locationsAdded` — entries you added that aren't in the baseline

The **materialized** catalog the UI reads = `baseline ⟕ delta` (`$derived` in the store).
Rationale: keeps local storage tiny, and lets us **ship catalog updates** (new ships,
patched SCU) that flow through to everyone while preserving their personal additions and
owned flags. **"Clear data & load defaults"** just drops the delta.

`localStorage` keys (all under the `cargo:webapp:` namespace):
- `cargo:webapp:run` — the RunState
- `cargo:webapp:delta` — the CatalogDelta
- `cargo:webapp:theme` — `'light'|'dark'`
- `cargo:webapp:tabDir` — `'down'|'right'`
- `cargo:webapp:fleetCollapsed` — `'1'|'0'`

---

## 4. `src/lib/` — framework-agnostic logic

These modules are **pure TypeScript** (no Svelte) and contain the algorithmic heart.
They're independently testable. **Keep them framework-free** — UI lives in components.

| File | Responsibility | Key exports / notes |
|---|---|---|
| `types.ts` | All shared interfaces | `Item`, `Trip`, `RunState`, `Category`, `CatalogDelta`, `ShipGrid`, `emptyDelta()`. **Single place to change the data model.** |
| `csv.ts` | Quote-aware CSV parse/serialize | `parseCSV`, `toCSV`. Handles escaped quotes, CRLF, BOM. Verbatim port from the single-file app — *don't rewrite casually.* |
| `crate.ts` | **The crate-packing algorithm** + aggregation | `breakdown(scu, sizes)` greedy largest-first; `aggregate(entries)`; `flatEntries`; `fitTarget`; `maxCrateSize`; `groupEntries`; `ALL_SIZES=[32,24,16,8,4,2,1]`. |
| `mission.ts` | Mission colors | `MISSION_COLORS` (10 matte hues), `missionColor(n)`, `missionFg(hex)` (auto dark/cream contrast via luminance). |
| `missions.ts` | Per-mission rollup | `missionRollups(sections, order)` — buckets items by mission #, honours display order, keeps **blank** missions visible. |
| `catalog.ts` | Catalog accessors + grid + fit | `nameKey/scuKeyOf/ownedKeyOf`, `materializeShips/materializeSimple`, `shipGridOf`, **`shipFit(row, loadScu, loadMaxSize)`** (the grid-aware fit used everywhere), `FILES`, `DEFAULT_HEADERS`, `SHIP_GRID_COLS`. |
| `match.ts` | **OCR→catalog fuzzy matcher** | `matchName(query, names, threshold)`. Token + code-aware (see §9). |
| `parseMission.ts` | **OCR text → structured legs** | `parseMission(objText, detailsText)`, `deconflict(missions[])`. Grammar + rules in §9. |
| `ocr.ts` | Tesseract wrapper | `ocrMulti(file, passes, onProgress)`, `ocrPass`, image preprocessing. Lazy dynamic-import; local assets. |
| `format.ts` | Presentation helpers | `pillList`, `datalistNames`, `summaryText` (Copy Summary). |
| `storage.ts` | localStorage run+delta | `loadRun/saveRun`, `loadDelta/saveDelta`, `clearAll`, `storageOk` probe. |
| `theme.svelte.ts` | Light/dark theme (rune store) | `theme.value`, `theme.toggle()`. Sets `<html data-theme>` + `color-scheme`. |
| `prefs.svelte.ts` | Tab direction (rune store) | `prefs.tabDir`, `prefs.toggleTabDir()`. |

> `.svelte.ts` suffix = a file using Svelte 5 runes (`$state`) at module scope. Plain
> `.ts` = no reactivity. Don't add runes to a plain `.ts` file (won't compile/react).

---

## 5. Build & data pipeline

### `scripts/sync-data.mjs` (runs before every `dev`/`build` via npm scripts)
1. Copies `/data/*.csv` → `webapp/public/data/` (so Vite serves them statically). The app
   fetches them at runtime as the read-only baseline. **`public/data/` is gitignored** —
   it is a generated copy; never edit it, edit `/data/*.csv`.
2. Vendors the OCR runtime from `node_modules` → `webapp/public/ocr/`: the Tesseract
   worker (`worker.min.js`), the WASM core (`tesseract-core-*-lstm.wasm[.js]`), and copies
   the committed `vendor/tessdata/eng.traineddata.gz`. **`public/ocr/` is gitignored.**

### `scripts/fetch-tessdata.mjs` (run manually, rarely)
Downloads `eng.traineddata.gz` into `vendor/tessdata/` which **is committed**. This is why
the Docker build needs **no network** for OCR — the trained data is in the repo. Re-run
only to update the OCR language data (`npm run fetch-tessdata -- --force`).

### Docker (multi-stage)
- **Build context = repo root** (so `/data` is reachable). Dockerfile lives in `webapp/`.
- Stage 1 `node:22-alpine`: `npm ci` + `npm run build` → `dist/`.
- Stage 2 `nginxinc/nginx-unprivileged:alpine`: copies `dist/` + `nginx.conf`. Runs as
  **non-root** (user 1000), nginx **listens on 8080** (unprivileged can't bind 80).
- `docker-compose.yml` publishes **`8081:8080`** (host 8081 → container 8080) and sets
  `user: "1000:1000"`. App reachable at `http://localhost:8081`.
- **Ports invariant:** nginx.conf `listen` MUST equal Dockerfile `EXPOSE` MUST equal the
  container side of the compose mapping (all **8080**). If you change one, change all three.

---

## 6. `src/components/` — UI components

Svelte 5 runes throughout (`$props`, `$state`, `$derived`, `$effect`). Styling is **global**
in `app.css` (not `<style>` blocks) — components reference class names. This was a
deliberate choice for one-place theming.

| Component | Renders | Notes / intent |
|---|---|---|
| `App.svelte` | The shell: dark **sidebar** (brand, run summary, Fleet, footer w/ ?/theme/cog) + light **workspace** (Overview, Manifest, Routes) + all top-level modals (Help, Export, Ship grid, Mission import). | Owns global wiring: autosave `$effect`, datalists, download/export/import, theme/menu state. Mobile: sidebar becomes an off-canvas drawer (`☰`). |
| `Zone.svelte` | A titled workspace section with a solid colored header bar (accent), optional number, actions slot, collapsible. | The section "band". Accent set via `--accent`. |
| `Fleet.svelte` | The **sidebar** fleet: fit-mode toggle (Per-mission/Largest trip/Combined), owned ships (`fit-dot · name · SCU`), per-ship expand for capacity/grid/remove, add-ship row. Collapsible (persisted). | Uses `shipFit()`. "Best fit" = smallest hull that fits, starred. |
| `Overview.svelte` | Wraps the summary **stat tiles** + per-size chips + Copy Summary, then `<Missions/>`. | The merged "Overview" zone (Missions + Loadout Summary). |
| `Missions.svelte` | The **missions register** table: per-mission rollup (SCU, size cols, box, pick→drop, ship + grid-aware fit badge, reward), total footer. Drag-reorder, delete (confirm), + Add blank mission. | Mission # is the identity (1–10) and drives color. `missionOrder` is display order only. |
| `TripPanel.svelte` | One **trip**: name, subtotal, import button, crate-size toggles, the cargo **grid table** (`<colgroup>` fixed layout), the quick-fill reference rail, add-commodity. | Owns: column resize, row drag-reorder (pointer-based), and **directional Tab/Enter/Ctrl+Arrow** grid navigation (§8). |
| `ItemRow.svelte` | One cargo line `<tr>`: drag grip, mission #, commodity/SCU/from/to fields, per-size crate cells, crates count, done checkbox, delete. | **Entire row is the mission color** (full-row, not a tab) with auto-contrast `--rowfg`. |
| `Field.svelte` | Reusable text input + datalist autocomplete + novelty `+` (add to catalog). | `data-f`/`data-row` attrs enable grid keyboard nav. |
| `Routes.svelte` | The **Pick Up | Drop Off** two-column section, side by side. | Pick-up left (collect), drop-off right (deliver). |
| `GroupSection.svelte` | A grouped card list (by source or destination). Cards drag-reorder; bidirectional completion. | Pick-up check = `pickedUp` (visual). Drop-off check = `done` (real). A source auto-checks once all its cargo is delivered. |
| `Missions`/`Fleet` fit badge | Shared semantics via `shipFit()`. | ✓ fits · ≤N oversize (box too big) · −N short. |
| `ShipGridEditor.svelte` | Modal to edit a ship's cargo grid (max box + per-size counts) with live total-vs-nominal check. | Writes to catalog delta `shipGrids`. |
| `MissionImport.svelte` | The **Screenshot Import** flow (see §9): drop/paste/pick → crop → OCR (3 passes) → parse → match → review table + suggestions sidebar → append as a mission. | The most complex component. ~300 lines. |
| `Modal.svelte` | Generic centered modal (backdrop, Esc to close, `wide` variant). | |

---

## 7. The crate-packing algorithm (the flagship feature)

`crate.ts → breakdown(scu, sizesMap)`:

```
rem = floor(scu)
for size of ALL_SIZES filtered to enabled, descending:   // 32,24,16,8,4,2,1
    n = floor(rem / size); if n>0 { counts[size]=n; rem -= n*size }
return { counts, leftover: rem }
```

- **Greedy largest-first**, NOT optimal bin-packing. This intentionally matches how players
  actually pack (and the original spreadsheet). It will pick `32+16` over `24+24`. Do not
  "optimize" this without the user asking — it would change every number on the page.
- **Each commodity packs into its OWN crates** — two goods never share a box. So aggregation
  sums per-item breakdowns; it does not pack the combined SCU.
- `leftover > 0` only when the smallest enabled size can't finish (e.g. 1 SCU turned off
  with a remainder) → shown as a red `+Nu` marker and a summary warning.
- **Per-trip crate sizes:** each trip has its own enabled-size map (mission box limits like
  "16 SCU or smaller" → turn off 32/24). Aggregation respects each item's *own trip's* sizes.

`fitTarget(sections, fitMode)` returns the SCU the fleet should size for:
- `combined` = everything at once. `largest` = the single biggest trip. `mission` (Fleet
  computes this one itself) = the single biggest **mission**.

---

## 8. Manifest grid: keyboard nav, resize, drag (in `TripPanel.svelte`)

This is finicky; here are the exact rules so you don't regress them:

- **Tab direction** (persisted, `prefs.tabDir`): default **vertical** ("down"). Tab moves to
  the next row, same column; at the last row it **auto-adds a new commodity line**. There's
  a `Tab ↓/→` toggle in the Manifest zone header. Shift+Tab reverses. **Enter always moves
  down** regardless of the toggle.
- **Ctrl/Cmd + Arrow** = one-off directional move (any direction, no auto-add). We use
  **Ctrl** deliberately — Alt+Left/Right is the browser's history back/forward.
- Fields carry `data-f="commodity|scu|source|destination|mission"` and `data-row={item.id}`
  so the keydown handler can find the target cell. `NAV_COLS` is the ordered list.
- **Column resize:** only Commodity/From/To are resizable; widths are **shared across all
  trips** and persisted in `state.colW`. Pointer-based drag handle on the header. SCU/size
  columns are fixed-width by design.
- **Row drag-reorder:** pointer-based (works on touch), initiated from the `⠿` grip. Moves
  the item within its trip and **clears the column sort** (manual order wins).
- The table uses `table-layout:fixed` with a `<colgroup>`; column widths must stay in sync
  between the `<col>` definitions and the `tableW` sum. Don't switch to `auto` layout.

---

## 9. The OCR mission importer (most complex subsystem)

Flow (`MissionImport.svelte`): **drop/paste/pick → crop → OCR (×3) → parse → deconflict →
match → review (+ suggestions) → append as a mission.**

### Why client-side OCR
Privacy + offline self-host. Tesseract.js is **dynamically imported** (separate lazy chunk;
not in the main bundle) and points at **locally vendored** assets in `public/ocr` — no CDN,
the image never leaves the browser. This is non-negotiable; do not switch to a cloud OCR or
a server sidecar without explicit user sign-off (it breaks the privacy model).

### Crop step (`stage='crop'`)
Two-column contract screenshots confuse OCR (it reads left+right columns on the same line).
So the user boxes just the **Primary Objectives** column before OCR. The dim overlay is **four
exact shade rectangles** flush to the selection (an earlier CSS-mask approach didn't line up
with the handles — don't go back to it). Default box covers the right ~half. "Use whole
image" bypasses cropping for already-cropped shots.

### OCR passes (`ocr.ts → ocrMulti`)
Runs **3 preprocessing variants** (soft-contrast / hard-threshold / gamma), each upscaled +
grayscaled. Returns all texts sorted by confidence. Multi-pass exists to beat per-character
drift (a dropped digit in one pass gets outvoted).

### Parsing (`parseMission.ts`)
Grammar (the common hauling contract):
```
Deliver 0/<SCU> SCU of <Commodity> to <Destination>.
    Collect <Commodity> from <Source>.            (one or more)
```
Critical rules baked in (each fixes a real reported bug):
- **SCU is the number AFTER the slash** in `0/NN` (0 = amount delivered so far).
- **Source/destination are read from text** — Everus Harbor is sometimes the *destination*,
  not always the source. Never hardcode it.
- **Captures are bounded at the first period** (`[^.]+`), and segments split on sentence
  ends. Locations/commodities never contain `.`, so this stops **Details-column flavor text
  from bleeding** into fields (the "Everus Harbor. a few different spots. <$" bug).
- `cleanLoc()` strips trailing qualifiers (`in Lorville`, `on Hurston`, `above …`) and OCR
  divider junk (`| < > $`, dangling single letters).
- **Multi-source delivery** (one delivery, several "Collect from") → one row per source,
  **full SCU on the first, 0 on the rest** (the user's manual tracking trick).
- **Box limit** ("16 SCU or smaller", "4 SCU in size", "no larger than N") → `maxBox`, which
  auto-sets the trip's crate-size toggles.
- **Reward** anchors on the word "Reward" + the first number (the `¤` glyph is unreliable —
  Tesseract often reads it as `=`); falls back to `¤`/`aUEC` forms.

`deconflict(missions[])` aligns legs across the 3 passes and **votes per field** (majority;
ties → highest-confidence pass). SCU votes on the numeric value.

### Matching (`match.ts → matchName`)
Token + code-aware fuzzy match against catalog names:
- Token-overlap (Dice) + containment, so `"High Course Station"` matches
  `"HUR-L5 High Course Station"` and prefers the **tightest container** (the station, not
  `"Platinum Bay (HUR-L5 High Course Station)"`).
- **Code tokens** (`s1dc06`, `hur-l5`, `2ub-rb9-5`) get strong weight; **letter↔digit OCR
  confusions are normalized** (`S↔5, O↔0, I/L↔1, B↔8…`) so `ARC-LS` → `ARC-L5`.
- **Deliberately NOT edit-distance on codes.** `ARC-L4` and `ARC-L5` are *different stations*;
  a near-miss must flag **novel** (for review) rather than silently merge to the wrong place.
  This is a safety property — do not "improve" it into fuzzy numeric matching.
- Below threshold → `{novel:true}`, surfaced for one-click add-to-catalog.

### Review UI
Wide modal. Editable rows (full names, no truncation), `+ Add row`, per-row delete. A
**suggestions sidebar** lists each distinct unresolved commodity/location once; editing +
"Add & apply" adds it to the catalog **and renames every matching row at once** (update-one-
update-all). Raw OCR text is viewable for debugging. Confirm appends all rows as **one new
mission #** on the current trip (via `run.addImportedLegs`).

---

## 10. Missions model (subtle — read before touching)

A "mission" is identified by its **number 1–10**. That number:
- drives the **color** (`MISSION_COLORS[(n-1)%10]`), shared everywhere,
- is stored on each `Item.mission`,
- keys the metadata maps: `missionShips`, `missionNames`, `missionRewards`.

`missionOrder` is a **display order only** (array of mission #s) — reordering missions does
**not** renumber them (so colors stay stable and the manifest doesn't recolor). Blank
missions (in `missionOrder` with no items) stay visible so you can build them up.
`run.deleteMission(n)` removes the mission's manifest **items** + all its metadata.
`run.addMission()` picks the lowest free 1–10. Max 10 missions (SC's board limit).

---

## 11. Persistence, migration, autosave

- **Autosave:** an `$effect` in `App.svelte` snapshots `run.state` and debounces a save
  (350ms). The catalog delta saves immediately on each mutation in its store.
- **Migration:** `run.svelte.ts → migrate(saved)` is the forward/back-compat shim. **Every
  time you add a field to `RunState`, default it in `migrate()`** or old saves break. It also
  accepts the legacy single-list shape. `storage.ts → normalizeDelta` does the same for the
  delta (and bumped `v:1→v:2` when `shipGrids` was added).
- **ids:** items/trips use `id` like `id7`; `nid()` is a monotonic generator; `reId()`
  reconciles the counter after loading saved ids. Don't reference items by array index for
  persistence — use `id`.

---

## 12. Design language (so restyles stay consistent)

The user iterated hard on this and **explicitly rejected the dark sci-fi look** in favor of
an **industrial "dispatch desk"** aesthetic. Honor it:

- **Dark operations sidebar** (charcoal) + **light "manila/paper" workspace**. Dark mode
  flips the whole page to charcoal via `[data-theme]` tokens.
- **Solid, matte section header fills** (not transparency overlays). Square corners. **No
  glows, no gradients, no angular `clip-path` panels** (all removed — don't reintroduce).
- **Full-row mission color** on the Manifest and Missions tables (every column), with
  auto-contrast text. NOT a left "tab" bar. (Pick-up/Drop-off cards keep a left accent bar —
  that's the one approved exception.)
- **No sentences on the page.** Hints go in the `?` Help modal and `(i)` info popovers.
  Short mono/uppercase labels only.
- **Completed items** = greenish-grey wash + strikethrough (not just opacity fade).
- All theming is **CSS custom properties** in `app.css` `:root` (+ `[data-theme="dark"]`).
  Accents: `--cyan/green/amber/red/violet/orange/steel`; section fills `--c-overview/
  manifest/pickup/dropoff`; surfaces `--paper/paper2/card/card2`, `--ink*`, `--rule*`.
  **Add new colors as tokens**, don't hardcode hex in components.
- Fonts: Chakra Petch (display), Saira (body), Share Tech Mono (mono) — Google Fonts with
  system fallbacks (the only external request; CSP allows it).

---

## 13. Gotchas (things that WILL bite you)

1. **`public/data` and `public/ocr` are generated & gitignored.** If they're missing, run
   `npm run sync-data` (or any `dev`/`build`). Don't commit them. Don't edit them.
2. **Edit `/data/*.csv` (repo root), never `webapp/public/data`.** The latter is a copy.
3. **`vendor/tessdata/eng.traineddata.gz` is committed** and required for offline OCR. If you
   "clean" it out, the Docker build still works but OCR fails at runtime with no network.
4. **Docker ports must agree** (nginx `listen` = Dockerfile `EXPOSE` = compose container
   port = 8080; published host port = 8081). The unprivileged nginx **cannot** bind 80.
5. **Owned ships are catalog-delta, not run.** Export Run (JSON) intentionally omits the
   fleet. Don't move owned-state into RunState.
6. **Run references catalog by name string**, not id. Renaming a catalog entry does not
   retro-update existing run rows (except the importer's explicit rename-all).
7. **Add a `RunState` field → default it in `migrate()`.** Same for `CatalogDelta` →
   `normalizeDelta`. Otherwise old localStorage payloads break on load.
8. **Don't reintroduce edit-distance on OCR code tokens** (ARC-L4 vs L5 safety, §9).
9. **Don't switch OCR to cloud/server** — privacy model. Don't switch the crate algorithm to
   optimal bin-packing — it changes every number. Don't make `.field` a flexbox (datalist
   inputs size-to-content; keep `display:block` + `width:100%`).
10. **`table-layout:fixed`** on the manifest grid is load-bearing for the resizable shared
    columns. Keep `tableW` in sync with the `<col>` widths.
11. **svelte-check must stay 0/0.** A11y warnings are real; either fix or `<!-- svelte-ignore
    rule -->` with a reason. The repo has been kept clean.
12. **`.svelte.ts` vs `.ts`** — runes only work in `.svelte`/`.svelte.ts`.

---

## 14. Invariants (must remain true)

- No network call sends user data anywhere. Only outbound request is Google Fonts (CSS).
- OCR runs entirely in-browser against local `public/ocr` assets.
- The single-file app (`/cargo-manager.html`) and the webapp share **only** `/data/*.csv`.
- `npm run check` (svelte-check) → 0 errors, 0 warnings. `npm run build` succeeds.
- Catalog source of truth is `/data/*.csv`; the webapp never persists catalog *baseline*
  anywhere but reads it fresh each load.
- Mission #s are 1–10; color = `MISSION_COLORS[(n-1)%10]`.

---

## 15. How to make common changes safely

- **Add a column to the manifest grid:** update `TripPanel.svelte` (`<colgroup>`, `<thead>`,
  `tableW`, `FX`), `ItemRow.svelte`, and `NAV_COLS`/`data-f` if it's keyboard-navigable.
- **Add a catalog field:** the CSV columns already load into `Category.rows`. Surface via
  `catalogRow`/accessors. For ships, add to `SHIP_GRID_COLS`/headers if structural.
- **Add a `RunState` field:** add to `defaultState()` **and** `migrate()`; persistence is
  automatic via the autosave effect.
- **Add a new section/zone:** wrap in `<Zone accent="var(--c-…)" title="…">`; add a color
  token in `app.css`.
- **Tune OCR:** preprocessing knobs are in `ocr.ts` (`preprocess`); parser rules in
  `parseMission.ts`; matcher in `match.ts`. Add real screenshots as test cases first.
- **Restyle:** edit tokens in `app.css` `:root`; respect §12. Verify both light AND dark.

---

## 16. Known limitations / not-yet-done

- OCR is tuned to the **hauling-contract** layout. Other mission types need parser additions
  (add when example screenshots are available).
- OCR accuracy on the stylized SC font is good-not-perfect; the review step + catalog match
  are the safety net. Cryptic outpost codes are the error-prone case.
- No multi-cell spreadsheet paste in the manifest (single-cell + reference rail + tab-nav
  instead — a deliberate scope call).
- No automated tests in CI (verification is `svelte-check` + manual/headless Playwright runs
  during development). A test harness would be a reasonable future add.
- Touch drag/resize works but benefits from real-device testing.
- The single-file app is **not** kept at feature parity with the webapp anymore; it predates
  missions/grids/OCR. `PARITY.md` tracks the divergence.

---

## 17. Pointers

- **Feature changelog & decisions:** `webapp/PARITY.md` (vX.Y entries, most recent first).
- **Run/deploy:** `webapp/README.md`.
- **Single-file app:** `/README.md`, `/ARCHITECTURE.md` (root).
- **This file:** keep it current. It is the project's memory.
