<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { catalog } from '../stores/catalog.svelte';
  import { missionRollups } from '../lib/missions';
  import { missionColor, missionFg } from '../lib/mission';
  import { ALL_SIZES } from '../lib/crate';
  import { nameKey, shipFit } from '../lib/catalog';
  import type { CatalogRow } from '../lib/types';

  const rollups = $derived(missionRollups(run.state.sections));
  const nk = $derived(nameKey(catalog.ships));
  // only show size columns actually used by any mission, to keep it tight
  const cols = $derived(ALL_SIZES.filter((s) => rollups.some((r) => r.agg.totals[s])));
  const totalScu = $derived(rollups.reduce((a, r) => a + r.agg.scu, 0));
  const totalReward = $derived(rollups.reduce((a, r) => a + (run.state.missionRewards[r.mission] || 0), 0));

  function rowFor(name: string): CatalogRow | null {
    const key = (name || '').trim().toLowerCase();
    if (!key) return null;
    return catalog.ships.rows.find((r) => String(r[nk] || '').trim().toLowerCase() === key) || null;
  }
</script>

{#if rollups.length === 0}
  <div class="mp-empty">Tag cargo lines with a mission # to see per-mission totals.</div>
{:else}
  <div class="tbl-scroll">
    <table class="mtbl">
      <thead>
        <tr>
          <th class="mt-id">#</th>
          <th>Mission</th>
          <th class="mt-num">SCU</th>
          {#each cols as s}<th class="mt-sz">{s}</th>{/each}
          <th class="mt-num">Box</th>
          <th class="mt-rt">Pick→Drop</th>
          <th class="mt-ship">Ship</th>
          <th class="mt-fit">Fit</th>
          <th class="mt-rew">Reward</th>
        </tr>
      </thead>
      <tbody>
        {#each rollups as r (r.mission)}
          {@const c = missionColor(r.mission)}
          {@const ship = run.state.missionShips[r.mission] || ''}
          {@const row = rowFor(ship)}
          {@const fit = row ? shipFit(row, r.agg.scu, r.maxSize) : null}
          <tr class="mrow" style="--mc:{c};--mfg:{missionFg(c)}">
            <td class="mt-id">{r.mission}</td>
            <td><input class="mname-in" placeholder="Mission {r.mission}" value={run.state.missionNames[r.mission] || ''}
              oninput={(e) => run.setMissionName(r.mission, e.currentTarget.value)} spellcheck="false" /></td>
            <td class="mt-num strong">{r.agg.scu.toLocaleString()}</td>
            {#each cols as s}<td class="mt-sz">{r.agg.totals[s] || ''}</td>{/each}
            <td class="mt-num">{r.agg.crates}{#if r.agg.leftover > 0}<span class="mt-left" title="{r.agg.leftover} unpacked">+{r.agg.leftover}</span>{/if}</td>
            <td class="mt-rt">{r.sources}→{r.dests}</td>
            <td class="mt-ship"><input class="mship-in" list="shipList" placeholder="—" value={ship}
              oninput={(e) => run.setMissionShip(r.mission, e.currentTarget.value)} spellcheck="false" /></td>
            <td class="mt-fit">
              {#if !ship}<span class="dot none"></span>
              {:else if !row}<span class="badge warn" title="Not in catalog">?</span>
              {:else if fit && fit.status === 'fits'}<span class="badge ok">✓</span>
              {:else if fit && fit.status === 'oversize'}<span class="badge bad" title="Box too large (ship max {fit.maxSize})">≤{fit.maxSize}</span>
              {:else if fit}<span class="badge bad" title="Short {fit.short} SCU">−{fit.short.toLocaleString()}</span>
              {/if}
            </td>
            <td class="mt-rew">
              <span class="cur">¤</span><input class="mrew-in" inputmode="numeric" placeholder="—"
                value={run.state.missionRewards[r.mission] ?? ''}
                oninput={(e) => run.setMissionReward(r.mission, Number(e.currentTarget.value.replace(/[.,]/g, '')) || null)} />
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr class="mfoot">
          <td></td><td>Total</td>
          <td class="mt-num strong">{totalScu.toLocaleString()}</td>
          {#each cols as _s}<td></td>{/each}
          <td></td><td></td><td></td><td></td>
          <td class="mt-rew strong"><span class="cur">¤</span>{totalReward.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>
  </div>
{/if}
