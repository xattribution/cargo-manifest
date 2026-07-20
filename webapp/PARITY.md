# Webapp — Feature Parity & Decision Log

Dated changelog + decision log for the Docker-hosted **webapp** (Svelte 5 + Vite + TS).
For *how the app is built and why* (the full architecture/autopsy), see
[`ARCHITECTURE.md`](./ARCHITECTURE.md) — read that first before editing. This file is the
chronological record of what changed and the reasoning behind each call.

**Legend:** ✅ done · 🟡 in progress · ⛔ intentionally dropped (with reason) · 🔵 changed by design · ⬜ not started

---

## v0.21 — OCR importer accuracy pass (driven by real contract screenshots)

Reviewed against five real "Senior Rank — Medium Cargo Haul" Covalex screenshots; all are
transcribed into a new regression suite (see below) and an end-to-end harness runs the real
Tesseract pipeline on a synthetic render of the same layout.

**Catalog data (the biggest accuracy win):**
- The Stanton **Lagrange stations were catalogued as bare codes** (`CRU-L4`, `HUR-L5`, …)
  while contracts use full names ("CRU-L4 Shallow Fields Station"). Worse, full names only
  existed inside store rows, so "Collect from CRU-L1 Ambitious Dream Station" matched
  **"Live Fire Weapons (CRU-L1 Ambitious Dream Station)"** — a gun shop — and Lagrange
  names without a code ("Beautiful Glen Station") matched nothing. All 18 Stanton Lagrange
  rows now carry their full in-game names (same convention the store rows already used);
  `Seraphim` → `Seraphim Station` (+ System/Planet filled). Removed a committed OCR-typo
  duplicate (`ARC-LS Yellow Core Station`) and the `INS-Jericho`/`INS Jericho` dupe.

**Matcher (`match.ts`):**
- Scores are **no longer clamped to 1.0 before comparison** — a padded sub-location
  ("Refinery deck store (X Station)") could previously saturate and tie the station itself,
  leaving the winner to alphabetical accident.
- **Possessive fragments dropped**: "Crusader's" tokenized into a stray `s` that polluted
  the Dice overlap; single-character tokens are now filtered.
- **Code-mismatch penalty softened when words carry the match**: "CRU-LA Shallow Fields
  Station" (OCR-garbled 4→A) now resolves to CRU-L4 because ≥2 distinctive non-code tokens
  match exactly. Bare garbled codes with no supporting words (ARC-LS alone vs ARC-L4/L5)
  still flag novel — the safety property is unchanged.

**Parser (`parseMission.ts`):**
- `Deliver O/62` (zero read as the letter O) and `0/14I` (letter confusions inside the SCU
  number) now parse — captured **number** tokens run through a letter→digit fixer
  (O→0, I/l→1, S→5, B→8, Z→2); never applied to names. Reward numbers get the same
  treatment (previously `3l8,250` silently parsed as 8,250).
- **Bullet-glyph junk stripped** from captured fields (`◇` commonly OCRs as `©`/`®`/`•`;
  it rode into a source name whenever a trailing period was dropped).
- **`deconflict` no longer lets a short pass shift the vote**: only passes with the same
  leg count as the anchor vote per-field (a pass that dropped a middle leg had every later
  leg misaligned, and two such passes could outvote the one complete pass). `reward`/
  `maxBox` now vote by majority instead of first-non-null (a bad first pass with a dropped
  digit used to win).
- **Default crop is now full-height** (`y:0–1`, right 55%): the Reward readout sits in the
  top-right header, which the old `y:0.06` start could clip — reward now auto-fills with
  the default box.
- `vite.config.ts`: `optimizeDeps` **include** (was exclude) `tesseract.js` — the CJS
  module must be pre-bundled in dev or the dynamic import throws `require is not defined`
  (production build was always fine; worker/core stay vendored in `public/ocr`).

**Tests (new, first in the repo):**
- `npm run test:parser` — `test/parser-tests.mjs`, 35 assertions: the five transcribed
  screenshots (legs/SCU/sources/destinations/reward/box limits), OCR-noise variants, the
  deconflict alignment + majority cases, and matcher resolution of every location/commodity
  in the shots against the real CSVs. Plain Node (`--experimental-strip-types`), no deps.
- `test/ocr-harness.html` + `test/ocr-e2e.mjs` — dev-only end-to-end: renders a synthetic
  two-column contract (SC-style layout), applies the default crop, runs the real 3-pass
  Tesseract → parse → deconflict → match pipeline headless. Verified passing.

---

## v0.20 — review pass: de-pill restyle, delivery progress, ¤/SCU, undo, import fix

**Restyle (user direction: no pills / no same-color blobs):**
- **Chip rows are gone.** Crate breakdowns everywhere are now a single ledger-style mono
  line (`2×32 · 1×16`): Overview strip (`sizeLine()` replaces the per-size chips),
  Pick Up / Drop Off cards (`.gsizes` replaces `.gpills`/`.pill`, and now includes the
  crate count), quick-fill rail entries are a plain ruled list (no boxed chips), the
  fleet count and importer suggestion count are plain text, the drop-off optimizer note
  is a green left-bar line (no filled box), and the `◎ pct% route` header readout lost
  its background bubble. The mission color marker on card lines is a strict 16px square
  color-code cell. `format.ts` lost `pillList`/`pillClass`, gained `sizeLine`.
- **Overview stats merged into one ruled ledger strip** (stats divided by hairlines inside
  a single bordered container) instead of separate floating tiles.
- **Section palette de-blobbed**: Pick Up was a second near-identical blue; it is now
  violet (`--c-pickup` light `#5d5180` / dark `#4c4169`) so the four zones read
  blue / olive / violet / rust at a glance.
- Fit badges use the mono font, uppercase. Dead placeholder CSS selector removed.

**New functionality:**
- **Delivery progress**: sidebar gets a delivered/total SCU meter (appears once anything
  is checked off); Overview gets a green **Delivered** stat; the Missions table gets a
  **Done** column (delivered SCU, ✓ when complete; footer totals it); Copy Summary
  includes a `Delivered: X/Y SCU` line. New `crate.ts → deliveredScu()`,
  `missionRollups` gains `doneScu`.
- **¤/SCU value density**: the Missions footer shows the average reward-per-SCU next to
  the total; each reward input's tooltip shows that mission's rate.
- **One-level undo** for destructive ops: deleting a mission, clearing all missions, and
  removing a non-empty trip snapshot the run first and raise a bottom toast
  ("Mission 3 deleted — Undo", auto-dismisses after 10s). Transient, not persisted.
  `run.undoInfo` / `undoRestore()` / `dismissUndo()`.

**Fixes:**
- **Importer mission numbering is now global**: `addImportedLegs` previously only
  considered mission #s used on the target trip, so importing could silently reuse a
  number active on another trip and merge colors/reward/metadata. It now picks the
  lowest number free across every trip + `missionOrder`.
- Undefined CSS tokens fixed (`--txt-faint` → `--ink-faint`, `--amber-soft` → `--amber`);
  undefined `btn warn` → `btn danger` (ship grid editor).
- Missions empty-state `colspan` corrected (was one column short).
- Mission-# input now reflects the 1–10 clamp immediately (typing "15" shows 10).
- Quick-fill clipboard write no longer leaves an unhandled promise rejection.
- `+ Add Trip` picks the first unused letter (removals no longer cause duplicate names).

---

## v0.19 — collapsible sidebar + mission delete UX

- **Desktop sidebar collapse**: `«` in the sidebar brand tucks it away (workspace goes
  full-width); a floating `»` button restores it. Persisted (`prefs.sidebarCollapsed`,
  `cargo:webapp:sidebarCollapsed`). Independent of the existing mobile off-canvas drawer
  (the ≤900px media query neutralizes the desktop collapse so they don't fight).
- **Mission delete dialog** replaces the native `confirm()` so it can offer **"Don't remind
  me again"** (persisted as `prefs.skipMissionDeleteWarn`). Once set, single + clear-all
  deletes skip the prompt. Deleting an empty mission never prompts.
- **Clear all missions**: new `run.clearMissions()` + a red **⌫ Clear all** button in the
  Missions toolbar (wipes every cargo line and all mission metadata, keeps empty trips),
  routed through the same confirm dialog.

---

## v0.18 — partial-completion route optimizer (Drop Off)

- New `lib/optimize.ts → optimizeDropoff(destStats, pct)`. When the Missions "Submit %" slider
  is < 100, the **Drop Off** column optimizes the route: deliver ≥ pct% of the total load in the
  **fewest stops**, preferring the single destination covering the **most missions** then the
  **least cargo** (least overkill). Drop-off cards: **★ best** (green outline) + recommended on
  the route, qualifying destinations normal, and destinations that can't reach the target alone
  are **greyed out**. Header shows `◎ pct% route · target N SCU`.
- **Box-honest delivery:** each recommended card shows a `deliver N SCU (a×s …)` line —
  `minCrateSubset(totals, target)` finds the smallest WHOLE-crate subset (using only the box
  sizes already in the manifest; no repackaging) that reaches the target. Exact 0/1 bounded
  subset-sum DP for normal loads; greedy largest-first fallback for very large ones.
- If no single stop reaches the target, recommends the minimal largest-first multi-stop combo
  (last stop trimmed to just the remaining need).
- Verified against the canonical example (Everus 35 / Tressler 20 / Baijini 20 / Seraphim 25 at
  25% → ★ Seraphim, deliver 25; Tressler/Baijini greyed) and the most-missions tiebreak.

---

## v0.17 — partial-completion planner + import button moved

- **Partial-completion planner** in the Missions area: a **Submit %** slider (5–100, step 5;
  persisted as `RunState.completionPct`, default 100). Below 100% the table shows a per-mission
  **"Submit N%" target SCU** column (`ceil(missionSCU × pct/100)` — rounds up so you clear the
  threshold), and the footer + a note show the total target SCU and the **prorated reward**
  (`round(totalReward × pct/100)`). Purpose: rep grinding — submit a fraction of a high-tier
  haul for proportional reward when that's the better time trade. At 100% the column/note hide
  (clean no-op). Per-mission reward inputs still hold the full-completion payout from the
  contract; only the displayed total prorates.
- **Moved the "Import mission screenshot" button** out of each trip header into the Missions
  toolbar (it imports into the first/primary trip). Reads better there.

---

## v0.16 — mission management + small UX

- Default run name is now **"Cargo Haul"** (was "Untitled Run").
- Reference rail shows a subtle **"click to copy / fill"** hint.
- Trip import button relabeled **"Import mission screenshot"**.
- **Mission management** in the Missions panel: drag ⠿ to **reorder** (persisted in
  `missionOrder`, mission numbers/colours stay stable), **✕ delete** (confirms, then removes
  the mission's manifest lines + its ship/name/reward), and **+ Add mission** for a blank
  mission slot (lowest free 1–10) you can build up later. `missionRollups()` now honours the
  order and keeps blank missions visible.
- Built on the updated baseline dataset (168 commodities / 764 locations / 256 ships).

## v0.15 — Screenshot Import: wider UI, crop fix, suggestions sidebar

- Renamed to **Screenshot Import**; modal widened (`Modal wide`) so location/commodity names
  aren't truncated and tall missions don't need scrolling.
- **Crop alignment fixed**: replaced the CSS-mask dim (which didn't line up with the handles)
  with four exact shade rectangles flush to the selection.
- **Example & instructions** expander at the top with a labeled diagram of what to capture.
- **+ Add row** and per-row delete in the review table (for missions OCR splits oddly).
- **Suggestions sidebar** ("Not in your catalog"): lists each distinct unresolved
  commodity/location once; edit the name (or keep it) and **Add & apply** adds it to the
  catalog *and renames every matching row at once* — "update one, update them all". Plus
  **Add & apply all**.

## v0.14 — OCR importer: fix Details bleed, add crop step

- **Fixed flavor-text bleed** (e.g. "Everus Harbor. a few different spots. <$"): the parser now
  bounds commodity/location capture at the first period, splits segments on sentence ends, and
  cleanLoc strips trailing qualifiers ("in Lorville", "on Hurston", "above …") plus OCR
  column-divider junk (`| < > $` and dangling single letters). Locations/commodities never
  contain a period, so cross-column text can no longer contaminate a field.
- **Added a crop step** to the importer: after choosing an image, a draggable selection box
  (defaulting over the right-hand Primary Objectives column) lets you isolate the objectives
  before OCR — the real fix for two-column screenshots where OCR interleaves columns. "Use
  whole image" available for already-cropped shots. Crop happens in-canvas; image still never
  leaves the browser.
- Verified end-to-end: a two-column render with the default crop yields clean legs
  (Teasa Spaceport / HDPC-Cassillo / HDPC-Farnesway, correct SCU, source Everus Harbor).

## v0.13 — per-mission rewards + OCR accuracy (multi-pass, code matching)

- **Per-mission reward (aUEC)**: new optional `missionRewards` on the run; a Reward column
  (¤) in the Missions table + a Total footer row (total SCU and total ¤). The importer
  auto-fills it (anchors on the word "Reward" + first number, since Tesseract often misreads
  the ¤ glyph as "=").
- **Multi-pass OCR**: the importer now runs 3 preprocessing variants (soft-contrast / hard-
  threshold / gamma) and `deconflict()` votes per field — fixes per-character drift like a
  dropped digit (81→8). Adds a **↻ Re-run** button and a **raw OCR text** expander; review
  modal shows total SCU.
- **OCR-tolerant code matching**: `match.ts` normalizes letter↔digit confusions in code tokens
  (S↔5, O↔0, I/L↔1, B↔8…) so "ARC-LS" resolves to "ARC-L5". Deliberately does NOT use
  edit-distance on codes, so genuinely different stations (ARC-L4 ≠ ARC-L5) stay distinct and a
  garbled code flags novel for review instead of mis-merging.
- SCU is read as the number after the slash in "Deliver 0/NN" (tolerant of slash OCR noise).

## v0.12 — OCR mission importer (screenshot → rows)

- **Import a mission from a screenshot** (⎙ Import on each trip): paste/drop/pick an image of
  the SC Primary Objectives panel → OCR → parse → catalog-match → review modal → append as one
  mission. Fully **client-side & offline**: Tesseract.js is dynamic-imported (separate lazy
  chunk) and runs against locally-vendored assets in `public/ocr` (worker + WASM core +
  `eng.traineddata.gz`); the image never leaves the browser. Verified offline by blocking all
  non-localhost network in a headless run.
- **Parser** (`lib/parseMission.ts`): reads `Deliver 0/<scu> SCU of <commodity> to <dest>` +
  `Collect <commodity> from <source>`; source/dest are read from text (Everus is sometimes the
  destination, not hardcoded). Multi-source delivery → one row per source, full SCU on the
  first and 0 on the rest (the manual tracking trick). Detects box limit ("16 SCU or smaller",
  "4 SCU in size", "no larger than N") → auto-sets the trip's crate sizes. Robust to OCR line
  wraps and missing periods (splits on Deliver/Collect keywords).
- **Matcher** (`lib/match.ts`): token/code-aware — handles abbreviated catalog names
  (`S1DC06` ⇆ "Covalex Distribution Center S1DC06"), full-name vs. station-only, prefers the
  tightest container (station over a shop inside it), weights alphanumeric code tokens
  (`HUR-L3`, `2UB-RB9-5`). Low-confidence/unknown → flagged novel with one-click add-to-catalog
  in the review step.
- Assets: `tesseract.js` dep; `scripts/fetch-tessdata.mjs` commits `vendor/tessdata/eng.traineddata.gz`
  (tracked, so Docker builds need no network); `sync-data` vendors the runtime into `public/ocr`.

## v0.11 — full-row mission color + quick-fill rail fix

- **Mission color now fills the entire row** (all columns) on both the Manifest trip tables and
  the Missions register — replacing the left color-bar/"tab". Text auto-contrasts (`missionFg`)
  so it's readable on every hue; size cells, inputs, grip, +, delete, and checkbox all adopt
  the row's contrast color. Completed rows still get the greenish-grey done-wash on top.
- **Quick-fill rail repositioned**: it was being flung to the far right and squeezed by a flex
  rule; now a properly-sized (196px) steel-topped panel sitting directly beside the grid.
- Design guidance audit: remaining accents are intentional — Pick Up/Drop Off cards keep their
  left bar (approved), and thin top-stripes on neutral info panels (stat tiles, ref rail, modal)
  are trim, not category color-coding.

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

## Core design choices (early)
1. **No folder write-back.** Hosted catalog baseline is read-only; user customisations persist as a local delta.
2. **Clear = "clear + load defaults".**
3. **Touch-friendly drag/resize** via Pointer Events (works on mobile).
4. **Baseline updates are non-destructive**: shipping new SCU values updates everyone's defaults while keeping their owned/custom delta.

> Historical note: early entries below compare against the original single-file
> `cargo-manager.html`, which is now deprecated/removed (archived in a fork). The webapp is
> the only maintained app; references to "the single-file app / the original" are history.

## Phase 2 — done (v0.4)
- ✅ **Column resize** drag handles (pointer-based, shared width in `state.colW`).
- ✅ **Touch** drag-reorder via Pointer Events (replaced HTML5 DnD).
- Still optional/ideas: per-trip collapse; a first-run tip; keyboard column resize.

## Resolved decisions
- **Load CSVs… dropped** in hosted mode (baseline is server-provided; per-user additions use the inline "+"). Import Run (JSON) covers moving a plan between devices.
