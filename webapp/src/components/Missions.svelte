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

  function rowFor(name: string): CatalogRow | null {
    const key = (name || '').trim().toLowerCase();
    if (!key) return null;
    return catalog.ships.rows.find((r) => String(r[nk] || '').trim().toLowerCase() === key) || null;
  }
  function sizeParts(totals: Record<number, number>): string {
    return ALL_SIZES.filter((s) => totals[s]).map((s) => `${totals[s]}×${s}`).join('  ');
  }
</script>

<div class="panel mission-panel">
  {#if rollups.length === 0}
    <div class="mp-empty">No missions yet — tag cargo lines with a mission # (1–10) in the Manifest below.</div>
  {:else}
    <table class="mtbl">
      <thead>
        <tr>
          <th class="mt-id">M</th>
          <th>Label</th>
          <th class="mt-num">SCU</th>
          <th class="mt-num">Crates</th>
          <th class="mt-bd">Crate breakdown</th>
          <th class="mt-num">Pick</th>
          <th class="mt-num">Drop</th>
          <th class="mt-ship">Assigned ship</th>
          <th class="mt-fit">Fit</th>
        </tr>
      </thead>
      <tbody>
        {#each rollups as r (r.mission)}
          {@const c = missionColor(r.mission)}
          {@const ship = run.state.missionShips[r.mission] || ''}
          {@const row = rowFor(ship)}
          {@const fit = row ? shipFit(row, r.agg.scu, r.maxSize) : null}
          <tr class="mrow">
            <td class="mt-id"><span class="mswatch" style="background:{c};color:{missionFg(c)}">{r.mission}</span></td>
            <td>
              <input class="mname-in" placeholder="(unnamed)" value={run.state.missionNames[r.mission] || ''}
                oninput={(e) => run.setMissionName(r.mission, e.currentTarget.value)} spellcheck="false" />
            </td>
            <td class="mt-num amber">{r.agg.scu.toLocaleString()}</td>
            <td class="mt-num">{r.agg.crates}{#if r.agg.leftover > 0}<span class="mt-left" title="{r.agg.leftover} SCU unpacked">+{r.agg.leftover}u</span>{/if}</td>
            <td class="mt-bd mono">{sizeParts(r.agg.totals) || '—'}</td>
            <td class="mt-num">{r.sources}</td>
            <td class="mt-num">{r.dests}</td>
            <td class="mt-ship">
              <input class="mship-in" list="shipList" placeholder="assign…" value={ship}
                oninput={(e) => run.setMissionShip(r.mission, e.currentTarget.value)} spellcheck="false" />
            </td>
            <td class="mt-fit">
              {#if !ship}<span class="badge none">—</span>
              {:else if !row}<span class="badge warn" title="Not in catalog">?</span>
              {:else if fit && fit.status === 'fits'}<span class="badge ok">✓ {fit.cap.toLocaleString()}</span>
              {:else if fit && fit.status === 'oversize'}<span class="badge bad" title="Load has a {r.maxSize} crate; ship max {fit.maxSize}">✕ ≤{fit.maxSize}</span>
              {:else if fit}<span class="badge bad">✕ −{fit.short.toLocaleString()}</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="mini-note">Each mission rolls up its cargo across all trips. Assign a hull per mission to split the run across ships; the <b>Fit</b> badge uses that ship's cargo grid (max container size + realistic SCU). The global Ship Fit Check below can size for one mission, the largest trip, or everything combined.</div>
  {/if}
</div>
