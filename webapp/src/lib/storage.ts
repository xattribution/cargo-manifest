// Client-only persistence. localStorage exclusively — never cookies, never a server round
// trip — so user data physically cannot reach the server (the runtime is static nginx).
//   cargo:webapp:run   = the full run (trips/items/view settings)
//   cargo:webapp:delta = catalog delta vs. the server baseline (owned ships + added entries)
import type { RunState, CatalogDelta } from './types';
import { emptyDelta } from './types';

const RUN_KEY = 'cargo:webapp:run';
const DELTA_KEY = 'cargo:webapp:delta';

function probe(): boolean {
  try {
    localStorage.setItem('__cg_probe', '1');
    localStorage.removeItem('__cg_probe');
    return true;
  } catch {
    return false;
  }
}
export const storageOk = probe();

export function loadRun(): RunState | null {
  if (!storageOk) return null;
  try {
    const v = localStorage.getItem(RUN_KEY);
    return v ? (JSON.parse(v) as RunState) : null;
  } catch {
    return null;
  }
}

export function saveRun(state: RunState): void {
  if (!storageOk) return;
  try { localStorage.setItem(RUN_KEY, JSON.stringify(state)); } catch { /* quota / disabled */ }
}

export function loadDelta(): CatalogDelta {
  if (!storageOk) return emptyDelta();
  try {
    const v = localStorage.getItem(DELTA_KEY);
    return v ? normalizeDelta(JSON.parse(v)) : emptyDelta();
  } catch {
    return emptyDelta();
  }
}

export function saveDelta(delta: CatalogDelta): void {
  if (!storageOk) return;
  try { localStorage.setItem(DELTA_KEY, JSON.stringify(delta)); } catch { /* quota / disabled */ }
}

// "Clear my data & load defaults" — drops everything we persisted; the next load rebuilds
// purely from the server baseline.
export function clearAll(): void {
  if (!storageOk) return;
  try {
    localStorage.removeItem(RUN_KEY);
    localStorage.removeItem(DELTA_KEY);
  } catch { /* ignore */ }
}

function normalizeDelta(d: unknown): CatalogDelta {
  const base = emptyDelta();
  if (!d || typeof d !== 'object') return base;
  const o = d as Record<string, unknown>;
  return {
    v: 2,
    shipsOwned:
      o.shipsOwned && typeof o.shipsOwned === 'object'
        ? (o.shipsOwned as CatalogDelta['shipsOwned'])
        : {},
    shipGrids:
      o.shipGrids && typeof o.shipGrids === 'object'
        ? (o.shipGrids as CatalogDelta['shipGrids'])
        : {},
    commoditiesAdded: Array.isArray(o.commoditiesAdded) ? (o.commoditiesAdded as CatalogDelta['commoditiesAdded']) : [],
    locationsAdded: Array.isArray(o.locationsAdded) ? (o.locationsAdded as CatalogDelta['locationsAdded']) : [],
  };
}
