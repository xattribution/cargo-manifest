<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { aggregate, flatEntries, deliveredScu } from '../lib/crate';
  import { summaryText, sizeLine } from '../lib/format';
  import Missions from './Missions.svelte';

  const agg = $derived(aggregate(flatEntries(run.state.sections)));
  const delivered = $derived(deliveredScu(run.state.sections));
  const coms = $derived.by(() => {
    const s = new Set<string>();
    for (const sec of run.state.sections) for (const it of sec.items) { const c = (it.commodity || '').trim().toLowerCase(); if (c) s.add(c); }
    return s.size;
  });
  const dests = $derived.by(() => {
    const s = new Set<string>();
    for (const sec of run.state.sections) for (const it of sec.items) { const d = (it.destination || '').trim().toLowerCase(); if (d) s.add(d); }
    return s.size;
  });

  let copied = $state(false);
  async function copy() {
    try { await navigator.clipboard.writeText(summaryText(run.state)); copied = true; setTimeout(() => (copied = false), 1400); }
    catch { alert(summaryText(run.state)); }
  }
</script>

<div class="ov">
  <div class="ov-stats">
    <div class="stat s-cargo"><div class="v">{agg.scu.toLocaleString()}</div><div class="k">SCU</div></div>
    <div class="stat"><div class="v">{agg.crates}</div><div class="k">Crates</div></div>
    <div class="stat"><div class="v">{coms}</div><div class="k">Commodities</div></div>
    <div class="stat"><div class="v">{dests}</div><div class="k">Destinations</div></div>
    {#if delivered > 0}
      <div class="stat s-done"><div class="v">{delivered.toLocaleString()}</div><div class="k">Delivered</div></div>
    {/if}
    <div class="ov-sizes">
      {#if sizeLine(agg.totals)}<span class="sz-line">{sizeLine(agg.totals)}</span>{/if}
      {#if agg.leftover > 0}<span class="sz-line sz-warn">{agg.leftover} unpacked</span>{/if}
      <button class="btn ghost sm copy" onclick={copy}>{copied ? 'Copied ✓' : 'Copy summary'}</button>
    </div>
  </div>

  <Missions />
</div>
