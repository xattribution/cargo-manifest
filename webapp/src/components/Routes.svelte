<script lang="ts">
  // Pick Up (left) and Drop Off (right), side by side with a divider between.
  // Pick-up checks are a visual collected-reminder; drop-off checks are the real completion.
  // When the Missions "Submit %" slider is < 100, the Drop Off column runs the route optimizer
  // (lib/optimize) to highlight the fewest-stop / least-cargo destinations that hit the target.
  import { run } from '../stores/run.svelte';
  import { aggregate, groupEntries } from '../lib/crate';
  import { optimizeDropoff, type DestStat } from '../lib/optimize';
  import GroupSection from './GroupSection.svelte';

  const pct = $derived(run.state.completionPct);

  const destStats = $derived.by((): DestStat[] => {
    const m = groupEntries(run.state.sections, 'destination');
    const out: DestStat[] = [];
    for (const [key, list] of m) {
      const agg = aggregate(list);
      const missions = new Set<number>();
      for (const e of list) missions.add(Math.max(1, Math.min(10, Number(e.it.mission) || 1)));
      out.push({ key, scu: agg.scu, totals: agg.totals, missions });
    }
    return out;
  });

  const opt = $derived(optimizeDropoff(destStats, pct));
</script>

<section class="zone routes-zone" style="--accent:var(--c-pickup)">
  <div class="routes">
    <div class="route-col" style="--accent:var(--c-pickup)">
      <div class="route-head">
        <h2 class="zone-title">Pick Up</h2>
        <span class="route-sub">by source</span>
      </div>
      <GroupSection field="source" cls="src" mode="pickup" labelField="commodity" otherField="destination" otherPrefix="to" />
    </div>

    <div class="route-divider" aria-hidden="true"></div>

    <div class="route-col" style="--accent:var(--c-dropoff)">
      <div class="route-head">
        <h2 class="zone-title">Drop Off</h2>
        <span class="route-sub">by destination</span>
        {#if opt.active}
          <span class="route-opt" title="At {opt.pct}% you need to deliver {opt.target.toLocaleString()} of {opt.total.toLocaleString()} SCU. Best route is highlighted; greyed stops can't reach the target alone.">
            ◎ {opt.pct}% route · target {opt.target.toLocaleString()} SCU
          </span>
        {/if}
      </div>
      <GroupSection field="destination" cls="dest" mode="dropoff" labelField="commodity" otherField="source" otherPrefix="from" {opt} />
    </div>
  </div>
</section>
