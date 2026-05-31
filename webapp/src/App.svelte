<script lang="ts">
  import { onMount } from 'svelte';
  import { run } from './stores/run.svelte';
  import { catalog } from './stores/catalog.svelte';
  import { saveRun, clearAll, storageOk } from './lib/storage';
  import { toCSV } from './lib/csv';
  import { FILES, namesOf } from './lib/catalog';
  import { datalistNames } from './lib/format';
  import type { Cat } from './lib/types';

  import Zone from './components/Zone.svelte';
  import TripPanel from './components/TripPanel.svelte';
  import Summary from './components/Summary.svelte';
  import Routes from './components/Routes.svelte';
  import Fleet from './components/Fleet.svelte';
  import Modal from './components/Modal.svelte';

  let importInput: HTMLInputElement;
  let menuOpen = $state(false);
  let helpOpen = $state(false);
  let exportOpen = $state(false);
  let exportName = $state('');

  onMount(() => { catalog.load(); });

  // Debounced autosave of the run (catalog delta is persisted on each mutation in the store).
  let saveTimer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const snap = $state.snapshot(run.state);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveRun(snap), 350);
  });

  // Datalists = catalog names ∪ values already used in the run.
  const commodityList = $derived(datalistNames(namesOf(catalog.commodities), run.state.sections.flatMap((s) => s.items.map((i) => i.commodity))));
  const locationList = $derived(datalistNames(namesOf(catalog.locations), run.state.sections.flatMap((s) => s.items.flatMap((i) => [i.source, i.destination]))));
  const shipList = $derived(namesOf(catalog.ships));

  function download(filename: string, text: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function openExport() { exportName = run.state.name || 'Untitled Run'; exportOpen = true; }
  function doExport() {
    const name = (exportName || '').trim() || 'Untitled Run';
    run.setName(name);
    download(name.replace(/[^\w-]+/g, '_') + '.json', JSON.stringify(run.state, null, 2), 'application/json');
    exportOpen = false;
  }
  function importRun(file: File) {
    const r = new FileReader();
    r.onload = () => {
      try { run.importRun(JSON.parse(String(r.result))); } catch { alert('Could not read that file — is it a Run export?'); }
    };
    r.readAsText(file);
  }
  function exportCsvs() {
    for (const cat of Object.keys(FILES) as Cat[]) {
      const c = catalog.catOf(cat);
      download(FILES[cat], toCSV(c.header, c.rows), 'text/csv');
    }
  }
  function resetAll() {
    if (!confirm('Clear ALL your data (run, owned ships, and any added commodities/locations) and load the built-in defaults? This cannot be undone.')) return;
    clearAll();
    catalog.reloadDefaults();
    run.clearRun();
  }
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<div class="wrap">
  <header class="top">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="#6f93b2" stroke-width="1.6">
        <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" />
      </svg>
    </div>
    <div>
      <h1>CARGO <span>MANIFEST</span></h1>
      <div class="sub">SCU crate breakdown · route planner · ship loadout</div>
    </div>
    <div class="top-right">
      <div class="hdr-status">
        {#if !catalog.loaded}
          <span class="hs-line">Loading reference data…</span>
        {:else}
          <span class="hs-line">· {catalog.ships.rows.length} ships ({catalog.ownedShips.length} owned)</span>
          <span class="hs-line">· {catalog.commodities.rows.length} commodities</span>
          <span class="hs-line">· {catalog.locations.rows.length} locations</span>
        {/if}
      </div>
      <button class="icon-btn" title="Help" aria-label="Help" onclick={() => (helpOpen = true)}>?</button>
      <div class="menu-wrap">
        <button class="icon-btn" title="Menu" aria-haspopup="menu" aria-expanded={menuOpen}
          onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}>⚙</button>
        {#if menuOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
            <button role="menuitem" onclick={() => { menuOpen = false; openExport(); }}><span class="mi">⤓</span> Export Run (JSON)</button>
            <button role="menuitem" onclick={() => { menuOpen = false; importInput.click(); }}><span class="mi">⤒</span> Import Run (JSON)</button>
            <button role="menuitem" onclick={() => { menuOpen = false; exportCsvs(); }}><span class="mi">▤</span> Export catalog CSVs</button>
            <div class="sep"></div>
            <button role="menuitem" class="danger" onclick={() => { menuOpen = false; resetAll(); }}><span class="mi">⌫</span> Clear data &amp; load defaults</button>
          </div>
        {/if}
      </div>
      <input bind:this={importInput} type="file" accept="application/json" style="display:none"
        onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) importRun(f); e.currentTarget.value = ''; }} />
    </div>
  </header>

  <!-- 1 · Ship Fit Check (which hull to fly) -->
  <Zone accent="var(--green)" num={1} title="Ship Fit Check" hint="which of your hulls fits the load · best fit pinned on top">
    <Fleet />
  </Zone>

  <!-- 2 · Trips (the working area) -->
  <Zone accent="var(--cyan)" num={2} title="Trips" hint="each trip has its own crate-size limit · a trip can carry several missions">
    {#snippet actions()}
      <button class="btn add sm" onclick={() => run.addTrip()}>+ Add Trip</button>
    {/snippet}
    <div class="intro-note">Crates fill largest-first; the leftover cascades down to the next enabled size. Each commodity packs into its own crates — two different goods never share a box. Tag each line with a mission # (1–10) to colour-code objectives; the same number always gets the same colour, even across trips.</div>
    {#each run.state.sections as trip (trip.id)}
      <TripPanel {trip} />
    {/each}
  </Zone>

  <!-- 3 · Loadout Summary -->
  <Zone accent="var(--amber)" num={3} title="Loadout Summary" hint="every trip combined, for picking a hull">
    <Summary />
  </Zone>

  <!-- 4 · Pick Up | 5 · Drop Off — side by side (collect on the left, deliver on the right) -->
  <Routes />

  <datalist id="commodityList">{#each commodityList as n}<option value={n}></option>{/each}</datalist>
  <datalist id="locationList">{#each locationList as n}<option value={n}></option>{/each}</datalist>
  <datalist id="shipList">{#each shipList as n}<option value={n}></option>{/each}</datalist>

  <footer class="page-foot">
    <span class="ok">●</span> Your data stays in this browser — nothing is sent to the server.
    {storageOk ? ' Saved locally; survives refresh.' : ' ⚠ Browser storage unavailable — use Export Run (⚙ menu) to keep a copy.'}
  </footer>
</div>

{#if helpOpen}
  <Modal title="How to use Cargo Manifest" onClose={() => (helpOpen = false)}>
    <p>Plan a multi-stop Star Citizen haul: break cargo into SCU crates, see which of your ships fits, and track every pickup and drop-off.</p>
    <ol>
      <li><b>Add a Trip</b> for each physical haul (one ship-load). Rename it — e.g. “Going”, “Return”.</li>
      <li><b>Choose crate sizes</b> for that trip: click a size to switch it <b>ON/OFF</b>. Off means that box size isn’t allowed (e.g. a “16 SCU and under” mission).</li>
      <li><b>Add a commodity line</b>: a mission # (1–10, which colour-codes it), the commodity, total SCU, and From / To. It auto-breaks into crates, largest-first.</li>
      <li><b>Ship Fit Check</b> (top): add the ships you own; the smallest hull that fits is pinned as ★ Best Fit.</li>
      <li><b>Pick Up / Drop Off</b>: tick <b>Drop Off</b> when delivered (completes the line); tick <b>Pick Up</b> just to remember you’ve already collected that cargo.</li>
    </ol>
    <p class="eg"><b>Example:</b> 96 SCU of Titanium from <i>Port Tressler → Area18</i>, mission 1. With every size on it packs as <b>3×32</b>. Turn off the 32 and it becomes <b>4×24</b>.</p>
    <p>Everything saves in your browser automatically. Use the ⚙ menu to Export/Import a run as JSON, or export the catalog CSVs.</p>
  </Modal>
{/if}

{#if exportOpen}
  <Modal title="Export Run" onClose={() => (exportOpen = false)}>
    <label class="modal-label" for="exportName">Manifest name</label>
    <input id="exportName" class="modal-input" bind:value={exportName} spellcheck="false"
      onkeydown={(e) => { if (e.key === 'Enter') doExport(); }} />
    <p style="margin-top:10px">Saved as a <code>.json</code> file you can re-import later or on another device.</p>
    <div class="modal-actions">
      <button class="btn" onclick={() => (exportOpen = false)}>Cancel</button>
      <button class="btn accent" onclick={doExport}>Export JSON</button>
    </div>
  </Modal>
{/if}
