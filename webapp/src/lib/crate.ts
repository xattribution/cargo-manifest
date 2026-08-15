// Crate packing + aggregation. Faithful port of the breakdown/aggregate logic.
// Greedy largest-first cascade over the enabled sizes — intentionally NOT an optimal
// bin-packer, matching the original spreadsheet behaviour (ARCHITECTURE.md §4).
import type { Item, SizeMap, Trip } from './types';

export const ALL_SIZES = [32, 24, 16, 8, 4, 2, 1];

export const allSizesOn = (): SizeMap => ({ 32: true, 24: true, 16: true, 8: true, 4: true, 2: true, 1: true });

export function enabledDesc(sizes: SizeMap): number[] {
  return ALL_SIZES.filter((s) => sizes[s]);
}

export interface Breakdown {
  counts: Record<number, number>;
  leftover: number;
}

export function breakdown(scu: number | string, sizes: SizeMap): Breakdown {
  let rem = Math.max(0, Math.floor(Number(scu) || 0));
  const counts: Record<number, number> = {};
  for (const s of enabledDesc(sizes)) {
    const n = Math.floor(rem / s);
    if (n > 0) { counts[s] = n; rem -= n * s; }
  }
  return { counts, leftover: rem };
}

export function crateCount(c: Record<number, number>): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

export interface Aggregate {
  totals: Record<number, number>;
  scu: number;
  leftover: number;
  crates: number;
}

export interface Entry {
  it: Item;
  sizes: SizeMap;
}

// Each commodity packs into its own crates — two goods never share a box — so we sum
// per-item breakdowns rather than packing the combined SCU.
export function aggregate(entries: Entry[]): Aggregate {
  const totals: Record<number, number> = {};
  let scu = 0;
  let leftover = 0;
  for (const { it, sizes } of entries) {
    const v = Math.max(0, Math.floor(Number(it.scu) || 0));
    scu += v;
    const bd = breakdown(v, sizes);
    leftover += bd.leftover;
    for (const s in bd.counts) totals[+s] = (totals[+s] || 0) + bd.counts[+s];
  }
  return { totals, scu, leftover, crates: crateCount(totals) };
}

export function flatEntries(sections: Trip[]): Entry[] {
  const out: Entry[] = [];
  for (const sec of sections) for (const it of sec.items) out.push({ it, sizes: sec.sizes });
  return out;
}

export function runTotal(sections: Trip[]): number {
  return aggregate(flatEntries(sections)).scu;
}

// Delivered progress: total SCU of lines marked done (drop-off complete).
export function deliveredScu(sections: Trip[]): number {
  let n = 0;
  for (const sec of sections) for (const it of sec.items) if (it.done) n += Math.max(0, Math.floor(Number(it.scu) || 0));
  return n;
}

export interface TripScu { name: string; scu: number; }

export function tripScus(sections: Trip[]): TripScu[] {
  return sections.map((sec) => ({
    name: sec.name || 'Trip',
    scu: aggregate(sec.items.map((it) => ({ it, sizes: sec.sizes }))).scu,
  }));
}

export interface FitTarget { scu: number; label: string; detail: string; totals: Record<number, number>; }

export function fitTarget(sections: Trip[], fitMode: 'largest' | 'combined'): FitTarget {
  if (fitMode === 'combined') {
    const agg = aggregate(flatEntries(sections));
    return { scu: agg.scu, label: 'combined total', detail: '', totals: agg.totals };
  }
  let top: { name: string; agg: Aggregate } | null = null;
  for (const sec of sections) {
    const agg = aggregate(sec.items.map((it) => ({ it, sizes: sec.sizes })));
    if (agg.scu > 0 && (!top || agg.scu > top.agg.scu)) top = { name: sec.name || 'Trip', agg };
  }
  if (!top) return { scu: 0, label: 'largest trip', detail: '', totals: {} };
  return { scu: top.agg.scu, label: 'largest trip', detail: top.name, totals: top.agg.totals };
}

// Largest crate size present in a totals map (0 if empty).
export function maxCrateSize(totals: Record<number, number>): number {
  let m = 0;
  for (const s of ALL_SIZES) if (totals[s] && s > m) m = s;
  return m;
}

// Group flat entries by a field (destination/source) → Map<key, Entry[]>
export function groupEntries(sections: Trip[], field: 'destination' | 'source'): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const sec of sections) {
    for (const it of sec.items) {
      const key = (it[field] || '').trim() || '(unassigned)';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ it, sizes: sec.sizes });
    }
  }
  return map;
}
