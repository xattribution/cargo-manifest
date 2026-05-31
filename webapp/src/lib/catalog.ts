// Catalog model for the webapp's HYBRID storage design:
//   baseline  = server-hosted CSVs (read-only, fetched at load, updated when we ship a patch)
//   delta     = the only thing kept in the browser (owned ships + user-added entries)
//   materialized = baseline with the delta applied on top (what the UI actually renders)
// This keeps local storage tiny and lets baseline (SCU/ship) updates flow through while
// preserving the user's own customisations. See PARITY.md "Storage model".
import type { Cat, Category, CatalogRow, CatalogDelta } from './types';
import { parseCSV } from './csv';
import { ALL_SIZES } from './crate';

export const FILES: Record<Cat, string> = {
  ships: 'ships.csv',
  commodities: 'commodities.csv',
  locations: 'locations.csv',
};

// Ship cargo-grid columns. MaxSize = largest container the ship accepts; GridNN = how many
// of size NN fit when the grid is filled (blank where N/A). Sit between SCU and Owned.
export const MAXSIZE_COL = 'MaxSize';
export const gridCol = (size: number): string => 'Grid' + size;
export const SHIP_GRID_COLS = [MAXSIZE_COL, ...ALL_SIZES.map(gridCol)];

export const DEFAULT_HEADERS: Record<Cat, string[]> = {
  ships: ['Name', 'SCU', ...SHIP_GRID_COLS, 'Owned'],
  commodities: ['Name', 'Type'],
  locations: ['Name', 'Type', 'System', 'Planet', 'Moon', 'Place'],
};

// Ensure a ships header carries the grid columns (inserted just before the Owned column).
export function ensureShipColumns(header: string[]): string[] {
  const h = header.slice();
  const ownedIdx = h.findIndex((c) => /own/i.test(c));
  const at = ownedIdx >= 0 ? ownedIdx : h.length;
  for (let i = 0; i < SHIP_GRID_COLS.length; i++) {
    const col = SHIP_GRID_COLS[i];
    if (!h.includes(col)) { h.splice(at + i, 0, col); }
  }
  return h;
}

// dynamic header accessors (resilient to slightly different CSV headers, like the original)
export const nameKey = (c: Category): string => c.header[0] || 'Name';
export const scuKeyOf = (c: Category): string => c.header.find((h) => /scu|capac/i.test(h)) || 'SCU';
export const ownedKeyOf = (c: Category): string => c.header.find((h) => /own/i.test(h)) || 'Owned';

export function isOwnedStr(v: unknown): boolean {
  return /^(y|yes|true|1)$/i.test(String(v ?? '').trim());
}

export async function fetchBaseline(): Promise<Record<Cat, Category>> {
  const out = {} as Record<Cat, Category>;
  for (const cat of Object.keys(FILES) as Cat[]) {
    out[cat] = { header: DEFAULT_HEADERS[cat].slice(), rows: [] };
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/${FILES[cat]}`, { cache: 'no-cache' });
      if (res.ok) {
        const parsed = parseCSV(await res.text());
        if (parsed.header.length) out[cat] = parsed;
      }
    } catch {
      // baseline missing → fall back to the empty header above; app still runs
    }
  }
  if (!out.ships.header.some((h) => /own/i.test(h))) {
    out.ships.header.push('Owned');
    out.ships.rows.forEach((r) => { if (!('Owned' in r)) r['Owned'] = 'No'; });
  }
  return out;
}

function sortByName(rows: CatalogRow[], nk: string): void {
  rows.sort((a, b) => String(a[nk] || '').localeCompare(String(b[nk] || '')));
}

export function materializeShips(baseline: Category, delta: CatalogDelta): Category {
  const header = ensureShipColumns(baseline.header.slice());
  const nk = nameKey(baseline), sk = scuKeyOf(baseline), ok = ownedKeyOf({ header, rows: [] });
  // clone baseline rows into the (possibly widened) header, defaulting new cells to ''
  const rows: CatalogRow[] = baseline.rows.map((r) => {
    const row: CatalogRow = {};
    header.forEach((h) => (row[h] = r[h] != null ? r[h] : ''));
    row[ok] = 'No';
    return row;
  });
  const byName = new Map(rows.map((r) => [String(r[nk] || '').trim().toLowerCase(), r]));
  const ensureRow = (key: string, name: string): CatalogRow => {
    let row = byName.get(key);
    if (!row) {
      row = {};
      header.forEach((h) => (row![h] = ''));
      row[nk] = name;
      row[ok] = 'No';
      rows.push(row);
      byName.set(key, row);
    }
    return row;
  };

  for (const key in delta.shipsOwned) {
    const o = delta.shipsOwned[key];
    const row = ensureRow(key, o.name);
    row[ok] = 'Yes';
    if (o.cap != null) row[sk] = String(o.cap);
  }

  // grid/capacity overrides apply to any ship (owned or not), after owned so they win
  for (const key in delta.shipGrids) {
    const g = delta.shipGrids[key];
    const row = ensureRow(key, g.name);
    if (g.scu != null) row[sk] = String(g.scu);
    row[MAXSIZE_COL] = g.maxSize != null ? String(g.maxSize) : '';
    for (const s of ALL_SIZES) {
      const n = g.grid[s] || 0;
      row[gridCol(s)] = n > 0 ? String(n) : '';
    }
  }

  sortByName(rows, nk);
  return { header, rows };
}

export interface ShipGridInfo {
  maxSize: number | null;
  grid: Record<number, number>;
  sum: number; // realistic capacity = Σ size×count
  hasGrid: boolean;
}

// Read a ship row's grid columns into a structured value (null fields → no data).
export function shipGridOf(row: CatalogRow): ShipGridInfo {
  const grid: Record<number, number> = {};
  let sum = 0;
  let hasGrid = false;
  for (const s of ALL_SIZES) {
    const n = Math.max(0, Math.floor(Number(row[gridCol(s)]) || 0));
    if (n > 0) { grid[s] = n; sum += s * n; hasGrid = true; }
  }
  const maxRaw = Number(row[MAXSIZE_COL]);
  const maxSize = row[MAXSIZE_COL] != null && row[MAXSIZE_COL] !== '' && maxRaw > 0 ? maxRaw : null;
  return { maxSize, grid, sum, hasGrid };
}

export function materializeSimple(baseline: Category, added: CatalogRow[]): Category {
  const nk = nameKey(baseline);
  const rows = baseline.rows.slice();
  const names = new Set(rows.map((r) => String(r[nk] || '').trim().toLowerCase()));
  for (const a of added) {
    const key = String(a[nk] || '').trim().toLowerCase();
    if (key && !names.has(key)) { rows.push(a); names.add(key); }
  }
  sortByName(rows, nk);
  return { header: baseline.header.slice(), rows };
}

export function namesOf(cat: Category): string[] {
  const nk = nameKey(cat);
  return cat.rows.map((r) => String(r[nk] || '').trim()).filter(Boolean);
}

export function inCatalog(cat: Category, v: string): boolean {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return false;
  const nk = nameKey(cat);
  return cat.rows.some((r) => String(r[nk] || '').trim().toLowerCase() === s);
}

export function isNovel(cat: Category, v: string): boolean {
  const s = String(v || '').trim();
  return s !== '' && !inCatalog(cat, s);
}

export function shipCap(ships: Category, name: string): number | null {
  const nk = nameKey(ships), sk = scuKeyOf(ships);
  const key = String(name || '').trim().toLowerCase();
  const row = ships.rows.find((r) => String(r[nk] || '').trim().toLowerCase() === key);
  return row ? Number(row[sk]) || 0 : null;
}
