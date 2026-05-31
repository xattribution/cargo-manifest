// Catalog model for the webapp's HYBRID storage design:
//   baseline  = server-hosted CSVs (read-only, fetched at load, updated when we ship a patch)
//   delta     = the only thing kept in the browser (owned ships + user-added entries)
//   materialized = baseline with the delta applied on top (what the UI actually renders)
// This keeps local storage tiny and lets baseline (SCU/ship) updates flow through while
// preserving the user's own customisations. See PARITY.md "Storage model".
import type { Cat, Category, CatalogRow, CatalogDelta } from './types';
import { parseCSV } from './csv';

export const FILES: Record<Cat, string> = {
  ships: 'ships.csv',
  commodities: 'commodities.csv',
  locations: 'locations.csv',
};

export const DEFAULT_HEADERS: Record<Cat, string[]> = {
  ships: ['Name', 'SCU', 'Owned'],
  commodities: ['Name', 'Type'],
  locations: ['Name', 'Type', 'System', 'Planet', 'Moon', 'Place'],
};

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
  const nk = nameKey(baseline), sk = scuKeyOf(baseline), ok = ownedKeyOf(baseline);
  const rows: CatalogRow[] = baseline.rows.map((r) => ({ ...r, [ok]: 'No' }));
  const byName = new Map(rows.map((r) => [String(r[nk] || '').trim().toLowerCase(), r]));
  for (const key in delta.shipsOwned) {
    const o = delta.shipsOwned[key];
    const existing = byName.get(key);
    if (existing) {
      existing[ok] = 'Yes';
      if (o.cap != null) existing[sk] = String(o.cap);
    } else {
      const row: CatalogRow = {};
      baseline.header.forEach((h) => (row[h] = ''));
      row[nk] = o.name;
      row[sk] = String(o.cap ?? 0);
      row[ok] = 'Yes';
      rows.push(row);
      byName.set(key, row);
    }
  }
  sortByName(rows, nk);
  return { header: baseline.header.slice(), rows };
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
