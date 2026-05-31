// Reactive run store (Svelte 5 runes). Holds the user's plan and all mutations.
// migrate() mirrors migrateInto() from the single-file app so old/JSON-imported runs load.
import { allSizesOn } from '../lib/crate';
import type { RunState, Trip, Item } from '../lib/types';
import { loadRun } from '../lib/storage';

let uid = 1;
const nid = (): string => 'id' + uid++;

function reId(o: { id?: string }): void {
  const m = /^id(\d+)$/.exec(o.id || '');
  if (m) uid = Math.max(uid, parseInt(m[1], 10) + 1);
  else o.id = nid();
}

function freshItem(mission = 1): Item {
  return { id: nid(), commodity: '', scu: '', source: '', destination: '', mission, done: false };
}
function freshTrip(name: string): Trip {
  return { id: nid(), name, sizes: allSizesOn(), sort: null, items: [freshItem()] };
}
function defaultState(): RunState {
  return {
    name: 'Untitled Run',
    fitMode: 'largest',
    dropOpen: true,
    pickOpen: true,
    colW: { commodity: 300, source: 200, destination: 200 },
    sections: [freshTrip('Trip A')],
  };
}

export function migrate(saved: unknown): RunState {
  const s = defaultState();
  if (!saved || typeof saved !== 'object') return s;
  const o = saved as Record<string, any>;
  s.name = o.name || s.name;
  s.fitMode = o.fitMode === 'combined' ? 'combined' : 'largest';
  s.colW = Object.assign({ commodity: 300, source: 200, destination: 200 }, o.colW || {});
  s.dropOpen = o.dropOpen !== false;
  s.pickOpen = o.pickOpen !== false;
  let sections: Trip[];
  if (Array.isArray(o.sections)) sections = o.sections as Trip[];
  else if (Array.isArray(o.items)) sections = [{ id: nid(), name: 'Trip A', sizes: o.sizes || allSizesOn(), sort: null, items: o.items as Item[] }];
  else sections = [freshTrip('Trip A')];
  for (const sec of sections) {
    if (!sec.id) sec.id = nid(); else reId(sec);
    if (!sec.sizes) sec.sizes = allSizesOn();
    if (sec.sort === undefined) sec.sort = null;
    sec.items = sec.items || [];
    for (const it of sec.items) {
      reId(it);
      if (!it.mission) it.mission = 1;
      if (it.done == null) it.done = false;
      if (it.scu == null) it.scu = '';
    }
  }
  s.sections = sections;
  return s;
}

function createRun() {
  const init = (() => { const r = loadRun(); return r ? migrate(r) : defaultState(); })();
  let state = $state<RunState>(init);
  const byId = (id: string) => state.sections.find((s) => s.id === id);

  return {
    get state() { return state; },

    setName(n: string) { state.name = n; },
    setFitMode(m: 'largest' | 'combined') { state.fitMode = m; },
    toggleDrop() { state.dropOpen = !state.dropOpen; },
    togglePick() { state.pickOpen = !state.pickOpen; },
    setColW(key: 'commodity' | 'source' | 'destination', px: number) {
      state.colW[key] = Math.max(70, Math.min(640, Math.round(px)));
    },

    addTrip() {
      const letter = String.fromCharCode(65 + state.sections.length);
      state.sections.push(freshTrip('Trip ' + letter));
    },
    removeTrip(id: string): boolean {
      if (state.sections.length === 1) return false;
      state.sections = state.sections.filter((s) => s.id !== id);
      return true;
    },
    renameTrip(id: string, name: string) { const t = byId(id); if (t) t.name = name; },
    toggleSize(id: string, size: number) { const t = byId(id); if (t) t.sizes[size] = !t.sizes[size]; },

    addItem(id: string) {
      const t = byId(id);
      if (!t) return;
      const lastM = t.items.length ? t.items[t.items.length - 1].mission || 1 : 1;
      t.items.push(freshItem(lastM));
    },
    removeItem(tid: string, iid: string) { const t = byId(tid); if (t) t.items = t.items.filter((i) => i.id !== iid); },

    sortTrip(tid: string, key: string) {
      const t = byId(tid);
      if (!t) return;
      const dir = t.sort && t.sort.key === key && t.sort.dir === 'asc' ? 'desc' : 'asc';
      t.sort = { key, dir };
      const mul = dir === 'asc' ? 1 : -1;
      t.items.sort((a, b) => {
        if (key === 'scu') return mul * ((Number(a.scu) || 0) - (Number(b.scu) || 0));
        if (key === 'mission') return mul * ((Number(a.mission) || 1) - (Number(b.mission) || 1));
        return mul * String((a as any)[key] || '').localeCompare(String((b as any)[key] || ''), undefined, { sensitivity: 'base' });
      });
    },

    // Move an item within its trip to a new index (drag reorder); clears column sort.
    reorder(tid: string, fromId: string, toIndex: number) {
      const t = byId(tid);
      if (!t) return;
      const from = t.items.findIndex((i) => i.id === fromId);
      if (from < 0) return;
      const [moved] = t.items.splice(from, 1);
      const clamped = Math.max(0, Math.min(t.items.length, toIndex));
      t.items.splice(clamped, 0, moved);
      t.sort = null;
    },

    setGroupDone(items: Item[], val: boolean) { for (const it of items) it.done = val; },

    clearRun() { state = defaultState(); },
    importRun(saved: unknown) { state = migrate(saved); },
  };
}

export const run = createRun();
