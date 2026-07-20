<script lang="ts">
  import { onMount } from 'svelte';
  import { catalog } from '../stores/catalog.svelte';
  import { nameKey, scuKeyOf, shipGridOf } from '../lib/catalog';
  import { ALL_SIZES } from '../lib/crate';
  import Modal from './Modal.svelte';

  let { initialName = '', onClose }: { initialName?: string; onClose: () => void } = $props();

  let sel = $state('');
  let maxSize = $state('');
  let counts = $state<Record<number, string>>({ 32: '', 24: '', 16: '', 8: '', 4: '', 2: '', 1: '' });

  function rowFor(name: string) {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    const nk = nameKey(catalog.ships);
    return catalog.ships.rows.find((r) => String(r[nk] || '').trim().toLowerCase() === key) || null;
  }
  function loadFrom(name: string) {
    const row = rowFor(name);
    const next: Record<number, string> = { 32: '', 24: '', 16: '', 8: '', 4: '', 2: '', 1: '' };
    if (row) {
      const g = shipGridOf(row);
      maxSize = g.maxSize != null ? String(g.maxSize) : '';
      for (const s of ALL_SIZES) next[s] = g.grid[s] ? String(g.grid[s]) : '';
    } else {
      maxSize = '';
    }
    counts = next;
  }
  onMount(() => { sel = initialName; if (initialName) loadFrom(initialName); });

  const selRow = $derived(rowFor(sel));
  const nominalScu = $derived(selRow ? Number(selRow[scuKeyOf(catalog.ships)]) || 0 : null);
  const gridTotal = $derived(ALL_SIZES.reduce((sum, s) => sum + s * (Number(counts[s]) || 0), 0));
  const suggestedMax = $derived(ALL_SIZES.find((s) => (Number(counts[s]) || 0) > 0) ?? null);
  const over = $derived(nominalScu != null && gridTotal > nominalScu);

  function save() {
    const name = sel.trim();
    if (!name) return;
    const grid: Record<number, number> = {};
    for (const s of ALL_SIZES) { const n = Math.max(0, Math.floor(Number(counts[s]) || 0)); if (n > 0) grid[s] = n; }
    const maxVal = maxSize !== '' ? Number(maxSize) || null : suggestedMax;
    catalog.setShipGrid(name, { scu: null, maxSize: maxVal, grid });
    onClose();
  }
  function clearGrid() {
    if (sel.trim()) catalog.clearShipGrid(sel);
    loadFrom(sel);
  }
</script>

<Modal title="Edit ship cargo grid" {onClose}>
  <p>Record the most efficient real arrangement: the <b>max container size</b> the ship takes, then how many of each size fit when the grid is full (leave blanks for sizes that don’t apply; small leftovers go in the smaller sizes). Saved in your browser; use <b>Export catalog CSVs</b> (⚙) to push it to the master set.</p>

  <label class="modal-label" for="ge-ship">Ship</label>
  <input id="ge-ship" class="modal-input" list="shipList" bind:value={sel} onchange={() => loadFrom(sel)} spellcheck="false" placeholder="type a ship name…" />
  <div class="ge-scu">
    {#if selRow}Nominal capacity: <b>{nominalScu?.toLocaleString()} SCU</b>{:else}<span style="color:var(--amber)">Not in catalog yet — saving will create a grid entry for it.</span>{/if}
  </div>

  <label class="modal-label" style="margin-top:14px" for="ge-max">Max container size</label>
  <input id="ge-max" class="modal-input ge-max" type="number" min="1" bind:value={maxSize}
    placeholder={suggestedMax ? `auto: ${suggestedMax}` : 'e.g. 16'} />

  <div class="modal-label" style="margin-top:14px">Grid arrangement (count per size)</div>
  <div class="ge-grid">
    {#each ALL_SIZES as s}
      <label class="ge-cell">
        <span class="ge-size">{s}</span>
        <input class="ge-num" type="number" min="0" inputmode="numeric" bind:value={counts[s]} placeholder="—" />
      </label>
    {/each}
  </div>

  <div class="ge-total" class:over>
    Grid total: <b>{gridTotal.toLocaleString()} SCU</b>
    {#if nominalScu != null} / {nominalScu.toLocaleString()} nominal{/if}
    {#if over}<span class="ge-warn"> ⚠ exceeds nominal capacity</span>{/if}
  </div>

  <div class="modal-actions">
    <button class="btn danger" onclick={clearGrid}>Clear grid</button>
    <button class="btn" onclick={onClose}>Cancel</button>
    <button class="btn accent" onclick={save}>Save grid</button>
  </div>
</Modal>
