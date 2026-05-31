<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { aggregate, enabledDesc, ALL_SIZES } from '../lib/crate';
  import ItemRow from './ItemRow.svelte';
  import type { Trip } from '../lib/types';

  let { trip }: { trip: Trip } = $props();

  const sizes = $derived(enabledDesc(trip.sizes));
  const sub = $derived(aggregate(trip.items.map((it) => ({ it, sizes: trip.sizes }))));
  const colCount = $derived(6 + sizes.length + 3);

  let dragId = $state<string | null>(null);
  const onDragStart = (id: string) => (dragId = id);
  function onDragOver(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const idx = trip.items.findIndex((i) => i.id === targetId);
    if (idx >= 0) run.reorder(trip.id, dragId, idx);
  }
  const onDragEnd = () => (dragId = null);

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

    <div class="limit-label">Crate sizes allowed on this trip</div>
    <div class="toggles">
      {#each ALL_SIZES as s}
        <div class="toggle" class:on={trip.sizes[s]} role="button" tabindex="0"
          onclick={() => run.toggleSize(trip.id, s)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run.toggleSize(trip.id, s); } }}>
          <span class="num">{s}</span><span class="lbl">SCU</span>
        </div>
      {/each}
    </div>

    <div class="tbl-scroll">
      <table class="tbl" style="table-layout:fixed">
        <colgroup>
          <col style="width:24px" /><col style="width:30px" />
          <col style="width:{run.state.colW.commodity}px" /><col style="width:70px" />
          <col style="width:{run.state.colW.source}px" /><col style="width:{run.state.colW.destination}px" />
          {#each sizes as _s}<col style="width:42px" />{/each}
          <col style="width:62px" /><col style="width:28px" /><col style="width:34px" />
        </colgroup>
        <thead>
          <tr>
            <th class="drag-col"></th>
            <th class="m-col sortable" title="Mission #" onclick={() => run.sortTrip(trip.id, 'mission')}>M <span class="arrow">{arrow('mission')}</span></th>
            <th class="sortable" onclick={() => run.sortTrip(trip.id, 'commodity')}>Commodity <span class="arrow">{arrow('commodity')}</span></th>
            <th class="sortable th-scu" onclick={() => run.sortTrip(trip.id, 'scu')}>SCU <span class="arrow">{arrow('scu')}</span></th>
            <th class="sortable" onclick={() => run.sortTrip(trip.id, 'source')}>From <span class="arrow">{arrow('source')}</span></th>
            <th class="sortable" onclick={() => run.sortTrip(trip.id, 'destination')}>To <span class="arrow">{arrow('destination')}</span></th>
            {#each sizes as s}<th class="szcol" title="{s} SCU crates">{s}</th>{/each}
            <th class="th-crates">Crates</th><th class="done-col" title="Complete">✓</th><th></th>
          </tr>
        </thead>
        <tbody>
          {#if trip.items.length === 0}
            <tr class="empty-row"><td colspan={colCount}>No cargo on this trip yet.</td></tr>
          {:else}
            {#each trip.items as item (item.id)}
              <ItemRow {trip} {item} {sizes} {dragId} {onDragStart} {onDragOver} {onDragEnd} />
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
