<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { aggregate, enabledDesc, ALL_SIZES } from '../lib/crate';
  import ItemRow from './ItemRow.svelte';
  import type { Trip } from '../lib/types';

  let { trip }: { trip: Trip } = $props();

  const sizes = $derived(enabledDesc(trip.sizes));
  const sub = $derived(aggregate(trip.items.map((it) => ({ it, sizes: trip.sizes }))));
  const colCount = $derived(6 + sizes.length + 3);

  // fixed column widths (the resizable three come from run.state.colW)
  const FX = { drag: 24, m: 30, scu: 70, size: 42, crates: 62, done: 28, del: 34 };
  const tableW = $derived(
    FX.drag + FX.m + run.state.colW.commodity + FX.scu + run.state.colW.source + run.state.colW.destination +
    sizes.length * FX.size + FX.crates + FX.done + FX.del,
  );

  // ---- pointer-based row drag-reorder (works with mouse + touch) ----
  let tbodyEl: HTMLTableSectionElement;
  let dragId = $state<string | null>(null);

  function startDrag(id: string, e: PointerEvent) {
    dragId = id;
    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag, { once: true });
    window.addEventListener('pointercancel', endDrag, { once: true });
  }
  function onMove(e: PointerEvent) {
    if (!dragId || !tbodyEl) return;
    const rows = [...tbodyEl.querySelectorAll<HTMLElement>('tr.item-row')].filter((r) => r.dataset.id !== dragId);
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const b = rows[i].getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { idx = i; break; }
    }
    run.reorder(trip.id, dragId, idx);
  }
  function endDrag() {
    window.removeEventListener('pointermove', onMove);
    dragId = null;
  }

  // ---- column resize (shared width across all trips, via run.state.colW) ----
  function startResize(key: 'commodity' | 'source' | 'destination', e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = run.state.colW[key];
    const move = (ev: PointerEvent) => run.setColW(key, startW + (ev.clientX - startX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function removeTrip() {
    if (trip.items.length && !confirm(`Remove “${trip.name || 'this trip'}” and its ${trip.items.length} item(s)?`)) return;
    if (!run.removeTrip(trip.id)) alert('Keep at least one trip.');
  }
  const arrow = (k: string) => (trip.sort && trip.sort.key === k ? (trip.sort.dir === 'asc' ? '▲' : '▼') : '');
</script>

<div class="mission" data-sec={trip.id}>
  <div class="panel">
    <div class="sec-top">
      <input class="sec-name" placeholder="Trip name" spellcheck="false"
        value={trip.name} oninput={(e) => run.renameTrip(trip.id, e.currentTarget.value)} />
      <span class="sec-sub">{sub.scu.toLocaleString()} SCU · {sub.crates} crate{sub.crates === 1 ? '' : 's'}</span>
      <button class="sec-del" title="Remove trip" onclick={removeTrip}>✕</button>
    </div>

    <div class="limit-label">Crate sizes allowed <span class="ll-hint">— click a size to switch it on / off (crates fill largest-first)</span></div>
    <div class="toggles">
      {#each ALL_SIZES as s}
        <button type="button" class="toggle" class:on={trip.sizes[s]} aria-pressed={trip.sizes[s]}
          title={(trip.sizes[s] ? 'Enabled' : 'Disabled') + ` — click to ${trip.sizes[s] ? 'disable' : 'enable'} ${s} SCU crates`}
          onclick={() => run.toggleSize(trip.id, s)}>
          <span class="tg-check">✓</span>
          <span class="num">{s}</span>
          <span class="lbl">SCU</span>
          <span class="tg-state">{trip.sizes[s] ? 'ON' : 'OFF'}</span>
        </button>
      {/each}
    </div>

    <div class="tbl-scroll">
      <table class="tbl" style="table-layout:fixed;width:{tableW}px">
        <colgroup>
          <col style="width:{FX.drag}px" /><col style="width:{FX.m}px" />
          <col style="width:{run.state.colW.commodity}px" /><col style="width:{FX.scu}px" />
          <col style="width:{run.state.colW.source}px" /><col style="width:{run.state.colW.destination}px" />
          {#each sizes as _s}<col style="width:{FX.size}px" />{/each}
          <col style="width:{FX.crates}px" /><col style="width:{FX.done}px" /><col style="width:{FX.del}px" />
        </colgroup>
        <thead>
          <tr>
            <th class="drag-col"></th>
            <th class="m-col sortable" title="Mission #" onclick={() => run.sortTrip(trip.id, 'mission')}>M <span class="arrow">{arrow('mission')}</span></th>
            <th class="sortable rcol" onclick={() => run.sortTrip(trip.id, 'commodity')}>Commodity <span class="arrow">{arrow('commodity')}</span>
              <button type="button" class="col-resizer" tabindex="-1" aria-label="Resize column" title="Drag to resize" onpointerdown={(e) => startResize('commodity', e)} onclick={(e) => e.stopPropagation()}></button></th>
            <th class="sortable th-scu" onclick={() => run.sortTrip(trip.id, 'scu')}>SCU <span class="arrow">{arrow('scu')}</span></th>
            <th class="sortable rcol" onclick={() => run.sortTrip(trip.id, 'source')}>From <span class="arrow">{arrow('source')}</span>
              <button type="button" class="col-resizer" tabindex="-1" aria-label="Resize column" title="Drag to resize" onpointerdown={(e) => startResize('source', e)} onclick={(e) => e.stopPropagation()}></button></th>
            <th class="sortable rcol" onclick={() => run.sortTrip(trip.id, 'destination')}>To <span class="arrow">{arrow('destination')}</span>
              <button type="button" class="col-resizer" tabindex="-1" aria-label="Resize column" title="Drag to resize" onpointerdown={(e) => startResize('destination', e)} onclick={(e) => e.stopPropagation()}></button></th>
            {#each sizes as s}<th class="szcol" title="{s} SCU crates">{s}</th>{/each}
            <th class="th-crates">Crates</th><th class="done-col" title="Complete">✓</th><th></th>
          </tr>
        </thead>
        <tbody bind:this={tbodyEl}>
          {#if trip.items.length === 0}
            <tr class="empty-row"><td colspan={colCount}>No cargo on this trip yet.</td></tr>
          {:else}
            {#each trip.items as item (item.id)}
              <ItemRow {trip} {item} {sizes} {dragId} onGripDown={startDrag} />
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <div class="add-row-wrap">
      <button class="btn add" onclick={() => run.addItem(trip.id)}>+ Add Commodity</button>
    </div>
  </div>
</div>
