<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { catalog } from '../stores/catalog.svelte';
  import { namesOf } from '../lib/catalog';
  import { parseMission, deconflict } from '../lib/parseMission';
  import { matchName } from '../lib/match';
  import { ocrMulti } from '../lib/ocr';
  import Modal from './Modal.svelte';

  let { tripId, onClose }: { tripId: string; onClose: () => void } = $props();

  type Stage = 'drop' | 'crop' | 'working' | 'review' | 'error';
  let stage = $state<Stage>('drop');
  let progress = $state(0);
  let errMsg = $state('');
  let maxBox = $state<number | null>(null);
  let reward = $state('');
  let rawText = $state('');
  let showRaw = $state(false);
  let showExample = $state(false);
  let lastFile: Blob | null = null;

  // crop state (fractions 0..1 of the source image)
  let imgUrl = $state('');
  let imgW = 0, imgH = 0;
  let sel = $state({ x: 0.45, y: 0.06, w: 0.54, h: 0.9 }); // default: right column where objectives sit
  let cropBoxEl = $state<HTMLDivElement>();
  type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

  function loadForCrop(file: Blob) {
    lastFile = file;
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { imgW = im.naturalWidth; imgH = im.naturalHeight; stage = 'crop'; };
    im.src = imgUrl;
  }

  let drag: { mode: DragMode; x0: number; y0: number; s0: typeof sel } | null = null;
  function startSel(mode: DragMode, e: PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    drag = { mode, x0: e.clientX, y0: e.clientY, s0: { ...sel } };
    window.addEventListener('pointermove', moveSel);
    window.addEventListener('pointerup', () => { drag = null; window.removeEventListener('pointermove', moveSel); }, { once: true });
  }
  function moveSel(e: PointerEvent) {
    if (!drag || !cropBoxEl) return;
    const d = drag;
    const r = cropBoxEl.getBoundingClientRect();
    const dx = (e.clientX - d.x0) / r.width;
    const dy = (e.clientY - d.y0) / r.height;
    const s = { ...d.s0 };
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    if (d.mode === 'move') { s.x = clamp(s.x + dx); s.y = clamp(s.y + dy); s.x = Math.min(s.x, 1 - s.w); s.y = Math.min(s.y, 1 - s.h); }
    else {
      if (d.mode.includes('w')) { const nx = clamp(s.x + dx); s.w = s.w + (s.x - nx); s.x = nx; }
      if (d.mode.includes('e')) { s.w = clamp(s.w + dx); }
      if (d.mode.includes('n')) { const ny = clamp(s.y + dy); s.h = s.h + (s.y - ny); s.y = ny; }
      if (d.mode.includes('s')) { s.h = clamp(s.h + dy); }
    }
    s.w = Math.max(0.08, Math.min(1 - s.x, s.w)); s.h = Math.max(0.08, Math.min(1 - s.y, s.h));
    sel = s;
  }

  async function cropToBlob(): Promise<Blob> {
    const im = new Image(); im.src = imgUrl;
    await im.decode();
    const sx = Math.round(sel.x * imgW), sy = Math.round(sel.y * imgH);
    const sw = Math.round(sel.w * imgW), sh = Math.round(sel.h * imgH);
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    c.getContext('2d')!.drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
    return await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
  }
  async function runCropped() { handleImage(await cropToBlob()); }
  function runWhole() { if (lastFile) handleImage(lastFile); }

  interface Row {
    commodity: string; comNovel: boolean;
    scu: string;
    source: string; srcNovel: boolean;
    destination: string; dstNovel: boolean;
  }
  let rows = $state<Row[]>([]);

  const comNames = $derived(namesOf(catalog.commodities));
  const locNames = $derived(namesOf(catalog.locations));

  async function handleImage(file: Blob) {
    lastFile = file;
    stage = 'working'; progress = 0; errMsg = '';
    try {
      const passes = await ocrMulti(file, 3, (p) => (progress = p));
      rawText = passes.map((p, i) => `— pass ${i + 1} (conf ${Math.round(p.confidence)}) —\n${p.text}`).join('\n\n');
      const parsed = deconflict(passes.map((p) => parseMission(p.text)));
      maxBox = parsed.maxBox;
      reward = parsed.reward != null ? String(parsed.reward) : '';
      if (!parsed.legs.length) { stage = 'error'; errMsg = 'No delivery objectives found. Crop tighter to the “Primary Objectives” column, or try “Use whole image”.'; return; }
      rows = parsed.legs.map((lg) => {
        const com = matchName(lg.commodity, comNames);
        const src = lg.source ? matchName(lg.source, locNames) : { value: '', score: 1, novel: false };
        const dst = matchName(lg.destination, locNames);
        return {
          commodity: com.value, comNovel: com.novel,
          scu: String(lg.scu),
          source: src.value, srcNovel: src.novel,
          destination: dst.value, dstNovel: dst.novel,
        };
      });
      stage = 'review';
    } catch (e) {
      stage = 'error'; errMsg = (e as Error)?.message || 'OCR failed.';
    }
  }
  function rerun() { if (lastFile) handleImage(lastFile); }

  function onDrop(e: DragEvent) { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) loadForCrop(f); }
  function onPaste(e: ClipboardEvent) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile(); if (f) loadForCrop(f);
  }
  function onPick(e: Event) { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) loadForCrop(f); }

  function isCom(v: string) { return comNames.some((n) => n.toLowerCase() === v.trim().toLowerCase()); }
  function isLoc(v: string) { return locNames.some((n) => n.toLowerCase() === v.trim().toLowerCase()); }
  function refreshNovel(r: Row) {
    r.comNovel = !!r.commodity.trim() && !isCom(r.commodity);
    r.srcNovel = !!r.source.trim() && !isLoc(r.source);
    r.dstNovel = !!r.destination.trim() && !isLoc(r.destination);
  }
  const totalScu = $derived(rows.reduce((a, r) => a + (Number(r.scu) || 0), 0));

  function addRow() { rows.push({ commodity: '', comNovel: false, scu: '', source: '', srcNovel: false, destination: '', dstNovel: false }); }
  function delRow(i: number) { rows.splice(i, 1); }

  // ---- Suggestions sidebar: distinct unresolved names, with a rename/add that propagates ----
  interface Sugg { kind: 'com' | 'loc'; original: string; }
  const suggestions = $derived.by((): Sugg[] => {
    const out: Sugg[] = []; const seen = new Set<string>();
    for (const r of rows) {
      if (r.comNovel) { const k = 'com|' + r.commodity.trim().toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ kind: 'com', original: r.commodity.trim() }); } }
      for (const v of [r.srcNovel ? r.source : '', r.dstNovel ? r.destination : '']) {
        if (v.trim()) { const k = 'loc|' + v.trim().toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ kind: 'loc', original: v.trim() }); } }
      }
    }
    return out;
  });
  // editable target per suggestion (keyed by original); defaults to the original text
  let edits = $state<Record<string, string>>({});
  const editKey = (s: Sugg) => s.kind + '|' + s.original.toLowerCase();
  function editVal(s: Sugg) { return edits[editKey(s)] ?? s.original; }
  function setEdit(s: Sugg, v: string) { edits[editKey(s)] = v; }

  // Apply a suggestion to EVERY row that uses the original name (rename-all), and add the
  // target to the catalog if it isn't there yet.
  function applySugg(s: Sugg) {
    const target = (edits[editKey(s)] ?? s.original).trim();
    if (!target) return;
    const orig = s.original.trim().toLowerCase();
    for (const r of rows) {
      if (s.kind === 'com') { if (r.commodity.trim().toLowerCase() === orig) r.commodity = target; }
      else { if (r.source.trim().toLowerCase() === orig) r.source = target; if (r.destination.trim().toLowerCase() === orig) r.destination = target; }
    }
    const exists = s.kind === 'com' ? isCom(target) : isLoc(target);
    if (!exists) { s.kind === 'com' ? catalog.addCommodity(target) : catalog.addLocation(target); }
    delete edits[editKey(s)];
    rows.forEach(refreshNovel);
  }
  function applyAll() { for (const s of [...suggestions]) applySugg(s); }

  function confirm() {
    run.addImportedLegs(
      tripId,
      rows.map((r) => ({ commodity: r.commodity, scu: Number(r.scu) || 0, source: r.source, destination: r.destination })),
      maxBox,
      reward !== '' ? Number(reward) || null : null,
    );
    onClose();
  }
</script>

{#snippet instructions()}
  <div class="imp-example">
    <p><b>What to capture:</b> open the contract, then screenshot (or snip) the <b>Primary Objectives</b> column — the “Deliver … / Collect …” list. Including the header’s <b>Reward</b> lets it auto-fill the payout.</p>
    <svg class="imp-mock" viewBox="0 0 320 150" role="img" aria-label="Example mission layout">
      <rect x="2" y="2" width="316" height="146" rx="4" fill="#10202c" stroke="#2c3b48"/>
      <rect x="200" y="6" width="114" height="22" rx="3" fill="#172a38" stroke="#2c3b48"/>
      <text x="206" y="15" fill="#7fb0d8" font-size="6">Reward</text><text x="300" y="15" fill="#dfeaf2" font-size="6" text-anchor="end">¤ 53,750</text>
      <text x="10" y="20" fill="#dfeaf2" font-size="8" font-weight="bold">Mission Title</text>
      <text x="10" y="44" fill="#9fb0bd" font-size="7" font-weight="bold">DETAILS</text>
      {#each [54,62,70,78,86] as y}<rect x="10" y={y} width="150" height="3" rx="1.5" fill="#33485a"/>{/each}
      <text x="178" y="44" fill="#dfeaf2" font-size="7" font-weight="bold">PRIMARY OBJECTIVES</text>
      <text x="178" y="58" fill="#e7eef4" font-size="6">◇ Deliver 0/24 SCU of Tungsten</text>
      <text x="186" y="67" fill="#bcd0df" font-size="5.5">◇ Collect Tungsten from HDPC-…</text>
      <text x="178" y="80" fill="#e7eef4" font-size="6">◇ Deliver 0/8 SCU of Quartz to …</text>
      <text x="186" y="89" fill="#bcd0df" font-size="5.5">◇ Collect Quartz from Everus …</text>
      <rect x="172" y="38" width="142" height="64" fill="none" stroke="#5fa3e0" stroke-width="1.5" stroke-dasharray="4 3"/>
      <text x="243" y="112" fill="#5fa3e0" font-size="6" text-anchor="middle" font-weight="bold">▲ capture this</text>
    </svg>
    <p class="imp-ex-note">Two-column shot is fine — the crop step lets you box just this part. Everything is read in your browser; the image is never uploaded.</p>
  </div>
{/snippet}

<Modal title="Screenshot Import" wide {onClose}>
  <button class="imp-exbtn" onclick={() => (showExample = !showExample)}>{showExample ? '▾' : '▸'} Example &amp; instructions</button>
  {#if showExample}{@render instructions()}{/if}

  {#if stage === 'drop'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="imp-drop" role="button" tabindex="0"
      ondragover={(e) => e.preventDefault()} ondrop={onDrop} onpaste={onPaste}>
      <div class="imp-drop-i">⇪</div>
      <div class="imp-drop-t">Paste, drop, or choose a screenshot</div>
      <div class="imp-drop-s">A shot of the contract’s <b>Primary Objectives</b> works best. Read in your browser — never uploaded.</div>
      <label class="btn accent sm imp-pick">Choose image<input type="file" accept="image/*" style="display:none" onchange={onPick} /></label>
    </div>
  {:else if stage === 'crop'}
    <p class="imp-crophint">Drag the box around just the <b>Primary Objectives</b> column, then <b>Read selection</b> — or <b>Use whole image</b> if it’s already cropped.</p>
    <div class="cropwrap" bind:this={cropBoxEl}>
      <img src={imgUrl} alt="screenshot" class="cropimg" draggable="false" />
      <!-- four exact shades around the selection (perfectly aligned with the handles) -->
      <div class="cropshade" style="left:0;right:0;top:0;height:{sel.y * 100}%"></div>
      <div class="cropshade" style="left:0;right:0;top:{(sel.y + sel.h) * 100}%;bottom:0"></div>
      <div class="cropshade" style="left:0;width:{sel.x * 100}%;top:{sel.y * 100}%;height:{sel.h * 100}%"></div>
      <div class="cropshade" style="left:{(sel.x + sel.w) * 100}%;right:0;top:{sel.y * 100}%;height:{sel.h * 100}%"></div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="cropsel" style="left:{sel.x * 100}%;top:{sel.y * 100}%;width:{sel.w * 100}%;height:{sel.h * 100}%"
        onpointerdown={(e) => startSel('move', e)}>
        <span class="ch nw" onpointerdown={(e) => startSel('nw', e)}></span>
        <span class="ch ne" onpointerdown={(e) => startSel('ne', e)}></span>
        <span class="ch sw" onpointerdown={(e) => startSel('sw', e)}></span>
        <span class="ch se" onpointerdown={(e) => startSel('se', e)}></span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick={() => (stage = 'drop')}>Back</button>
      <button class="btn" onclick={runWhole}>Use whole image</button>
      <button class="btn accent" onclick={runCropped}>Read selection</button>
    </div>
  {:else if stage === 'working'}
    <div class="imp-working">
      <div class="imp-bar"><span style="width:{Math.round(progress * 100)}%"></span></div>
      <div class="imp-sub">Reading text (3 passes)… {Math.round(progress * 100)}%</div>
    </div>
  {:else if stage === 'error'}
    <p class="imp-err">{errMsg}</p>
    <div class="modal-actions"><button class="btn" onclick={() => (stage = 'drop')}>Try again</button></div>
  {:else}
    <div class="imp-meta">
      <span><b>{rows.length}</b> leg{rows.length === 1 ? '' : 's'}</span>
      <span><b>{totalScu.toLocaleString()}</b> SCU</span>
      {#if maxBox != null}<span class="imp-box">box ≤ {maxBox}</span>{/if}
      <label class="imp-reward">Reward <span class="cur">¤</span><input inputmode="numeric" bind:value={reward} placeholder="—" /></label>
      <button class="btn ghost sm imp-rerun" title="Re-run OCR on the same image" onclick={rerun}>↻ Re-run</button>
    </div>

    <div class="imp-review">
      <div class="imp-main">
        <table class="imp-tbl">
          <thead><tr><th>Commodity</th><th class="n">SCU</th><th>From</th><th>To</th><th class="x"></th></tr></thead>
          <tbody>
            {#each rows as r, i}
              <tr>
                <td><input list="commodityList" bind:value={r.commodity} oninput={() => refreshNovel(r)} class:novel={r.comNovel} /></td>
                <td class="n"><input class="scu" inputmode="numeric" bind:value={r.scu} /></td>
                <td><input list="locationList" bind:value={r.source} oninput={() => refreshNovel(r)} class:novel={r.srcNovel} /></td>
                <td><input list="locationList" bind:value={r.destination} oninput={() => refreshNovel(r)} class:novel={r.dstNovel} /></td>
                <td class="x"><button class="imp-del" title="Remove row" onclick={() => delRow(i)}>✕</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
        <button class="btn ghost sm imp-addrow" onclick={addRow}>+ Add row</button>
        <button class="imp-rawtoggle" onclick={() => (showRaw = !showRaw)}>{showRaw ? '▾' : '▸'} raw OCR text</button>
        {#if showRaw}<pre class="imp-raw">{rawText}</pre>{/if}
      </div>

      {#if suggestions.length}
        <aside class="imp-side">
          <div class="imp-side-h">Not in your catalog <span class="imp-side-n">{suggestions.length}</span></div>
          <p class="imp-side-s">Fix the name (or keep it) and add it — this updates every matching row.</p>
          {#each suggestions as s (s.kind + s.original)}
            <div class="sugg">
              <span class="sugg-kind">{s.kind === 'com' ? 'COMMODITY' : 'LOCATION'}</span>
              <input class="sugg-in" list={s.kind === 'com' ? 'commodityList' : 'locationList'}
                value={editVal(s)} oninput={(e) => setEdit(s, e.currentTarget.value)} />
              <button class="btn accent xs" onclick={() => applySugg(s)}>Add &amp; apply</button>
            </div>
          {/each}
          <button class="btn sm imp-applyall" onclick={applyAll}>Add &amp; apply all</button>
        </aside>
      {/if}
    </div>

    <div class="modal-actions">
      <button class="btn" onclick={() => (stage = 'drop')}>Back</button>
      <button class="btn accent" onclick={confirm}>Add {rows.length} row{rows.length === 1 ? '' : 's'} to trip</button>
    </div>
  {/if}
</Modal>
