<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { catalog } from '../stores/catalog.svelte';
  import { missionRollups } from '../lib/missions';
  import { missionColor, missionFg } from '../lib/mission';
  import { ALL_SIZES } from '../lib/crate';
  import { nameKey, shipFit } from '../lib/catalog';
  import { prefs } from '../lib/prefs.svelte';
  import MissionImport from './MissionImport.svelte';
  import Modal from './Modal.svelte';
  import type { CatalogRow } from '../lib/types';

  const rollups = $derived(missionRollups(run.state.sections, run.state.missionOrder));
  const nk = $derived(nameKey(catalog.ships));
  const cols = $derived(ALL_SIZES.filter((s) => rollups.some((r) => r.agg.totals[s])));
  const totalScu = $derived(rollups.reduce((a, r) => a + r.agg.scu, 0));
  const totalReward = $derived(rollups.reduce((a, r) => a + (run.state.missionRewards[r.mission] || 0), 0));
  const order = $derived(rollups.map((r) => r.mission)); // current visible order

  // ---- partial-completion planner ----
  const pct = $derived(run.state.completionPct);
  const partial = $derived(pct < 100);
  // SCU you must submit for a given mission to reach `pct` (rounded up — you can't submit a fraction of a crate, and rounding up guarantees the threshold).
  const targetScu = (scu: number) => Math.ceil((scu * pct) / 100);
  const totalTarget = $derived(rollups.reduce((a, r) => a + targetScu(r.agg.scu), 0));
  const totalTargetReward = $derived(Math.round((totalReward * pct) / 100));

  // import targets the first/primary trip
  let importOpen = $state(false);
  const firstTripId = $derived(run.state.sections[0]?.id ?? '');

  function rowFor(name: string): CatalogRow | null {
    const key = (name || '').trim().toLowerCase();
    if (!key) return null;
    return catalog.ships.rows.find((r) => String(r[nk] || '').trim().toLowerCase() === key) || null;
  }

  function addMission() {
    const m = run.addMission();
    if (m == null) alert('All 10 mission slots are in use.');
  }
  // Delete confirmation dialog (so we can offer "don't remind me again", which native
  // confirm() can't). null = closed; {mission:n} = single; {all:true} = clear all.
  let confirmDel = $state<{ mission?: number; all?: boolean; items: number; label: string } | null>(null);
  let dontRemind = $state(false);

  function delMission(m: number, items: number) {
    if (items === 0 || prefs.skipMissionDeleteWarn) { run.deleteMission(m); return; }
    dontRemind = false;
    confirmDel = { mission: m, items, label: run.state.missionNames[m] || `Mission ${m}` };
  }
  function clearAllMissions() {
    const items = rollups.reduce((a, r) => a + r.items, 0);
    if (items === 0) { run.clearMissions(); return; }
    if (prefs.skipMissionDeleteWarn) { run.clearMissions(); return; }
    dontRemind = false;
    confirmDel = { all: true, items, label: `all ${rollups.length} missions` };
  }
  function doConfirmDel() {
    if (!confirmDel) return;
    if (dontRemind) prefs.setSkipMissionDeleteWarn(true);
    if (confirmDel.all) run.clearMissions();
    else if (confirmDel.mission != null) run.deleteMission(confirmDel.mission);
    confirmDel = null;
  }

  // pointer drag-reorder by the grip
  let bodyEl: HTMLTableSectionElement;
  let dragM = $state<number | null>(null);
  function startDrag(m: number, e: PointerEvent) {
    dragM = m; e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', () => { dragM = null; window.removeEventListener('pointermove', onMove); }, { once: true });
  }
  function onMove(e: PointerEvent) {
    if (dragM == null || !bodyEl) return;
    const rowsEls = [...bodyEl.querySelectorAll<HTMLElement>('tr.mrow')];
    let idx = rowsEls.length;
    for (let i = 0; i < rowsEls.length; i++) {
      const b = rowsEls[i].getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { idx = i; break; }
    }
    run.moveMission(dragM, idx, order);
  }
</script>

<div class="m-toolbar">
  <button class="btn ghost sm" onclick={() => (importOpen = true)} title="Import a mission from a screenshot">⎙ Import mission screenshot</button>
  <button class="btn ghost sm" onclick={addMission}>+ Add mission</button>
  {#if rollups.length}<button class="btn ghost sm danger" onclick={clearAllMissions} title="Delete every mission and its manifest lines">⌫ Clear all</button>{/if}
  <div class="m-pct" title="Plan a partial submission — useful for rep grinding when a fraction of a mission still pays full(er) rep for the time.">
    <span class="m-pct-l">Submit</span>
    <input class="m-pct-range" type="range" min="5" max="100" step="5" value={pct}
      oninput={(e) => run.setCompletionPct(Number(e.currentTarget.value))} aria-label="Completion percent" />
    <span class="m-pct-v">{pct}%</span>
    {#if partial}<button class="m-pct-reset" title="Reset to 100%" onclick={() => run.setCompletionPct(100)}>↺</button>{/if}
  </div>
</div>

<div class="tbl-scroll">
  <table class="mtbl">
    <thead>
      <tr>
        <th class="mt-grip"></th>
        <th class="mt-id">#</th>
        <th>Mission</th>
        <th class="mt-num">SCU</th>
        {#if partial}<th class="mt-num mt-tgt" title="SCU to submit for {pct}%">Submit&nbsp;{pct}%</th>{/if}
        {#each cols as s}<th class="mt-sz">{s}</th>{/each}
        <th class="mt-num">Box</th>
        <th class="mt-rt">Pick→Drop</th>
        <th class="mt-ship">Ship</th>
        <th class="mt-fit">Fit</th>
        <th class="mt-rew">Reward</th>
        <th class="mt-x"></th>
      </tr>
    </thead>
    <tbody bind:this={bodyEl}>
      {#if rollups.length === 0}
        <tr><td colspan={cols.length + (partial ? 10 : 9)} class="mp-empty">Tag cargo lines with a mission #, import a screenshot, or add a blank mission.</td></tr>
      {/if}
      {#each rollups as r (r.mission)}
        {@const c = missionColor(r.mission)}
        {@const ship = run.state.missionShips[r.mission] || ''}
        {@const row = rowFor(ship)}
        {@const fit = row ? shipFit(row, r.agg.scu, r.maxSize) : null}
        <tr class="mrow" class:dragging={dragM === r.mission} style="--mc:{c};--mfg:{missionFg(c)}">
          <td class="mt-grip"><span class="mgrip" role="button" tabindex="-1" aria-label="Drag to reorder" title="Drag to reorder" onpointerdown={(e) => startDrag(r.mission, e)}>⠿</span></td>
          <td class="mt-id">{r.mission}</td>
          <td><input class="mname-in" placeholder="Mission {r.mission}" value={run.state.missionNames[r.mission] || ''}
            oninput={(e) => run.setMissionName(r.mission, e.currentTarget.value)} spellcheck="false" /></td>
          <td class="mt-num strong">{r.agg.scu.toLocaleString()}</td>
          {#if partial}<td class="mt-num mt-tgt">{r.agg.scu > 0 ? targetScu(r.agg.scu).toLocaleString() : ''}</td>{/if}
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
          <td class="mt-x"><button class="mdel" title="Delete mission" aria-label="Delete mission" onclick={() => delMission(r.mission, r.items)}>✕</button></td>
        </tr>
      {/each}
    </tbody>
    {#if rollups.length}
      <tfoot>
        <tr class="mfoot">
          <td></td><td></td><td>Total</td>
          <td class="mt-num strong">{totalScu.toLocaleString()}</td>
          {#if partial}<td class="mt-num mt-tgt strong">{totalTarget.toLocaleString()}</td>{/if}
          {#each cols as _s}<td></td>{/each}
          <td></td><td></td><td></td><td></td>
          <td class="mt-rew strong"><span class="cur">¤</span>{(partial ? totalTargetReward : totalReward).toLocaleString()}</td>
          <td></td>
        </tr>
      </tfoot>
    {/if}
  </table>
</div>
{#if partial}
  <div class="m-pct-note">At <b>{pct}%</b> submit <b>{totalTarget.toLocaleString()} SCU</b> (of {totalScu.toLocaleString()}) for ~<b><span class="cur">¤</span>{totalTargetReward.toLocaleString()}</b>. Targets round up per mission.</div>
{/if}

{#if importOpen && firstTripId}
  <MissionImport tripId={firstTripId} onClose={() => (importOpen = false)} />
{/if}

{#if confirmDel}
  <Modal title={confirmDel.all ? 'Clear all missions' : 'Delete mission'} onClose={() => (confirmDel = null)}>
    <p class="cd-msg">
      {#if confirmDel.all}
        Delete <b>{confirmDel.label}</b> and <b>{confirmDel.items}</b> manifest line{confirmDel.items === 1 ? '' : 's'}? This can’t be undone.
      {:else}
        Delete <b>{confirmDel.label}</b> and its <b>{confirmDel.items}</b> manifest line{confirmDel.items === 1 ? '' : 's'}? This can’t be undone.
      {/if}
    </p>
    <label class="cd-skip"><input type="checkbox" bind:checked={dontRemind} /> Don’t remind me again</label>
    <div class="modal-actions">
      <button class="btn" onclick={() => (confirmDel = null)}>Cancel</button>
      <button class="btn accent danger" onclick={doConfirmDel}>{confirmDel.all ? 'Clear all' : 'Delete'}</button>
    </div>
  </Modal>
{/if}
