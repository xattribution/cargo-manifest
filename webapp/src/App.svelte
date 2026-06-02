<script lang="ts">
  import { onMount } from 'svelte';
  import { run } from './stores/run.svelte';
  import { catalog } from './stores/catalog.svelte';
  import { saveRun, clearAll, storageOk } from './lib/storage';
  import { toCSV } from './lib/csv';
  import { FILES, namesOf } from './lib/catalog';
  import { datalistNames } from './lib/format';
  import { aggregate, flatEntries } from './lib/crate';
  import type { Cat } from './lib/types';

  import Zone from './components/Zone.svelte';
  import TripPanel from './components/TripPanel.svelte';
  import Overview from './components/Overview.svelte';
  import Routes from './components/Routes.svelte';
  import Fleet from './components/Fleet.svelte';
  import Modal from './components/Modal.svelte';
  import ShipGridEditor from './components/ShipGridEditor.svelte';

  let importInput: HTMLInputElement;
  let menuOpen = $state(false);
  let helpOpen = $state(false);
  let exportOpen = $state(false);
  let exportName = $state('');
  let gridOpen = $state(false);
  let gridShip = $state('');
  let navOpen = $state(false); // mobile sidebar
  function openGrid(name: string) { gridShip = name; gridOpen = true; }

  onMount(() => { catalog.load(); });

  let saveTimer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const snap = $state.snapshot(run.state);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveRun(snap), 350);
  });

  const commodityList = $derived(datalistNames(namesOf(catalog.commodities), run.state.sections.flatMap((s) => s.items.map((i) => i.commodity))));
  const locationList = $derived(datalistNames(namesOf(catalog.locations), run.state.sections.flatMap((s) => s.items.flatMap((i) => [i.source, i.destination]))));
  const shipList = $derived(namesOf(catalog.ships));
  const agg = $derived(aggregate(flatEntries(run.state.sections)));

  function download(filename: string, text: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
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
    r.onload = () => { try { run.importRun(JSON.parse(String(r.result))); } catch { alert('Could not read that file — is it a Run export?'); } };
    r.readAsText(file);
  }
  function exportCsvs() {
    for (const cat of Object.keys(FILES) as Cat[]) { const c = catalog.catOf(cat); download(FILES[cat], toCSV(c.header, c.rows), 'text/csv'); }
  }
  function resetAll() {
    if (!confirm('Clear ALL your data (run, owned ships, and any added commodities/locations) and load the built-in defaults? This cannot be undone.')) return;
    clearAll(); catalog.reloadDefaults(); run.clearRun();
  }
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<div class="app" class:nav-open={navOpen}>
  <!-- ===== Sidebar: brand + fleet management ===== -->
  <aside class="sidebar">
    <div class="brand">
      <span class="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" />
        </svg>
      </span>
      <span class="brand-txt">CARGO<b>MANIFEST</b></span>
      <button class="nav-x" aria-label="Close menu" onclick={() => (navOpen = false)}>✕</button>
    </div>

    <Fleet {openGrid} />

    <div class="side-foot">
      <button class="ic" title="Help" aria-label="Help" onclick={() => (helpOpen = true)}>?</button>
      <div class="menu-wrap">
        <button class="ic" title="Menu" aria-haspopup="menu" aria-expanded={menuOpen}
          onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; }}>⚙</button>
        {#if menuOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
            <button role="menuitem" onclick={() => { menuOpen = false; openExport(); }}><span class="mi">⤓</span> Export run</button>
            <button role="menuitem" onclick={() => { menuOpen = false; importInput.click(); }}><span class="mi">⤒</span> Import run</button>
            <button role="menuitem" onclick={() => { menuOpen = false; exportCsvs(); }}><span class="mi">▤</span> Export catalog CSVs</button>
            <button role="menuitem" onclick={() => { menuOpen = false; openGrid(''); }}><span class="mi">▦</span> Edit ship data</button>
            <div class="sep"></div>
            <button role="menuitem" class="danger" onclick={() => { menuOpen = false; resetAll(); }}><span class="mi">⌫</span> Clear &amp; reset</button>
          </div>
        {/if}
      </div>
      <span class="local" title={storageOk ? 'Saved locally; nothing leaves your browser' : 'Browser storage unavailable'}>
        <i class="dot" class:warn={!storageOk}></i>{storageOk ? 'LOCAL' : 'NO STORAGE'}
      </span>
    </div>
    <input bind:this={importInput} type="file" accept="application/json" style="display:none"
      onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) importRun(f); e.currentTarget.value = ''; }} />
  </aside>

  <!-- backdrop for mobile nav -->
  <button class="nav-backdrop" aria-label="Close menu" onclick={() => (navOpen = false)}></button>

  <!-- ===== Workspace ===== -->
  <main class="main">
    <header class="work-head">
      <button class="nav-toggle" aria-label="Menu" onclick={() => (navOpen = true)}>☰</button>
      <input class="run-name" spellcheck="false" value={run.state.name}
        oninput={(e) => run.setName(e.currentTarget.value)} aria-label="Manifest name" />
      <div class="run-stat">
        <span><b>{agg.scu.toLocaleString()}</b> SCU</span>
        <span><b>{agg.crates}</b> crates</span>
        {#if agg.leftover > 0}<span class="warn"><b>{agg.leftover}</b> unpacked</span>{/if}
      </div>
    </header>

    <Zone accent="var(--c-overview)" title="Overview">
      <Overview />
    </Zone>

    <Zone accent="var(--c-manifest)" title="Manifest">
      {#snippet actions()}
        <button class="btn ghost sm" onclick={() => run.addTrip()}>+ Trip</button>
      {/snippet}
      {#each run.state.sections as trip (trip.id)}
        <TripPanel {trip} />
      {/each}
    </Zone>

    <Routes />

    <datalist id="commodityList">{#each commodityList as n}<option value={n}></option>{/each}</datalist>
    <datalist id="locationList">{#each locationList as n}<option value={n}></option>{/each}</datalist>
    <datalist id="shipList">{#each shipList as n}<option value={n}></option>{/each}</datalist>
  </main>
</div>

{#if gridOpen}
  <ShipGridEditor initialName={gridShip} onClose={() => (gridOpen = false)} />
{/if}

{#if helpOpen}
  <Modal title="How to use" onClose={() => (helpOpen = false)}>
    <ol class="help">
      <li><b>Add a trip</b> per ship-load. Tag each cargo line with a <b>mission #</b> (1–10) — it color-codes the run.</li>
      <li><b>Crate sizes</b>: click a size to toggle it on/off for that trip. Crates fill largest-first; each commodity packs into its own boxes.</li>
      <li><b>Fleet</b> (left): add ships you own; the smallest that fits the load is starred. Click a ship to set its <b>cargo grid</b> (max box size + realistic SCU).</li>
      <li><b>Missions</b> (Overview): per-mission totals; assign a hull to each mission to split a run across ships.</li>
      <li><b>Pick Up / Drop Off</b>: tick Drop Off when delivered; tick Pick Up just to mark cargo collected.</li>
    </ol>
    <p class="muted">Everything saves in your browser — nothing is sent to a server. Use ⚙ to export/import a run or the catalog CSVs.</p>
  </Modal>
{/if}

{#if exportOpen}
  <Modal title="Export run" onClose={() => (exportOpen = false)}>
    <label class="modal-label" for="exportName">Manifest name</label>
    <input id="exportName" class="modal-input" bind:value={exportName} spellcheck="false"
      onkeydown={(e) => { if (e.key === 'Enter') doExport(); }} />
    <div class="modal-actions">
      <button class="btn" onclick={() => (exportOpen = false)}>Cancel</button>
      <button class="btn accent" onclick={doExport}>Export JSON</button>
    </div>
  </Modal>
{/if}
