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

  let importInput: HTMLInputElement;
  let menuOpen = $state(false);

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
  function exportRun() {
    download((run.state.name || 'manifest').replace(/[^\w-]+/g, '_') + '.json', JSON.stringify(run.state, null, 2), 'application/json');
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

  const counts = $derived(
    `${catalog.ships.rows.length} ships (${catalog.ownedShips.length} owned) · ${catalog.commodities.rows.length} commodities · ${catalog.locations.rows.length} locations`,
  );
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
      <input class="manifest-name" spellcheck="false" value={run.state.name} oninput={(e) => run.setName(e.currentTarget.value)} />
      <div class="menu-wrap">
        <button class="cog-btn" title="Menu" aria-haspopup="menu" aria-expanded={menuOpen}
          onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}>⚙</button>
        {#if menuOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
            <button role="menuitem" onclick={() => { menuOpen = false; exportRun(); }}><span class="mi">⤓</span> Export Run (JSON)</button>
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

  <div class="data-strip">
    {#if !catalog.loaded}
      Loading reference data…
    {:else}
      <span class="ok">●</span> Your data stays in this browser — nothing is sent to the server · {counts}
      {#if !storageOk}<span class="warn"> · ⚠ browser storage unavailable — use Export Run from the ⚙ menu to keep a copy</span>{/if}
    {/if}
  </div>

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

  <div class="status">
    {storageOk ? '● saved in this browser — survives refresh. Nothing leaves your device.' : '○ no browser storage — use Export Run to keep a copy.'}
  </div>
</div>
