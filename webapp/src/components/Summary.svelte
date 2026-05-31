<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { aggregate, flatEntries, ALL_SIZES } from '../lib/crate';
  import { summaryText } from '../lib/format';

  const agg = $derived(aggregate(flatEntries(run.state.sections)));
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
  const sizeTots = $derived(ALL_SIZES.filter((s) => agg.totals[s]).map((s) => ({ s, n: agg.totals[s] })));

  let copied = $state(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(summaryText(run.state));
      copied = true;
      setTimeout(() => (copied = false), 1400);
    } catch {
      alert(summaryText(run.state));
    }
  }
</script>

<section>
  <div class="sec-head"><div class="bar"></div><h2>Loadout Summary</h2>
    <span class="hint">every trip combined, for picking a hull</span></div>
  <div class="panel">
    <div class="summary-grid">
      <div class="stat accent"><div class="k">Total Cargo</div><div class="v">{agg.scu.toLocaleString()} <small>SCU</small></div></div>
      <div class="stat"><div class="k">Total Crates</div><div class="v">{agg.crates}</div></div>
      <div class="stat amber"><div class="k">Commodities</div><div class="v">{coms}</div></div>
      <div class="stat"><div class="k">Destinations</div><div class="v">{dests}</div></div>
    </div>
    <div class="size-totals">
      {#if sizeTots.length === 0}
        <span style="color:var(--txt-faint);font-size:13px">No crates yet.</span>
      {:else}
        {#each sizeTots as t}<div class="size-tot"><b>{t.n}</b> <span>× {t.s} SCU</span></div>{/each}
      {/if}
    </div>
    {#if agg.leftover > 0}
      <div class="leftover-warn">⚠ {agg.leftover} SCU can't be packed with the crate sizes enabled in their trip. Turn on a smaller size (e.g. 1 SCU) to clear the remainder.</div>
    {/if}
    <div class="footer-actions" style="margin-top:16px">
      <button class="btn accent" onclick={copy}>{copied ? 'Copied ✓' : 'Copy Summary Text'}</button>
    </div>
  </div>
</section>
