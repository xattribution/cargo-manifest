// Reactive catalog store (Svelte 5 runes). Implements the hybrid model: the server
// baseline is fetched once; the browser only holds a delta; the materialized categories
// (baseline ⟕ delta) are $derived and are what the UI reads. Every mutation writes the
// delta to localStorage immediately. See PARITY.md "Storage model".
import {
  fetchBaseline, materializeShips, materializeSimple, inCatalog, ownedKeyOf, isOwnedStr,
  nameKey, DEFAULT_HEADERS,
} from '../lib/catalog';
import { loadDelta, saveDelta } from '../lib/storage';
import { emptyDelta } from '../lib/types';
import type { Cat, Category, CatalogRow, CatalogDelta } from '../lib/types';

function emptyCat(cat: Cat): Category {
  return { header: DEFAULT_HEADERS[cat].slice(), rows: [] };
}

function createCatalog() {
  let baseline = $state<Record<Cat, Category>>({
    ships: emptyCat('ships'),
    commodities: emptyCat('commodities'),
    locations: emptyCat('locations'),
  });
  let delta = $state<CatalogDelta>(loadDelta());
  let loaded = $state(false);
  let source = $state<'defaults' | 'server'>('defaults');

  const ships = $derived(materializeShips(baseline.ships, delta));
  const commodities = $derived(materializeSimple(baseline.commodities, delta.commoditiesAdded));
  const locations = $derived(materializeSimple(baseline.locations, delta.locationsAdded));
  const ownedShips = $derived.by(() => {
    const ok = ownedKeyOf(ships);
    return ships.rows.filter((r) => isOwnedStr(r[ok]));
  });

  const persist = () => saveDelta($state.snapshot(delta));

  return {
    get ships() { return ships; },
    get commodities() { return commodities; },
    get locations() { return locations; },
    get ownedShips() { return ownedShips; },
    get loaded() { return loaded; },
    get source() { return source; },

    async load() {
      baseline = await fetchBaseline();
      source = baseline.ships.rows.length || baseline.commodities.rows.length ? 'server' : 'defaults';
      loaded = true;
    },

    catOf(cat: Cat): Category {
      return cat === 'ships' ? ships : cat === 'commodities' ? commodities : locations;
    },

    // ---- ships (owned + capacity) ----
    addOwnedShip(name: string, capInput: number | null) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const inBase = inCatalog(baseline.ships, trimmed);
      const cap = capInput != null ? capInput : inBase ? null : 0;
      delta.shipsOwned[trimmed.toLowerCase()] = { name: trimmed, cap, added: !inBase };
      persist();
    },
    setCap(name: string, cap: number) {
      const key = name.trim().toLowerCase();
      const o = delta.shipsOwned[key];
      if (o) { o.cap = cap; persist(); }
    },
    removeOwned(name: string) {
      const key = name.trim().toLowerCase();
      if (delta.shipsOwned[key]) { delete delta.shipsOwned[key]; persist(); }
    },

    // ---- per-ship grid / capacity data (any ship; saved in the browser, exportable to master) ----
    setShipGrid(name: string, data: { scu: number | null; maxSize: number | null; grid: Record<number, number> }) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      const hasGrid = Object.values(data.grid).some((n) => n > 0);
      if (!hasGrid && data.maxSize == null && data.scu == null) {
        delete delta.shipGrids[key];
      } else {
        delta.shipGrids[key] = { name: trimmed, scu: data.scu, maxSize: data.maxSize, grid: { ...data.grid } };
      }
      persist();
    },
    clearShipGrid(name: string) {
      const key = name.trim().toLowerCase();
      if (delta.shipGrids[key]) { delete delta.shipGrids[key]; persist(); }
    },

    // ---- commodities / locations (additions only) ----
    addCommodity(name: string): boolean {
      const v = name.trim();
      if (!v || inCatalog(commodities, v)) return false;
      const row: CatalogRow = {};
      commodities.header.forEach((h) => (row[h] = ''));
      row[nameKey(commodities)] = v;
      delta.commoditiesAdded.push(row);
      persist();
      return true;
    },
    addLocation(name: string): boolean {
      const v = name.trim();
      if (!v || inCatalog(locations, v)) return false;
      const row: CatalogRow = {};
      locations.header.forEach((h) => (row[h] = ''));
      row[nameKey(locations)] = v;
      delta.locationsAdded.push(row);
      persist();
      return true;
    },

    // Used by category-agnostic Field "+" buttons (commodities/locations only).
    addTo(cat: Cat, name: string): boolean {
      if (cat === 'commodities') return this.addCommodity(name);
      if (cat === 'locations') return this.addLocation(name);
      return false;
    },

    // "Clear my data & load defaults" — drop the entire delta (in memory + storage).
    reloadDefaults() {
      delta = emptyDelta();
      persist();
    },
  };
}

export const catalog = createCatalog();
