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

  // pointer-drag to move or resize the selection
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
    s.w = Math.max(0.1, Math.min(1 - s.x, s.w)); s.h = Math.max(0.1, Math.min(1 - s.y, s.h));
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
      if (!parsed.legs.length) { stage = 'error'; errMsg = 'No delivery objectives found. Try a tighter crop of the “Primary Objectives” panel.'; return; }
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

  function refreshNovel(r: Row) {
    r.comNovel = !!r.commodity && !comNames.some((n) => n.toLowerCase() === r.commodity.toLowerCase());
    r.srcNovel = !!r.source && !locNames.some((n) => n.toLowerCase() === r.source.toLowerCase());
    r.dstNovel = !!r.destination && !locNames.some((n) => n.toLowerCase() === r.destination.toLowerCase());
  }
  function addNovel(kind: 'com' | 'loc', name: string, r: Row) {
    if (kind === 'com') catalog.addCommodity(name); else catalog.addLocation(name);
    refreshNovel(r);
  }
  const anyNovel = $derived(rows.some((r) => r.comNovel || r.srcNovel || r.dstNovel));
  const totalScu = $derived(rows.reduce((a, r) => a + (Number(r.scu) || 0), 0));

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

<Modal title="Import mission from screenshot" {onClose}>
  {#if stage === 'drop'}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="imp-drop" role="button" tabindex="0"
      ondragover={(e) => e.preventDefault()} ondrop={onDrop} onpaste={onPaste}>
      <div class="imp-drop-i">⇪</div>
      <div class="imp-drop-t">Paste, drop, or choose a screenshot</div>
      <div class="imp-drop-s">Crop to the <b>Primary Objectives</b> panel (include the reward for auto-fill). Read in your browser — never uploaded.</div>
      <label class="btn accent sm imp-pick">Choose image<input type="file" accept="image/*" style="display:none" onchange={onPick} /></label>
    </div>
  {:else if stage === 'crop'}
    <p class="imp-crophint">Drag the box around just the <b>Primary Objectives</b> column (avoids the Details text bleeding in). Or use the whole image.</p>
    <div class="cropwrap" bind:this={cropBoxEl}>
      <img src={imgUrl} alt="screenshot" class="cropimg" draggable="false" />
      <div class="cropdim" style="--x:{sel.x*100}%;--y:{sel.y*100}%;--w:{sel.w*100}%;--h:{sel.h*100}%"></div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="cropsel" style="left:{sel.x*100}%;top:{sel.y*100}%;width:{sel.w*100}%;height:{sel.h*100}%"
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
    <div class="tbl-scroll">
      <table class="imp-tbl">
        <thead><tr><th>Commodity</th><th class="n">SCU</th><th>From</th><th>To</th></tr></thead>
        <tbody>
          {#each rows as r}
            <tr>
              <td>
                <input list="commodityList" bind:value={r.commodity} oninput={() => refreshNovel(r)} class:novel={r.comNovel} />
                {#if r.comNovel}<button class="imp-add" title="Add to catalog" onclick={() => addNovel('com', r.commodity, r)}>+</button>{/if}
              </td>
              <td class="n"><input class="scu" inputmode="numeric" bind:value={r.scu} /></td>
              <td>
                <input list="locationList" bind:value={r.source} oninput={() => refreshNovel(r)} class:novel={r.srcNovel} />
                {#if r.srcNovel}<button class="imp-add" title="Add to catalog" onclick={() => addNovel('loc', r.source, r)}>+</button>{/if}
              </td>
              <td>
                <input list="locationList" bind:value={r.destination} oninput={() => refreshNovel(r)} class:novel={r.dstNovel} />
                {#if r.dstNovel}<button class="imp-add" title="Add to catalog" onclick={() => addNovel('loc', r.destination, r)}>+</button>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if anyNovel}<p class="imp-hint">Highlighted fields aren’t in your catalog — edit to fix, or <b>+</b> to add them.</p>{/if}
    <button class="imp-rawtoggle" onclick={() => (showRaw = !showRaw)}>{showRaw ? '▾' : '▸'} raw OCR text</button>
    {#if showRaw}<pre class="imp-raw">{rawText}</pre>{/if}
    <div class="modal-actions">
      <button class="btn" onclick={() => (stage = 'drop')}>Back</button>
      <button class="btn accent" onclick={confirm}>Add {rows.length} row{rows.length === 1 ? '' : 's'} to trip</button>
    </div>
  {/if}
</Modal>
