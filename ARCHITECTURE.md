# Cargo Manifest — Technical Architecture

A reference for developers (human or LLM) who need to read, modify, or extend the tool. It documents the data model, runtime architecture, rendering pipeline, persistence, and the non-obvious constraints baked into the design.

> **Audience note:** the entire application is one self-contained `cargo-manager.html` (~1700 lines): inline `<style>`, inline reference-data, and one inline `<script>`. No build step, no framework, no npm dependencies, no bundler. Plain DOM APIs + vanilla JS. The only external resource is Google Fonts (with system-font fallbacks). This is deliberate so the file runs by double-clicking, can be hosted statically, and is trivially diff-able.

---

## 1. Repository / artifact layout

```
cargo-manager.html      # the whole app
data/
├── ships.csv           # Name, SCU, Owned
├── commodities.csv     # Name, Type
└── locations.csv       # Name, Type, System, Planet, Moon, Place
README.md               # user guide
ARCHITECTURE.md         # this file
```

### Packaging / "build" pipeline

The shipped `cargo-manager.html` **embeds a copy of all three CSVs** inside hidden script blocks:

```html
<script type="text/plain" id="seed-ships">…full ships.csv text…</script>
<script type="text/plain" id="seed-commodities">…</script>
<script type="text/plain" id="seed-locations">…</script>
```

During development these were `__SEED_SHIPS__` / `__SEED_COMMODITIES__` / `__SEED_LOCATIONS__` placeholders, and a small Python step substituted the real CSV file contents in (and ensured `ships.csv` has an `Owned` column). If you regenerate the file from a template, that's the only "build": string-replace the three placeholders with raw CSV text. The text lives in `type="text/plain"` blocks so commas/quotes/newlines need no escaping — the only forbidden substring is `</script>` (CSV never contains it).

**Editing the app by hand needs no build at all** — just edit the HTML. The embedded seeds are only fallback data; see the loading precedence in §5.

---

## 2. Source structure inside the `<script>`

Top-to-bottom the script is grouped into labeled blocks:

1. **CSV parse / serialize** — `parseCSV`, `toCSV`
2. **Reference catalogs** — `REF`, `FILES`, `DEFAULT_HEADERS`, key accessors (`nameKey`, `scuKey`, `ownedKey`), `setCategory`, `addEntry`, `namesFor`, `refreshDatalists`, `ensureOwnedColumn`, `isOwned`, `inCatalog`, `isNovel`, `catalogRow`, `shipCatalogCap`
3. **Data loading** — `loadSeeds`, `tryFetchFolder`, `connectFolder`, `loadManualFiles`, `detectCategory`, `commitCatalog`, `writeFolder`, `exportCsvs`, `downloadText`, `flash`, `updateDataStatus`, `saveCatalog`, `loadCatalogCache`
4. **Run state + crate math** — `ALL_SIZES`, `MISSION_COLORS`, `missionColor`/`missionFg`, `state`, `enabledDesc`, `breakdown`, `crateCount`, `eachItem`, `flatEntries`, `aggregate`, `runTotal`, `missionScus`, `fitTarget`
5. **Persistence** — `Store`, `STORE_KEY`, `saveState`, `loadState`, `migrateInto`, `applyPendingOwn`, `reId`, `touch`
6. **Rendering** — sections/rows, summary, groups, fleet (see §6)
7. **Controls wiring** — top-bar buttons, add-trip, sort, collapse, fit-mode
8. **Boot** — the `(async function init(){…})()` IIFE at the very end

---

## 3. Data model

### Run state (`state`) — the user's plan

```js
state = {
  name: 'Untitled Run',
  fitMode: 'largest' | 'combined',   // ship-fit sizing mode
  dropOpen: true,                    // "What Drops Where" expanded?
  pickOpen: true,                    // "What To Pick Up Where" expanded?
  colW: { commodity: 300, source: 200, destination: 200 }, // shared, resizable column widths (px)
  sections: [                        // "Trips" in the UI
    {
      id: 'id7',                     // unique, format /^id\d+$/
      name: 'Going',
      sizes: {32:true,24:true,16:true,8:true,4:true,2:true,1:true}, // enabled crate sizes
      sort: { key:'destination', dir:'asc' } | null,  // active column sort (null = manual order)
      items: [
        {
          id: 'id9',
          commodity: 'Pressurized Ice',
          scu: '3',                  // kept as string from the input; coerced via Number()
          source: 'Port Tressler',
          destination: 'Greycat Stanton IV',
          mission: 1,                // 1–10, drives row color
          done: false               // completion; single source of truth (see §6.4)
        }
      ]
    }
  ]
}
```

- A **Trip** = one physical haul / one ship load. It owns its crate-size limit (`sizes`) and its row order.
- An **item** = one commodity leg (commodity + amount + from + to), tagged with a mission number and a done flag.
- `state` is the *only* thing serialized for "the run." Ships/owned-status live in the catalog (`REF.ships`), not in `state`.

### Reference catalogs (`REF`) — the editable lookup data

```js
REF = {
  ships:       { header:['Name','SCU','Owned'], rows:[{Name,SCU,Owned}, …], names:Set<lowercased Name> },
  commodities: { header:['Name','Type'],        rows:[…], names:Set },
  locations:   { header:['Name','Type','System','Planet','Moon','Place'], rows:[…], names:Set },
}
```

- `header` is captured from whatever CSV loaded, so column accessors are dynamic, not hard-coded:
  - `nameKey(cat)` = `header[0]`
  - `scuKey()` = first header matching `/scu|capac/i` (fallback `'SCU'`)
  - `ownedKey()` = first header matching `/own/i` (fallback `'Owned'`)
- `names` is a lowercased Set for O(1) "is this already in the catalog?" checks (`inCatalog`, `isNovel`).
- `ensureOwnedColumn()` guarantees `REF.ships` has an `Owned` column even if a user CSV omitted it.
- Rows are kept sorted by name (`sortCat`).

### Module-level UI/runtime vars (not persisted in `state`)

- `fleetSort = {key:'cap'|'name', dir:'asc'|'desc'}` — ship table sort
- `dragState = {secId, id} | null` — active row drag
- `dataDir` — `FileSystemDirectoryHandle` once a folder is connected
- `dataSource` — `'defaults' | 'fetch' | 'folder' | 'manual'` (drives the status line)
- `storageOk` — whether any persistence backend exists
- `uid` / `nid()` — monotonic id generator; `reId()` reconciles `uid` after loading saved ids

---

## 4. Crate math & aggregation

### `breakdown(scu, sizesMap)` — the core algorithm

Greedy largest-first cascade over the **enabled** sizes:

```js
function breakdown(scu, sizes){       // sizes is a {32:true,...} map
  let rem = Math.max(0, Math.floor(Number(scu)||0));
  const counts = {};
  for (const s of enabledDesc(sizes)) {       // ALL_SIZES filtered to enabled, desc
    const n = Math.floor(rem / s);
    if (n > 0) { counts[s] = n; rem -= n*s; }
  }
  return { counts, leftover: rem };           // leftover>0 only if the smallest enabled size can't finish
}
```

This intentionally matches the original spreadsheet behavior: it is **not** an optimal bin-packer (it won't prefer `24+24` over `32+16`). If you ever want minimum-crate-count packing, replace this function — everything downstream consumes `{counts, leftover}` and would keep working.

### Aggregation

- `flatEntries()` → `[{it, sizes}]` flattening every item across all trips, each paired with **its trip's** size map (so per-trip limits are respected when combining).
- `aggregate(entries)` → `{ totals:{size:count}, scu, leftover, crates }`. Used everywhere: run summary, per-trip subtotals, per-destination/source cards.
- `runTotal()` = `aggregate(flatEntries()).scu`.
- `missionScus()` = per-trip SCU totals; `fitTarget()` picks the sizing target:
  - `combined` → `runTotal()`
  - `largest` → max single trip's SCU (because trips aren't aboard simultaneously). Returns `{scu, label, detail}` for the caption.

---

## 5. Reference-data loading & precedence

Reference data can come from four places; later sources override earlier ones. Boot order (`init()`):

1. **`loadSeeds()`** — parse the embedded `<script type="text/plain">` CSVs → baseline so the app is never empty (and works in preview / `file://`).
2. **`loadCatalogCache()`** — if `Store` has `cargo:catalog`, apply it (this is the in-browser mirror of prior catalog edits, so additions survive refresh even with no folder).
3. **`tryFetchFolder()`** — `fetch('./data/<file>.csv')` for each; succeeds only when the page is served over HTTP(S). Overrides on success and sets `dataSource='fetch'`.
4. **`connectFolder()` / `loadManualFiles()`** — user-initiated. `connectFolder` uses the **File System Access API** (`showDirectoryPicker`, Chromium-only) and is the only path that grants **write-back** to the CSVs; `loadManualFiles` reads user-picked files (read-only) and uses `detectCategory()` to route each file to ships/commodities/locations by filename then header signature.

### Writing catalog changes back — `commitCatalog(cat, msg, addedName, immediate)`

Called by `addEntry`, owned-toggle, capacity edits, etc.:
- Always calls `saveCatalog()` → writes `cargo:catalog` to `Store` (the browser mirror).
- If `dataDir` is connected → `writeFolder(cat)` serializes `toCSV(header, rows)` and writes the real file (debounced unless `immediate`).
- Otherwise → `flash()` a hint to use **Export CSVs**.

---

## 6. Rendering pipeline

`renderAll()` = `renderSections()` + `renderSummary()` + `renderGroups()` + `renderFleet()` + `refreshDatalists()`.

The pattern throughout: **structural changes do a full re-render of the affected region; text/number typing does targeted in-place updates** so inputs never lose focus mid-keystroke. (This focus-preservation rule is why, e.g., editing SCU calls `updateItemDerived`/`updateSectionSubtotal` rather than rebuilding the row, and why editing a ship capacity calls `updateFleetFits` rather than `renderFleet` on every keystroke.)

### 6.1 Trips & rows

- `renderSections()` → for each trip `buildSection(sec)`, then `applyColWidths()`.
- `buildSection(sec)` builds: the title/subtotal/delete header, the crate-size toggle row, and the table. The table uses **`table-layout:fixed` with a `<colgroup>`** so column widths are exact and predictable.
  - **Fixed column widths** live in a local `FX` object: `{drag:24, m:30, scu:70, size:42, crates:62, done:28, del:34}`.
  - **Resizable columns** (Commodity/From/To) carry `data-w="commodity|source|destination"` on their `<col>` and read width from `state.colW`.
  - Column count: `6 + sizes.length + 3` (drag, M, commodity, scu, from, to + one per enabled size + crates, done, delete).
- `buildItemRow(sec, it, sizes)` builds one row:
  - drag handle (`.grip`), mission `<input>` (`.m-num`), the four `fieldCell` inputs, one `<td class="szcell" data-size=N>` per enabled size, the Crates cell, the done checkbox, the delete button.
  - `paintRow()` sets `tr.style.background = missionColor(it.mission)` and `tr.style.setProperty('--rowfg', missionFg(color))`; CSS uses `--rowfg` to color all text/controls on that row.
- `updateItemDerived(tr, it, sizesMap)` recomputes only the per-size `td.szcell` numbers + the Crates cell (used on SCU input).
- `updateSectionSubtotal(sec)` updates only that trip's header subtotal.

### 6.2 Column resizing (shared across trips)

- `addResizer(th, key)` appends a `.col-resizer` grabber to a header, with pointer capture. On drag it writes `state.colW[key]` and calls `applyColWidths()` live; on release it `touch()`es (persists). It `stopPropagation`s so it doesn't trigger the header's sort handler.
- `applyColWidths()` walks **every** `.mission table.tbl`, sets each `col[data-w]`'s width from `state.colW`, and sets each table's total width = sum of its columns. This is what makes a resize on one trip apply to all.

### 6.3 Sorting & drag reorder (per trip)

- `sortItems(sec, key)` sorts `sec.items` (numeric for `scu`/`mission`, `localeCompare` otherwise), toggles `sec.sort.dir`, re-renders. Headers carry `data-sk` and a click handler.
- Drag reorder uses native HTML5 DnD, initiated only from the `.grip` (the row's `draggable` is toggled on grip `mousedown`). `dragState` tracks the source; `getDragAfterElement(tbody,y)` finds the insertion point; the dragging `<tr>` is moved live during `dragover`; on `drop`, `commitDragOrder(sec, tbody)` rebuilds `sec.items` from the DOM order and **clears `sec.sort`** (manual order wins). Drag is scoped to the same trip.

### 6.4 Completion (`item.done` is the single source of truth)

- Each row has a `.donebox` checkbox bound to `it.done`.
- In `renderGroup`, a card's checkbox is `checked` when **all** its items are done, `indeterminate` when **some** are; toggling it sets every item in that group's `done` to the same value, then re-renders.
- Because a single `item` object appears in both its destination card and its source card (and its trip row), flipping `done` anywhere updates everywhere on the next `renderGroups()`/`renderSections()`.

### 6.5 Summary, groups, collapsibles

- `renderSummary()` writes the four stat tiles, the per-size totals chips, and the leftover warning.
- `groupEntries(field)` buckets `flatEntries()` by `destination` or `source`. `renderGroup(...)` builds the cards (checkbox + name + SCU, crate pills, item lines with mission-color dots).
- `applyCollapse()` toggles the `.collapsed` class on `#dropHead`/`#byDest` and `#pickHead`/`#bySource` from `state.dropOpen`/`state.pickOpen`.

### 6.6 Ship Fit Check (fleet)

- The fleet **is** the set of `REF.ships.rows` where `isOwned(row)` — not a separate list. Editing capacity edits the catalog row; "removing" sets `Owned=No`; adding sets `Owned=Yes` (and creates the catalog row if novel).
- `renderFleet()` sorts owned ships by `fleetSort`, computes the fit target via `fitTarget()`, pins `bestFitRow()` (smallest capacity ≥ target) to the top with `★ Best Fit`, and renders a persistent "add ship" row at the bottom (capacity auto-fills from the catalog via `shipCatalogCap`).
- `updateFleetFits()` is the focus-safe in-place updater used while typing a capacity or editing cargo.

### 6.7 Datalists & the novelty "+"

- `fieldCell(opts)` builds a `<td>` → `.field` wrapper → `<input>` (+ optional absolutely-positioned `.addbtn`). `.field` is **`display:block`** and the input is `width:100%` — this matters: a flex wrapper made `<input list>` controls size to content instead of filling the cell (see Gotchas).
- `<datalist id="commodityList|locationList|shipList">` elements live in the DOM; `refreshDatalists()` fills them from `namesFor(cat)` (catalog names ∪ values already used in the run). Native datalist provides the filtering dropdown.
- `wireNovel(inp, addBtn, cat, getExtra, after)` shows the **+** only when `isNovel(cat, value)`, and toggles the `has-add` class so the input reserves right-padding *only* while the + is visible (otherwise text would clip early). Clicking + calls `addEntry`.

---

## 7. Persistence

```js
const Store = {
  hasWS: !!(window.storage && window.storage.get),   // Claude artifact host
  hasLS: <localStorage available? (try/catch probe)>, // downloaded file / normal browser
  async get(k){ try WS first, then LS }
  async set(k,v){ write to whichever exist }
};
```

- Two keys: **`cargo:manifest`** (the run = `state`) and **`cargo:catalog`** (mirror of `REF`).
- `saveState()` is debounced via `touch()` (350ms). `loadState()` reads `cargo:manifest` and runs `migrateInto`.
- **`migrateInto(saved)`** is the forward/backward-compat shim. It:
  - defaults `fitMode`, `dropOpen`, `pickOpen`, `colW`;
  - accepts the current `{sections:[…]}` shape **or** the legacy flat `{items, sizes}` shape (wraps it into one trip);
  - normalizes each section (ensures `id`, `sizes`, and per-item `mission`/`done` defaults via `reId`);
  - stashes any legacy `saved.ships` into `pendingOwn`, which `applyPendingOwn()` later folds into the catalog as `Owned=Yes`.
- This is the mechanism that lets you ship a new HTML version and have old saved data load cleanly: **extend `migrateInto` whenever you add/rename a `state` field.**

Why both backends: in the Claude artifact sandbox `window.storage` is the supported API and `localStorage` may throw; as a downloaded `file://` page `window.storage` is absent and `localStorage` works. Probing both (in try/catch) makes refresh-persistence work in either environment without changing code.

---

## 8. DOM id reference

| id | element / purpose |
|---|---|
| `manifestName` | run name input (top bar) |
| `exportBtn` / `importBtn` / `importFile` | Export/Import Run (JSON) |
| `clearBtn` | reset to one empty trip |
| `dlAnchor` | hidden `<a>` reused for all downloads |
| `dataStatus` / `saveFlash` | data-source line + transient save toast |
| `connectFolder` / `loadCsvBtn` / `csvFiles` / `exportCsvBtn` | catalog source controls |
| `addSection` | + Add Trip |
| `sections` | container for all trip panels |
| `commodityList` / `locationList` / `shipList` | `<datalist>`s for autocomplete |
| `sTotalScu` / `sTotalCrates` / `sCommodities` / `sDests` | summary stat tiles |
| `sizeTotals` / `leftoverWarn` / `copyBtn` | summary extras |
| `dropHead` / `byDest` | "What Drops Where" header + grid |
| `pickHead` / `bySource` | "What To Pick Up Where" header + grid |
| `fitModeSeg` / `fitTarget` | fleet sizing-mode toggle + caption |
| `thName` / `thCap` / `shipBody` | fleet table headers + body |
| `storageStatus` | run-persistence status line |

Trip panels carry `data-sec=<section.id>`; item rows carry `data-id=<item.id>` and class `item-row`; resizable `<col>`s carry `data-w`; size cells carry `data-size`.

---

## 9. Styling / design tokens

All theming is CSS custom properties on `:root` (matte "Starfield" palette):

| token | role |
|---|---|
| `--bg / --bg2 / --panel / --panel2` | dark slate surfaces |
| `--line / --line-bright` | borders |
| `--txt / --txt-dim / --txt-faint` | cream text ramp |
| `--cyan / --cyan-dim` | primary accent (dusty blue) |
| `--amber / --amber-soft` | gold (SCU/cargo numbers) |
| `--green` | sage (success/owned/fits) |
| `--red` | terracotta (errors/leftover/delete) |
| `--glow` | subtle 1px focus ring (no blur) |
| `--display / --body / --mono` | font stacks (Chakra Petch / Saira / Share Tech Mono) |

Per-row mission color is **inline** (`tr.style.background`) with the per-row contrast color in the `--rowfg` custom property; `.item-row.colored …` rules consume `--rowfg`. The 10 mission colors are `MISSION_COLORS`; `missionFg(hex)` picks dark vs cream text by perceived luminance (`0.299R+0.587G+0.114B`, threshold `0.52`). Angular panel corners use `clip-path`. Tables are wrapped in `.tbl-scroll` (`overflow-x:auto`) so wide tables scroll instead of breaking layout.

---

## 10. Event → update map (what triggers what)

| User action | Handler | Re-renders |
|---|---|---|
| Type commodity/from/to | input listener + `wireNovel` | summary, groups, datalists (focus preserved) |
| Type SCU | input listener | `updateItemDerived` + subtotal + summary + groups + `updateFleetFits` |
| Change mission # | `.m-num` input | `paintRow()` + groups |
| Toggle crate size | toggle click | `renderSections` + summary + groups + `updateFleetFits` |
| Click column header | `sortItems` | `renderSections` (+ groups) |
| Drag row | DnD + `commitDragOrder` | `renderSections` + groups |
| Resize column | `addResizer` → `applyColWidths` | live width on all tables; `touch` on release |
| Tick item done | `.donebox` change | toggle row class + `renderGroups` |
| Tick card done | card checkbox | set items + `renderSections` + `renderGroups` |
| Add/Owned/capacity ship | fleet handlers + `commitCatalog` | `renderFleet`, catalog write/cache |
| Fit-mode toggle | `#fitModeSeg` | `renderFleet` |
| Collapse group | `#dropHead`/`#pickHead` | `applyCollapse` |
| Any of the above | `touch()` | debounced `saveState` |

---

## 11. Known constraints & gotchas

- **`file://` can't read sibling files.** Auto-loading `./data/*.csv` via `fetch` only works over HTTP(S) or the connected-folder path. This is why embedded seeds exist.
- **File System Access API is Chromium-only** and requires a secure context (https or localhost; Chrome also treats `file://` as secure). Firefox/Safari fall back to manual Load/Export.
- **`localStorage` may throw in sandboxed iframes** — always access via the `Store` try/catch wrapper, never directly.
- **Fixed table layout clips overflow.** Text longer than a column is clipped, not auto-expanded — that's intentional and the column resizers are the escape hatch. Don't reintroduce `table-layout:auto` without rethinking the shared widths.
- **`<input list>` + flexbox sizing bug.** A flex `.field` wrapper made datalist inputs size to content. Keep `.field` as `display:block` and the input `width:100%`.
- **Per-trip size columns.** Each trip's table shows only *its* enabled sizes, so two trips can have different column sets. The combined view of all sizes is the Loadout Summary.
- **Catalog vs run separation.** Owned ships and capacities live in `REF.ships`/`ships.csv`, not in `state`. Export Run (JSON) does **not** carry the fleet; Export CSVs does.
- **Greedy packing is not optimal** (see §4).

---

## 12. Extension recipes

- **Add a catalog field (e.g. show location System/Planet):** the CSV columns already load into `REF.locations.rows`. Surface them in `renderGroup`/the location dropdown by reading `catalogRow('locations', name)[key]`. No parser changes needed.
- **Add a new mission color / change the palette:** edit `MISSION_COLORS` (keep them solid/opaque; `missionFg` handles contrast). To support >10, the modulo in `missionColor` already wraps.
- **Add a sortable column to the fleet:** extend `setSort`/`fleetSort` and the `renderFleet` comparator.
- **Persist a new `state` field:** add it to the `state` initializer **and** default it in `migrateInto` (so old saves don't break).
- **Cross-trip drag:** currently `dragover`/`drop` bail when `dragState.secId !== sec.id`. Allow mismatches and move the item between `sec.items` arrays in `commitDragOrder`.
- **Change crate-packing to minimize count:** replace `breakdown()` only; its `{counts, leftover}` contract is consumed everywhere else unchanged.
- **New deliverable formats (print/PDF):** `summaryText()` is the canonical plaintext serializer; mirror it for other formats.

---

## 13. Boot sequence (`init()`)

```text
1. reveal "Connect data folder" if showDirectoryPicker exists
2. loadSeeds(); ensureOwnedColumn()          // baseline catalog
3. await loadState()                          // run from Store; migrateInto; sets storageOk
4. await loadCatalogCache()                   // catalog mirror overrides seeds
5. ensureOwnedColumn()
6. if no sections → create one empty Trip A
7. applyPendingOwn()                          // fold legacy ships → owned
8. set run name; renderAll(); updateDataStatus()
9. await tryFetchFolder()                      // served ./data overrides everything
10. ensureOwnedColumn(); renderFleet(); updateDataStatus()
```

That ordering encodes the precedence: **served/connected folder > browser cache > embedded seeds** for catalogs, and **saved run > fresh default** for the manifest.
