# Webapp — Feature Parity & Decision Log

Tracks the Docker-hosted **webapp** rewrite (Svelte 5 + Vite + TS) against the original
single-file self-host app (`../cargo-manager.html`, documented in `../README.md` and
`../ARCHITECTURE.md`). When a behaviour is unclear, the single-file app is the reference.

**Legend:** ✅ done · 🟡 in progress · ⛔ intentionally dropped (with reason) · 🔵 changed by design · ⬜ not started

---

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
- ⬜ Run state reactive store + debounced autosave
- ⬜ Catalog reactive store (materialized views, mutations write delta)
- ⬜ Migration of legacy run shape (single-list `{items,sizes}` → sections) on Import

### Planner UI (Trips)
- ⬜ Trips: add / rename / remove (keep ≥1), live subtotal
- ⬜ Per-trip crate-size toggles (32…1)
- ⬜ Item rows: mission #, commodity, SCU, from, to, per-size cells, crates, done, delete
- ⬜ Per-row mission colouring + auto text contrast
- ⬜ Datalist autocomplete (commodity/location/ship) + novelty "+" to add to catalog
- ⬜ Column sort (M/Commodity/SCU/From/To)
- 🟡 Column resize (Commodity/From/To, shared width) — *candidate for phase 2; tracked below*
- 🟡 Drag-to-reorder rows — *phase 2; will use Pointer Events (touch-capable), unlike original HTML5 DnD*

### Read-outs
- ⬜ Loadout Summary (totals, per-size chips, leftover warning)
- ⬜ What To Drop Off / Pick Up — grouped cards, collapsible
- ⬜ Bidirectional completion (item ↔ card)
- ⬜ Ship Fit Check (owned ships, best-fit pin, largest-trip/combined toggle, sort, add/edit/remove)
- ⬜ Copy Summary Text

### Top bar / data controls
- ⬜ Run name, Export Run / Import Run (JSON)
- 🔵 **Clear** → "Clear my data & load defaults" (wipes run + delta, reloads baseline) — *expanded per request*
- ⬜ Export CSVs (download materialized catalog)
- ⛔ **Connect data folder** (File System Access write-back) — meaningless on a shared host; baseline is read-only and edits live client-side
- 🔵 **Load CSVs…** — *TBD: keep as an optional client-side import into the delta, or drop. Default: keep, importing as added entries.*
- ⬜ Data-source / privacy status line ("your data stays in your browser")

### Packaging
- ⬜ Dockerfile (multi-stage → nginx), nginx.conf (gzip, cache, security headers, SPA fallback)
- ⬜ docker-compose.yml (one-command self-host)
- ⬜ webapp/README.md (run instructions)

---

## Intentional deviations from the single-file app
1. **No folder write-back.** Hosted catalog is read-only; customisations persist as a local delta. (Self-host single-file app still has full File System Access.)
2. **Clear expands to "clear + load defaults"** per request.
3. **Touch-friendly drag/resize** planned via Pointer Events (the original uses HTML5 DnD, which doesn't work on mobile).
4. **Baseline updates are non-destructive**: shipping new SCU values updates everyone's defaults while keeping their owned/custom delta.

## Open questions / TBD
- Keep or drop **Load CSVs…** import in hosted mode? (leaning keep → merges into delta as added entries)
- Phase-2 status of column-resize and drag-reorder vs. shipping core parity first.
