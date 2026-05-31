// Shared data model. Mirrors the `state` / `REF` shapes from the original single-file
// app (see ../../cargo-manager.html and ARCHITECTURE.md §3) so behaviour stays identical.

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
  mission: number; // 1..10, drives row colour
  done: boolean;
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
  fitMode: 'largest' | 'combined';
  dropOpen: boolean;
  pickOpen: boolean;
  colW: { commodity: number; source: number; destination: number };
  sections: Trip[];
}

// ---- Hybrid persistence: only deltas vs. the server-hosted baseline live in the browser ----

export interface OwnedShip {
  name: string; // original-cased name
  cap: number | null; // capacity override; null = use the baseline's capacity (so patch updates flow through)
  added: boolean; // true = user-added ship that is not in the baseline catalog
}

export interface CatalogDelta {
  v: number; // schema version
  shipsOwned: Record<string, OwnedShip>; // key = lowercased name; presence = owned
  commoditiesAdded: CatalogRow[]; // user-added commodity rows (baseline is read-only reference)
  locationsAdded: CatalogRow[]; // user-added location rows
}

export function emptyDelta(): CatalogDelta {
  return { v: 1, shipsOwned: {}, commoditiesAdded: [], locationsAdded: [] };
}
