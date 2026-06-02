// Shared data model — the single place to change the run/catalog shapes.
// See ARCHITECTURE.md §3 (data domains) and §4 (lib map).

export type Cat = 'ships' | 'commodities' | 'locations';

export type CatalogRow = Record<string, string>;

export interface Category {
  header: string[];
  rows: CatalogRow[];
}

export type SizeMap = Record<number, boolean>;

export interface Item {
  id: string;
  commodity: string;
  scu: string; // kept as a string straight from the input, coerced via Number() — matches original
  source: string;
  destination: string;
  mission: number; // 1..10, drives row color
  done: boolean; // delivered / dropped off — the real completion (fades the trip line)
  pickedUp: boolean; // visual-only "I've collected this" flag set from the Pick Up column
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface Trip {
  id: string;
  name: string;
  sizes: SizeMap; // enabled crate sizes for this trip
  sort: SortState | null; // active column sort (null = manual order)
  items: Item[];
}

export interface RunState {
  name: string;
  fitMode: 'mission' | 'largest' | 'combined';
  dropOpen: boolean;
  pickOpen: boolean;
  colW: { commodity: number; source: number; destination: number };
  sections: Trip[];
  missionShips: Record<number, string>; // mission # -> assigned ship name ('' = none)
  missionNames: Record<number, string>; // mission # -> optional label
  missionRewards: Record<number, number>; // mission # -> reward in aUEC (assumes 100% completion)
  missionOrder: number[]; // display order of mission #s in the Missions panel; also keeps "blank" missions visible
  pickOrder: string[]; // manual ordering of Pick Up cards (by source key); unknown keys fall to the end
  dropOrder: string[]; // manual ordering of Drop Off cards (by destination key)
}

// ---- Hybrid persistence: only deltas vs. the server-hosted baseline live in the browser ----

export interface OwnedShip {
  name: string; // original-cased name
  cap: number | null; // capacity override; null = use the baseline's capacity (so patch updates flow through)
  added: boolean; // true = user-added ship that is not in the baseline catalog
}

// Per-ship cargo-grid override (applies to ANY ship, owned or not). Captures the realistic
// arrangement: max container size + how many of each size fit when the grid is filled.
export interface ShipGrid {
  name: string; // original-cased name
  scu: number | null; // capacity override (null = leave baseline/owned value)
  maxSize: number | null; // largest container the grid accepts (null = no limit)
  grid: Record<number, number>; // size -> count when the grid is full (omit/0 where N/A)
}

export interface CatalogDelta {
  v: number; // schema version
  shipsOwned: Record<string, OwnedShip>; // key = lowercased name; presence = owned
  shipGrids: Record<string, ShipGrid>; // key = lowercased name; per-ship grid/capacity data
  commoditiesAdded: CatalogRow[]; // user-added commodity rows (baseline is read-only reference)
  locationsAdded: CatalogRow[]; // user-added location rows
}

export function emptyDelta(): CatalogDelta {
  return { v: 2, shipsOwned: {}, shipGrids: {}, commoditiesAdded: [], locationsAdded: [] };
}
