# Cargo Manifest — Star Citizen Hauling Planner

A single-file, offline web tool for planning multi-stop cargo runs in Star Citizen. Enter what you're hauling, break it into SCU crate sizes automatically, see which of your owned ships can carry it, and track each pickup/drop-off as you complete it.

Everything lives in one `cargo-manager.html` file plus an optional `data/` folder of CSVs. No install, no account, no internet required after the fonts load.

---

## 1. Quick start

### Folder layout

```
cargo-manager.html      ← the app (open this)
data/
├── ships.csv           ← ship catalog (Name, SCU, Owned)
├── commodities.csv     ← commodity catalog (Name, Type)
└── locations.csv       ← location catalog (Name, Type, System, Planet, Moon, Place)
```

The app already has a **built-in copy** of all three lists baked in, so it works immediately even with no `data/` folder. The `data/` folder is how you make those lists *yours* (edit them, add ships you own, etc.) — when present, it overrides the built-in copy.

### Three ways to run it

| How you open it | Reads `data/` CSVs? | Saves new entries back to CSVs? | Notes |
|---|---|---|---|
| **Double-click the file** (`file://`) | No (browser blocks local file reads) | No (use Export, or Connect folder) | Still fully usable on built-in data; your run is saved in the browser. |
| **Connect data folder** button (Chrome/Edge) | Yes | **Yes — writes straight into the CSVs** | The best local experience. One click, pick the `data/` folder. |
| **Served over HTTP** (e.g. `python -m http.server` in the folder) | Yes (auto-loads on open) | No (use Export, or Connect folder) | Good for a homelab-hosted copy. |

> **Tip:** On Chrome or Edge, click **Connect data folder** once and point it at your `data/` folder. After that, every ship you mark owned and every new commodity/location you add is written directly into the CSV files.

The status bar near the top always tells you which mode you're in (e.g. `● data/ folder connected (read + write)` vs `○ built-in defaults`) and how many ships/commodities/locations are loaded.

---

## 2. The data folder (CSVs)

You can edit these in any spreadsheet app or text editor. Headers must stay on the first row.

- **ships.csv** — `Name, SCU, Owned`
  - `SCU` = cargo capacity. `Owned` = `Yes`/`No`. Ships marked `Yes` auto-load into the Ship Fit Check list.
- **commodities.csv** — `Name, Type` (Type isn't shown yet — reserved for a future feature).
- **locations.csv** — `Name, Type, System, Planet, Moon, Place` (only `Name` is searched/shown right now; the rest are kept for later).

The catalogs power the **dropdowns** as you type, and adding new entries (see below) appends to them.

---

## 3. Building a run

### Trips

A **Trip** is one physical haul (one load on one ship). Click **+ Add Trip** for more. Rename a trip by typing in its title (e.g. "Going", "Coming"). A trip can carry objectives from several different missions at once — that's what the per-line mission tag is for.

Each trip header shows a live subtotal (`SCU · crates`) and an ✕ to remove it (you always keep at least one).

### Crate sizes per trip

Under each trip is a row of crate-size toggles: **32 / 24 / 16 / 8 / 4 / 2 / 1 SCU**. Turn sizes off to match a mission's box limit (e.g. a "16 SCU and below" mission). Each trip has its own limit. Crates are filled largest-first, then the remainder cascades down to the next enabled size.

### Adding commodities

Click **+ Add Commodity** to add a row, then fill in:

- **M** — mission number (1–10). See *Mission colors* below.
- **Commodity** — start typing; the dropdown narrows to matching catalog entries.
- **SCU** — total amount of that commodity for this leg.
- **From** / **To** — pickup and drop-off. Dropdowns narrow as you type.

As soon as you enter an SCU amount, the per-size columns fill in with how many crates of each size that load becomes, and the **Crates** column shows the total. If a size can't be packed (e.g. you turned off 1 SCU and have a leftover), you'll see a small red `+Nu` (units unpacked) marker.

### Adding something not in the catalog

If you type a commodity, location, or ship that isn't in the catalog, a small **+** button appears in the field. Click it to add that entry to the catalog (`commodities.csv` / `locations.csv` / `ships.csv`). It then shows up in the dropdown everywhere. If your `data/` folder is connected, the CSV is updated immediately; otherwise use **Export CSVs** to save the additions.

### Mission colors (the M column)

Each line carries a **mission number 1–10**, and that number colors the entire row. The same number always gets the same color — even on different trips — so objectives that belong to one mission (or a set of grouped missions sharing destinations) read as a single color block. Text contrast is handled automatically for every color. A new line inherits the mission number of the line above it.

> Star Citizen tracks up to 10 missions at once, so 1–10 covers a full board.

### Sorting and reordering within a trip

- **Click a column header** (M, Commodity, SCU, From, To) to sort the trip's rows by it; click again to reverse. An arrow shows the active sort.
- **Drag the ⠿ handle** on the left of any row to reorder rows by hand. Doing so clears the column-sort (the order is now your custom arrangement).

### Resizing columns

Hover the right edge of the **Commodity**, **From**, or **To** header and drag to resize. The width is **shared across every trip** and remembered — resize once, it applies everywhere. The other columns are fixed-width on purpose.

---

## 4. Reading the plan

### Loadout Summary

Totals for the whole run: total SCU, total crates, distinct commodities, distinct destinations, and a per-size crate tally. **Copy Summary Text** puts a clean plaintext breakdown on your clipboard for pasting into Discord or org chat.

### Ship Fit Check

Lists the ships you've marked **Owned** in `ships.csv`. The smallest hull that fits is pinned to the top and flagged **★ Best Fit**; ships that can't fit show how many SCU short they are.

- **Largest mission / Combined total** toggle (top right of the section): *Largest mission* sizes a hull for your single biggest trip — correct when trips aren't all aboard at once. *Combined total* sizes for everything at once. A caption tells you exactly what's being sized.
- Sort by **Ship** or **Capacity** (click the headers); default is capacity high→low.
- Add a ship in the bottom row (capacity auto-fills for known ships). Editing a capacity or removing a ship updates `ships.csv`. Removing just sets `Owned = No` — it stays in the catalog.

### What Drops Where / What To Pick Up Where

Two collapsible sections (click the header to fold/unfold) that group your cargo **by destination** and **by source**, across all trips. Each card shows the SCU, crate breakdown, and the individual items going to/from that location, each with a small mission-color dot.

**Completion tracking:** every line has a ✓ checkbox, and every card has a checkbox.
- Tick a **card** → marks all its items complete.
- Tick all the **items** for a location → its card auto-completes.
- It's bidirectional and a single item can appear in both a destination card and a source card; completing it updates both. Untick anything to undo.

Completed lines fade out so you can see at a glance what's left.

---

## 5. Saving your work

- **Auto-save:** your run (trips, items, ships, view settings, column widths) is saved on the device automatically and **survives a browser refresh**. It only clears when you press **Clear**. Updating the HTML file and refreshing keeps your data while picking up the new version.
- **Export Run / Import Run:** save the whole run to a `.json` file and load it back later or on another machine.
- **Export CSVs:** download the current `ships.csv`, `commodities.csv`, and `locations.csv` (including anything you've added) to drop back into your `data/` folder.

> If you're running by double-clicking the file and want catalog edits to stick to the actual CSVs, either **Connect data folder** (Chrome/Edge) or use **Export CSVs** and replace the files in `data/`.

---

## 6. Troubleshooting

- **Dropdowns are empty / nothing autocompletes.** The catalogs didn't load. Check the status bar — if it says "built-in defaults" the lists are still there; if counts are 0, your CSV headers may be malformed. Try **Load CSVs…** and pick the three files.
- **"Connect data folder" button is missing.** That feature needs a Chromium browser (Chrome/Edge). On Firefox/Safari, use **Load CSVs…** to read and **Export CSVs** to save.
- **My owned ships disappeared after refresh.** If you're on built-in defaults with no folder connected, catalog edits are cached in the browser but the real save target is the CSV. Connect the folder or Export CSVs to persist them durably.
- **Long station names get cut off.** Drag the **To**/**From** column wider — the width applies to all trips and is remembered.
- **A leftover `+Nu` keeps showing.** A crate size needed to pack the remainder is turned off for that trip. Re-enable a smaller size (e.g. 1 SCU).

---

## 7. Privacy

Everything runs locally in your browser. The only network request is for the web fonts (Google Fonts); the app falls back to system fonts if those are blocked. Your manifests and catalogs never leave your device.
