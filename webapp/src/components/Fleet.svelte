<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { catalog } from '../stores/catalog.svelte';
  import { fitTarget } from '../lib/crate';
  import { nameKey, scuKeyOf, shipCap } from '../lib/catalog';
  import Field from './Field.svelte';
  import type { CatalogRow } from '../lib/types';

  const tgt = $derived(fitTarget(run.state.sections, run.state.fitMode));
  const total = $derived(tgt.scu);

  let sortKey = $state<'cap' | 'name'>('cap');
  let sortDir = $state<'asc' | 'desc'>('desc');

  const nk = $derived(nameKey(catalog.ships));
  const sk = $derived(scuKeyOf(catalog.ships));

  const owned = $derived.by((): CatalogRow[] => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...catalog.ownedShips].sort((a, b) =>
      sortKey === 'name'
        ? dir * String(a[nk] || '').localeCompare(String(b[nk] || ''))
        : dir * ((Number(a[sk]) || 0) - (Number(b[sk]) || 0)),
    );
  });
  const best = $derived.by((): CatalogRow | null => {
    if (total <= 0) return null;
    const fits = owned.filter((r) => (Number(r[sk]) || 0) >= total);
    if (!fits.length) return null;
    return fits.reduce((m, r) => ((Number(r[sk]) || 0) < (Number(m[sk]) || 0) ? r : m));
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

<section>
  <div class="sec-head"><div class="bar"></div><h2>Ship Fit Check</h2>
    <span class="hint">best fit pinned on top</span>
    <span class="spacer"></span>
    <div class="seg">
      <button class="seg-btn" class:active={run.state.fitMode === 'largest'} onclick={() => run.setFitMode('largest')}>Largest trip</button>
      <button class="seg-btn" class:active={run.state.fitMode === 'combined'} onclick={() => run.setFitMode('combined')}>Combined total</button>
    </div>
  </div>
  <div class="panel">
    <div class="fit-target">
      {#if total > 0}
        Sizing a hull for <b>{total.toLocaleString()} SCU</b> — {tgt.label}{#if tgt.detail} (<b>{tgt.detail}</b>){/if}
      {:else}
        Add cargo to size a ship.
      {/if}
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
          {@const cap = Number(row[sk]) || 0}
          {@const fits = total > 0 && cap >= total}
          {@const isBest = row === best && fits}
          <tr class="ship-row" class:too-small={total > 0 && !fits} class:pinned={isBest}>
            <td><span class="ship-name">{row[nk]}</span></td>
            <td><Field cls="cap" value={String(cap)} inputmode="numeric" oninput={(v) => catalog.setCap(row[nk], Number(v) || 0)} /></td>
            <td>
              {#if total === 0}<span class="fit no">—</span>
              {:else if isBest}<span class="fit best">★ Best Fit</span>
              {:else if cap >= total}<span class="fit yes">✓ Fits</span>
              {:else}<span class="fit no">✕ Short {(total - cap).toLocaleString()}</span>{/if}
            </td>
            <td><button class="row-del" title="Remove from fleet" onclick={() => catalog.removeOwned(row[nk])}>✕</button></td>
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
    <div class="mini-note">Owned ships live only in your browser (a small delta over the server's baseline catalog). <b>Largest trip</b> sizes a hull for your biggest single trip; <b>Combined total</b> sizes for everything at once. Use <b>Export CSVs</b> to keep a copy.</div>
  </div>
</section>
