<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { catalog } from '../stores/catalog.svelte';
  import { namesOf } from '../lib/catalog';
  import { parseMission } from '../lib/parseMission';
  import { matchName } from '../lib/match';
  import { ocrImage } from '../lib/ocr';
  import Modal from './Modal.svelte';

  let { tripId, onClose }: { tripId: string; onClose: () => void } = $props();

  type Stage = 'drop' | 'working' | 'review' | 'error';
  let stage = $state<Stage>('drop');
  let progress = $state(0);
  let errMsg = $state('');
  let maxBox = $state<number | null>(null);
  let rawText = $state('');

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
    stage = 'working'; progress = 0; errMsg = '';
    try {
      const { text } = await ocrImage(file, (p) => (progress = p));
      rawText = text;
      const parsed = parseMission(text);
      maxBox = parsed.maxBox;
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

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) handleImage(f);
  }
  function onPaste(e: ClipboardEvent) {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (f) handleImage(f);
  }
  function onPick(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) handleImage(f);
  }

  // recompute novelty when a field is edited
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

  function confirm() {
    run.addImportedLegs(
      tripId,
      rows.map((r) => ({ commodity: r.commodity, scu: Number(r.scu) || 0, source: r.source, destination: r.destination })),
      maxBox,
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
      <div class="imp-drop-s">Crop to the <b>Primary Objectives</b> panel for best results. The image is read in your browser and never uploaded.</div>
      <label class="btn accent sm imp-pick">Choose image<input type="file" accept="image/*" style="display:none" onchange={onPick} /></label>
    </div>
  {:else if stage === 'working'}
    <div class="imp-working">
      <div class="imp-bar"><span style="width:{Math.round(progress * 100)}%"></span></div>
      <div class="imp-sub">Reading text… {Math.round(progress * 100)}%</div>
    </div>
  {:else if stage === 'error'}
    <p class="imp-err">{errMsg}</p>
    <div class="modal-actions"><button class="btn" onclick={() => (stage = 'drop')}>Try again</button></div>
  {:else}
    <div class="imp-meta">
      <span><b>{rows.length}</b> leg{rows.length === 1 ? '' : 's'}</span>
      {#if maxBox != null}<span class="imp-box">box limit ≤ {maxBox} SCU (will set crate sizes)</span>{/if}
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
    <div class="modal-actions">
      <button class="btn" onclick={() => (stage = 'drop')}>Back</button>
      <button class="btn accent" onclick={confirm}>Add {rows.length} row{rows.length === 1 ? '' : 's'} to trip</button>
    </div>
  {/if}
</Modal>
