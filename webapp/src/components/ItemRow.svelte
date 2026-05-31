<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { breakdown, crateCount } from '../lib/crate';
  import { missionColor, missionFg } from '../lib/mission';
  import Field from './Field.svelte';
  import type { Trip, Item } from '../lib/types';

  let {
    trip, item, sizes, dragId, onDragStart, onDragOver, onDragEnd,
  }: {
    trip: Trip;
    item: Item;
    sizes: number[];
    dragId: string | null;
    onDragStart: (id: string) => void;
    onDragOver: (id: string) => void;
    onDragEnd: () => void;
  } = $props();

  const bd = $derived(breakdown(item.scu, trip.sizes));
  const color = $derived(missionColor(item.mission));
  const fg = $derived(missionFg(color));
  let draggable = $state(false);

  function setMission(v: string) { item.mission = Math.max(1, Math.min(10, parseInt(v) || 1)); }
</script>

<tr
  class="item-row colored"
  class:done={item.done}
  class:dragging={dragId === item.id}
  style="background:{color}; --rowfg:{fg}"
  draggable={draggable}
  ondragstart={(e) => { onDragStart(item.id); e.dataTransfer?.setData('text/plain', item.id); }}
  ondragover={(e) => { e.preventDefault(); onDragOver(item.id); }}
  ondragend={() => { draggable = false; onDragEnd(); }}
  ondrop={(e) => { e.preventDefault(); onDragEnd(); }}
>
  <td class="drag-cell">
    <span class="grip" role="button" tabindex="-1" aria-label="Drag to reorder" title="Drag to reorder" onmousedown={() => (draggable = true)} onmouseup={() => (draggable = false)}>⠿</span>
  </td>
  <td class="m-cell">
    <input class="m-num" type="number" min="1" max="10" title="Mission # (1–10) — same number = same colour"
      value={item.mission} oninput={(e) => setMission(e.currentTarget.value)} />
  </td>
  <td><Field bind:value={item.commodity} list="commodityList" cat="commodities" placeholder="e.g. Pressurized Ice" dataF="commodity" /></td>
  <td><Field bind:value={item.scu} cls="scu" placeholder="0" inputmode="numeric" /></td>
  <td><Field bind:value={item.source} list="locationList" cat="locations" placeholder="pickup" /></td>
  <td><Field bind:value={item.destination} list="locationList" cat="locations" placeholder="dropoff" /></td>
  {#each sizes as s}
    <td class="szcell" data-size={s}>{bd.counts[s] ? bd.counts[s] : ''}</td>
  {/each}
  <td class="ncount">
    {crateCount(bd.counts) || '—'}{#if bd.leftover > 0}<span class="leftover-mark" title="{bd.leftover} SCU couldn't be packed with these sizes">+{bd.leftover}u</span>{/if}
  </td>
  <td class="done-cell"><input type="checkbox" class="donebox" bind:checked={item.done} title="Mark complete" /></td>
  <td><button class="row-del" title="Remove" onclick={() => run.removeItem(trip.id, item.id)}>✕</button></td>
</tr>
