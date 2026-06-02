<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { catalog } from '../stores/catalog.svelte';
  import { fitTarget, maxCrateSize, ALL_SIZES } from '../lib/crate';
  import { missionRollups } from '../lib/missions';
  import { nameKey, scuKeyOf, shipCap, shipGridOf, shipFit } from '../lib/catalog';
  import Field from './Field.svelte';
  import type { CatalogRow } from '../lib/types';

  let { openGrid }: { openGrid: (name: string) => void } = $props();

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

  function capOf(row: CatalogRow): number {
    const g = shipGridOf(row);
    return g.hasGrid ? g.sum : Number(row[sk]) || 0;
  }
  const owned = $derived.by((): CatalogRow[] =>
    [...catalog.ownedShips].sort((a, b) => capOf(b) - capOf(a)));
  const best = $derived.by((): CatalogRow | null => {
    const fits = owned.filter((r) => shipFit(r, total, loadMax).status === 'fits');
    if (!fits.length) return null;
    return fits.reduce((m, r) => (capOf(r) < capOf(m) ? r : m));
  });
  const ordered = $derived(best ? [best, ...owned.filter((r) => r !== best)] : owned);

  let expanded = $state<string | null>(null);
  const toggle = (name: string) => (expanded = expanded === name ? null : name);

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
    addName = ''; addCap = '';
  }
  const fitModes = [
    { k: 'mission', l: 'Per mission' },
    { k: 'largest', l: 'Largest trip' },
    { k: 'combined', l: 'Combined' },
  ] as const;
</script>

<div class="fleet">
  <div class="fleet-hd">
    <span class="fleet-title">Fleet</span>
    <span class="fleet-tgt">{total > 0 ? `${total.toLocaleString()} SCU` : '—'}</span>
  </div>

  <div class="fitseg">
    {#each fitModes as m}
      <button class="fitseg-b" class:on={run.state.fitMode === m.k} onclick={() => run.setFitMode(m.k)}>{m.l}</button>
    {/each}
  </div>

  <div class="ships">
    {#if ordered.length === 0}
      <div class="ships-empty">No ships yet. Add one below.</div>
    {/if}
    {#each ordered as row (row[nk])}
      {@const g = shipGridOf(row)}
      {@const cap = capOf(row)}
      {@const fit = shipFit(row, total, loadMax)}
      {@const isBest = row === best && fit.status === 'fits'}
      {@const open = expanded === row[nk]}
      <div class="shipc" class:best={isBest} class:dim={total > 0 && fit.status !== 'fits'} class:open>
        <button class="shipc-row" onclick={() => toggle(row[nk])} title="Edit">
          <span class="sfit"
            class:ok={fit.status === 'fits'} class:bad={total > 0 && fit.status !== 'fits'}>
            {#if isBest}★{:else if fit.status === 'fits'}✓{:else if total === 0}–{:else}✕{/if}
          </span>
          <span class="sname">{row[nk]}</span>
          <span class="scap">{cap.toLocaleString()}{#if g.hasGrid}<i class="gridmark" title="Cargo grid set">▦</i>{/if}</span>
        </button>
        {#if open}
          <div class="shipc-edit">
            <label class="se-row">SCU<Field cls="cap" value={String(Number(row[sk]) || 0)} inputmode="numeric"
              oninput={(v) => catalog.setCap(row[nk], Number(v) || 0)} /></label>
            {#if g.hasGrid}<div class="se-grid">{ALL_SIZES.filter((s) => g.grid[s]).map((s) => `${g.grid[s]}×${s}`).join(' ')}{#if g.maxSize != null} · max {g.maxSize}{/if}</div>{/if}
            <div class="se-act">
              <button class="btn ghost xs" onclick={() => openGrid(row[nk])}>▦ Grid</button>
              <button class="btn ghost xs danger" onclick={() => { catalog.removeOwned(row[nk]); expanded = null; }}>Remove</button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="add-ship">
    <Field bind:value={addName} list="shipList" placeholder="Add ship…" oninput={onAddName}
      onkeydown={(e) => { if (e.key === 'Enter') doAdd(); }} />
    <input class="add-cap" inputmode="numeric" placeholder="SCU" bind:value={addCap}
      onkeydown={(e) => { if (e.key === 'Enter') doAdd(); }} />
    <button class="btn accent xs" onclick={doAdd}>+</button>
  </div>
</div>
