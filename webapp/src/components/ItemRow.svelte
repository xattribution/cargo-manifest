<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { breakdown, crateCount } from '../lib/crate';
  import { missionColor, missionFg } from '../lib/mission';
  import Field from './Field.svelte';
  import type { Trip, Item } from '../lib/types';

  let {
    trip, item, sizes, dragId, onGripDown,
  }: {
    trip: Trip;
    item: Item;
    sizes: number[];
    dragId: string | null;
    onGripDown: (id: string, e: PointerEvent) => void;
  } = $props();

  const bd = $derived(breakdown(item.scu, trip.sizes));
  const color = $derived(missionColor(item.mission));
  const fg = $derived(missionFg(color));

  function setMission(v: string) { item.mission = Math.max(1, Math.min(10, parseInt(v) || 1)); }
</script>

<tr
  class="item-row colored"
  class:done={item.done}
  class:dragging={dragId === item.id}
  data-id={item.id}
  style="--rowbg:{color}; --rowfg:{fg}"
>
  <td class="drag-cell">
    <span class="grip" role="button" tabindex="-1" aria-label="Drag to reorder" title="Drag to reorder"
      onpointerdown={(e) => onGripDown(item.id, e)}>⠿</span>
  </td>
  <td class="m-cell">
    <input class="m-num" type="number" min="1" max="10" title="Mission # (1–10) — same number = same color"
      data-f="mission" data-row={item.id} value={item.mission} oninput={(e) => setMission(e.currentTarget.value)} />
  </td>
  <td><Field bind:value={item.commodity} list="commodityList" cat="commodities" placeholder="commodity" dataF="commodity" dataRow={item.id} /></td>
  <td><Field bind:value={item.scu} cls="scu" placeholder="0" inputmode="numeric" dataF="scu" dataRow={item.id} /></td>
  <td><Field bind:value={item.source} list="locationList" cat="locations" placeholder="pickup" dataF="source" dataRow={item.id} /></td>
  <td><Field bind:value={item.destination} list="locationList" cat="locations" placeholder="dropoff" dataF="destination" dataRow={item.id} /></td>
  {#each sizes as s}
    <td class="szcell" data-size={s}>{bd.counts[s] ? bd.counts[s] : ''}</td>
  {/each}
  <td class="ncount">
    {crateCount(bd.counts) || '—'}{#if bd.leftover > 0}<span class="leftover-mark" title="{bd.leftover} SCU couldn't be packed with these sizes">+{bd.leftover}u</span>{/if}
  </td>
  <td class="done-cell"><input type="checkbox" class="donebox" bind:checked={item.done} title="Mark complete" /></td>
  <td><button class="row-del" title="Remove" onclick={() => run.removeItem(trip.id, item.id)}>✕</button></td>
</tr>
