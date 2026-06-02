<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { catalog } from '../stores/catalog.svelte';
  import { fitTarget, maxCrateSize } from '../lib/crate';
  import { missionRollups } from '../lib/missions';
  import { nameKey, scuKeyOf, shipCap, shipGridOf } from '../lib/catalog';
  import { ALL_SIZES } from '../lib/crate';
  import Field from './Field.svelte';
  import type { CatalogRow } from '../lib/types';

  let { openGrid }: { openGrid: (name: string) => void } = $props();

  // In 'mission' mode the per-mission assignment lives in the Missions panel; here we size
  // the global fleet for the single largest mission (parallel to 'largest trip').
  const tgt = $derived.by(() => {
    if (run.state.fitMode === 'mission') {
      const rs = missionRollups(run.state.sections).filter((r) => r.agg.scu > 0);
      if (!rs.length) return { scu: 0, label: 'largest mission', detail: '', totals: {} as Record<number, number> };
      const top = rs.reduce((m, r) => (r.agg.scu > m.agg.scu ? r : m));
      return { scu: top.agg.scu, label: 'largest mission', detail: `M${top.mission}`, totals: top.agg.totals };
    }
    return fitTarget(run.state.sections, run.state.fitMode);
  });
  const total = $derived(tgt.scu);
  const loadMax = $derived(maxCrateSize(tgt.totals));

  const nk = $derived(nameKey(catalog.ships));
  const sk = $derived(scuKeyOf(catalog.ships));

  // realistic capacity for a ship: grid sum when it has grid data, else nominal SCU
  function capOf(row: CatalogRow): number {
    const g = shipGridOf(row);
    return g.hasGrid ? g.sum : Number(row[sk]) || 0;
  }
  function sizeOk(g: ReturnType<typeof shipGridOf>): boolean {
    return loadMax === 0 || !g.hasGrid || g.maxSize == null || loadMax <= g.maxSize;
  }
  function fitsRow(row: CatalogRow): boolean {
    return total > 0 && sizeOk(shipGridOf(row)) && capOf(row) >= total;
  }
  function gridSummary(g: ReturnType<typeof shipGridOf>): string {
    const parts = ALL_SIZES.filter((s) => g.grid[s]).map((s) => `${g.grid[s]}×${s}`);
    return `Grid: ${parts.join(' + ')} = ${g.sum.toLocaleString()} SCU realistic` + (g.maxSize != null ? ` · max ${g.maxSize}` : '');
  }

  let sortKey = $state<'cap' | 'name'>('cap');
  let sortDir = $state<'asc' | 'desc'>('desc');

  const owned = $derived.by((): CatalogRow[] => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...catalog.ownedShips].sort((a, b) =>
      sortKey === 'name'
        ? dir * String(a[nk] || '').localeCompare(String(b[nk] || ''))
        : dir * (capOf(a) - capOf(b)),
    );
  });
  const best = $derived.by((): CatalogRow | null => {
    const fits = owned.filter(fitsRow);
    if (!fits.length) return null;
    return fits.reduce((m, r) => (capOf(r) < capOf(m) ? r : m));
  });
  const ordered = $derived(best ? [best, ...owned.filter((r) => r !== best)] : owned);

  function setSort(k: 'cap' | 'name') {
    if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = k; sortDir = k === 'cap' ? 'desc' : 'asc'; }
  }
  const arrow = (k: string) => (sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '');

  let addName = $state('');
  let addCap = $state('');
  function onAddName(v: string) {
    addName = v;
    const c = shipCap(catalog.ships, v);
    if (c != null && !addCap) addCap = String(c);
  }
  function doAdd() {
    const nm = addName.trim();
    if (!nm) return;
    catalog.addOwnedShip(nm, addCap !== '' ? Number(addCap) || 0 : null);
    addName = '';
    addCap = '';
  }
</script>

<div class="panel">
  <div class="fleet-top">
    <div class="fit-target">
      {#if total > 0}
        Sizing a hull for <b>{total.toLocaleString()} SCU</b>{#if loadMax > 0} (largest crate {loadMax} SCU){/if} — {tgt.label}{#if tgt.detail} (<b>{tgt.detail}</b>){/if}
      {:else}
        Add cargo to size a ship.
      {/if}
    </div>
    <div class="seg">
      <button class="seg-btn" class:active={run.state.fitMode === 'mission'} onclick={() => run.setFitMode('mission')}>Per mission</button>
      <button class="seg-btn" class:active={run.state.fitMode === 'largest'} onclick={() => run.setFitMode('largest')}>Largest trip</button>
      <button class="seg-btn" class:active={run.state.fitMode === 'combined'} onclick={() => run.setFitMode('combined')}>Combined total</button>
    </div>
  </div>
  <table class="ship-tbl">
    <thead>
      <tr>
        <th class="sortable" onclick={() => setSort('name')}>Ship <span class="arrow">{arrow('name')}</span></th>
        <th class="sortable" onclick={() => setSort('cap')}>Capacity (SCU) <span class="arrow">{arrow('cap')}</span></th>
        <th>Fits?</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#if ordered.length === 0}
        <tr class="empty-row"><td colspan="4">No owned ships yet — add one below (saved only in your browser).</td></tr>
      {/if}
      {#each ordered as row (row[nk])}
        {@const g = shipGridOf(row)}
        {@const cap = capOf(row)}
        {@const fits = fitsRow(row)}
        {@const isBest = row === best && fits}
        {@const tooBig = total > 0 && g.hasGrid && loadMax > 0 && g.maxSize != null && loadMax > g.maxSize}
        <tr class="ship-row" class:too-small={total > 0 && !fits} class:pinned={isBest}>
          <td><span class="ship-name">{row[nk]}</span></td>
          <td>
            <div class="cap-cell">
              <Field cls="cap" value={String(Number(row[sk]) || 0)} inputmode="numeric" oninput={(v) => catalog.setCap(row[nk], Number(v) || 0)} />
              {#if g.hasGrid}<span class="grid-chip" title={gridSummary(g)}>▦ {g.sum.toLocaleString()}{#if g.maxSize != null} · max {g.maxSize}{/if}</span>{/if}
            </div>
          </td>
          <td>
            {#if total === 0}<span class="fit no">—</span>
            {:else if tooBig}<span class="fit no" title="Load contains a {loadMax} SCU crate; this ship only takes up to {g.maxSize}">✕ needs ≤{g.maxSize}</span>
            {:else if isBest}<span class="fit best">★ Best Fit</span>
            {:else if cap >= total}<span class="fit yes">✓ Fits</span>
            {:else}<span class="fit no">✕ Short {(total - cap).toLocaleString()}</span>{/if}
          </td>
          <td class="ship-actions">
            <button class="row-del" title="Edit cargo grid" aria-label="Edit cargo grid" onclick={() => openGrid(row[nk])}>▦</button>
            <button class="row-del" title="Remove from fleet" onclick={() => catalog.removeOwned(row[nk])}>✕</button>
          </td>
        </tr>
      {/each}
      <tr class="add-ship-row">
        <td><Field bind:value={addName} list="shipList" placeholder="add a ship you own…" oninput={onAddName} onkeydown={(e) => { if (e.key === 'Enter') doAdd(); }} /></td>
        <td><Field cls="cap" bind:value={addCap} placeholder="SCU" inputmode="numeric" onkeydown={(e) => { if (e.key === 'Enter') doAdd(); }} /></td>
        <td><button class="btn add sm" onclick={doAdd}>Add</button></td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <div class="mini-note">Owned ships live only in your browser (a delta over the server's baseline). <b>Capacity</b> uses each ship's <b>cargo grid</b> when set (▦ = realistic SCU + max container size); otherwise nominal SCU. Click <b>▦</b> on a row — or “Edit ship data” in the ⚙ menu — to record a grid; <b>Export catalog CSVs</b> to push it to the master set.</div>
</div>
