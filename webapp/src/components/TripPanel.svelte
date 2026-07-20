<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { prefs } from '../lib/prefs.svelte';
  import { aggregate, enabledDesc, ALL_SIZES } from '../lib/crate';
  import ItemRow from './ItemRow.svelte';
  import type { Trip } from '../lib/types';

  let { trip }: { trip: Trip } = $props();

  const sizes = $derived(enabledDesc(trip.sizes));
  const sub = $derived(aggregate(trip.items.map((it) => ({ it, sizes: trip.sizes }))));
  const colCount = $derived(6 + sizes.length + 3);

  // distinct used values in this trip, for the click-to-fill reference rail
  const usedCommodities = $derived([...new Set(trip.items.map((i) => i.commodity.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
  const usedLocations = $derived([...new Set(trip.items.flatMap((i) => [i.source.trim(), i.destination.trim()]).filter(Boolean))].sort((a, b) => a.localeCompare(b)));

  let tableEl: HTMLTableElement;
  // The editable, navigable columns in visual order.
  const NAV_COLS = ['mission', 'commodity', 'scu', 'source', 'destination'];

  // Fill the currently-focused field (or the last-focused one) with a reference value,
  // and copy it to the clipboard so paste still works elsewhere.
  function quickFill(val: string) {
    const el = document.activeElement as HTMLElement | null;
    const inp = el && (el.tagName === 'INPUT') && tableEl?.contains(el) ? (el as HTMLInputElement) : null;
    if (inp) {
      const id = inp.getAttribute('data-row'); const f = inp.getAttribute('data-f');
      const it = trip.items.find((x) => x.id === id);
      if (it && f && f in it) { (it as any)[f] = val; inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    navigator.clipboard?.writeText(val).catch(() => { /* clipboard unavailable */ });
  }

  // Directional Tab / Enter navigation across the editable grid.
  function focusCell(rowId: string, field: string) {
    const sel = `[data-row="${rowId}"][data-f="${field}"]`;
    const el = tableEl?.querySelector<HTMLElement>(sel);
    if (el) { el.focus(); (el as HTMLInputElement).select?.(); }
  }
  function curItems() { return run.state.sections.find((s) => s.id === trip.id)?.items ?? []; }

  // Move focus from (r,c) along an axis. `grow` lets Tab/Enter append a new row at the end.
  function move(r: number, c: number, axis: 'v' | 'h', back: boolean, grow: boolean) {
    const rows = trip.items;
    if (axis === 'v') {
      const nr = r + (back ? -1 : 1);
      if (nr >= rows.length) {
        if (!grow) return;
        run.addItem(trip.id);
        setTimeout(() => focusCell(curItems()[rows.length].id, NAV_COLS[c]), 0);
        return;
      }
      if (nr < 0) {                          // wrap up → previous column, last row
        const nc = (c - 1 + NAV_COLS.length) % NAV_COLS.length;
        focusCell(rows[rows.length - 1].id, NAV_COLS[nc]); return;
      }
      focusCell(rows[nr].id, NAV_COLS[c]);
    } else {
      let nc = c + (back ? -1 : 1);
      if (nc >= NAV_COLS.length) {            // wrap right → next row, first column
        const nr = r + 1;
        if (nr >= rows.length) {
          if (!grow) return;
          run.addItem(trip.id);
          setTimeout(() => focusCell(curItems()[rows.length].id, NAV_COLS[0]), 0);
          return;
        }
        focusCell(rows[nr].id, NAV_COLS[0]); return;
      }
      if (nc < 0) {                           // wrap left → previous row, last column
        const nr = r - 1;
        if (nr < 0) return;
        focusCell(rows[nr].id, NAV_COLS[NAV_COLS.length - 1]); return;
      }
      focusCell(rows[r].id, NAV_COLS[nc]);
    }
  }
  function onGridKeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (!t || t.tagName !== 'INPUT') return;
    const field = t.getAttribute('data-f'); const rowId = t.getAttribute('data-row');
    if (!field || !rowId || !NAV_COLS.includes(field)) return;
    const r = trip.items.findIndex((x) => x.id === rowId);
    const c = NAV_COLS.indexOf(field);
    if (r < 0) return;

    // Ctrl/Cmd + Arrow: subtle one-shot directional move (no auto-add). Ctrl avoids the
    // browser's Alt+Left/Right history navigation; Meta covers macOS.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      if (e.key === 'ArrowUp') move(r, c, 'v', true, false);
      else if (e.key === 'ArrowDown') move(r, c, 'v', false, false);
      else if (e.key === 'ArrowLeft') move(r, c, 'h', true, false);
      else move(r, c, 'h', false, false);
      return;
    }

    const isTab = e.key === 'Tab';
    const isEnter = e.key === 'Enter';
    if (!isTab && !isEnter) return;
    e.preventDefault();
    // Enter always moves vertically; Tab follows the chosen primary direction (Ctrl+Arrow is
    // the one-off override for moving the other way).
    const vertical = isEnter || prefs.tabDir === 'down';
    move(r, c, vertical ? 'v' : 'h', e.shiftKey, true);
  }

  // fixed column widths (the resizable three come from run.state.colW)
  const FX = { drag: 24, m: 30, scu: 70, size: 42, crates: 62, done: 28, del: 34 };
  const tableW = $derived(
    FX.drag + FX.m + run.state.colW.commodity + FX.scu + run.state.colW.source + run.state.colW.destination +
    sizes.length * FX.size + FX.crates + FX.done + FX.del,
  );

  // ---- pointer-based row drag-reorder (works with mouse + touch) ----
  let tbodyEl: HTMLTableSectionElement;
  let dragId = $state<string | null>(null);

  function startDrag(id: string, e: PointerEvent) {
    dragId = id;
    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag, { once: true });
    window.addEventListener('pointercancel', endDrag, { once: true });
  }
  function onMove(e: PointerEvent) {
    if (!dragId || !tbodyEl) return;
    const rows = [...tbodyEl.querySelectorAll<HTMLElement>('tr.item-row')].filter((r) => r.dataset.id !== dragId);
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const b = rows[i].getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { idx = i; break; }
    }
    run.reorder(trip.id, dragId, idx);
  }
  function endDrag() {
    window.removeEventListener('pointermove', onMove);
    dragId = null;
  }

  // ---- column resize (shared width across all trips, via run.state.colW) ----
  function startResize(key: 'commodity' | 'source' | 'destination', e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = run.state.colW[key];
    const move = (ev: PointerEvent) => run.setColW(key, startW + (ev.clientX - startX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function removeTrip() {
    if (trip.items.length && !confirm(`Remove “${trip.name || 'this trip'}” and its ${trip.items.length} item(s)?`)) return;
    if (!run.removeTrip(trip.id)) alert('Keep at least one trip.');
  }
  const arrow = (k: string) => (trip.sort && trip.sort.key === k ? (trip.sort.dir === 'asc' ? '▲' : '▼') : '');
</script>

<div class="mission" data-sec={trip.id}>
  <div class="panel">
    <div class="sec-top">
      <input class="sec-name" placeholder="Trip name" spellcheck="false"
        value={trip.name} oninput={(e) => run.renameTrip(trip.id, e.currentTarget.value)} />
      <span class="sec-sub">{sub.scu.toLocaleString()} SCU · {sub.crates} crate{sub.crates === 1 ? '' : 's'}</span>
      <button class="sec-del" title="Remove trip" onclick={removeTrip}>✕</button>
    </div>

    <div class="limit-label">Crate sizes allowed <span class="ll-hint">— click a size to switch it on / off (crates fill largest-first)</span></div>
    <div class="toggles">
      {#each ALL_SIZES as s}
        <button type="button" class="toggle" class:on={trip.sizes[s]} aria-pressed={trip.sizes[s]}
          title={(trip.sizes[s] ? 'Enabled' : 'Disabled') + ` — click to ${trip.sizes[s] ? 'disable' : 'enable'} ${s} SCU crates`}
          onclick={() => run.toggleSize(trip.id, s)}>
          <span class="tg-check">✓</span>
          <span class="num">{s}</span>
          <span class="lbl">SCU</span>
          <span class="tg-state">{trip.sizes[s] ? 'ON' : 'OFF'}</span>
        </button>
      {/each}
    </div>

    <div class="trip-body">
    <div class="tbl-scroll">
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <table class="tbl" style="table-layout:fixed;width:{tableW}px" bind:this={tableEl} onkeydown={onGridKeydown}>
        <colgroup>
          <col style="width:{FX.drag}px" /><col style="width:{FX.m}px" />
          <col style="width:{run.state.colW.commodity}px" /><col style="width:{FX.scu}px" />
          <col style="width:{run.state.colW.source}px" /><col style="width:{run.state.colW.destination}px" />
          {#each sizes as _s}<col style="width:{FX.size}px" />{/each}
          <col style="width:{FX.crates}px" /><col style="width:{FX.done}px" /><col style="width:{FX.del}px" />
        </colgroup>
        <thead>
          <tr>
            <th class="drag-col"></th>
            <th class="m-col sortable" title="Mission #" onclick={() => run.sortTrip(trip.id, 'mission')}>M <span class="arrow">{arrow('mission')}</span></th>
            <th class="sortable rcol" onclick={() => run.sortTrip(trip.id, 'commodity')}>Commodity <span class="arrow">{arrow('commodity')}</span>
              <button type="button" class="col-resizer" tabindex="-1" aria-label="Resize column" title="Drag to resize" onpointerdown={(e) => startResize('commodity', e)} onclick={(e) => e.stopPropagation()}></button></th>
            <th class="sortable th-scu" onclick={() => run.sortTrip(trip.id, 'scu')}>SCU <span class="arrow">{arrow('scu')}</span></th>
            <th class="sortable rcol" onclick={() => run.sortTrip(trip.id, 'source')}>From <span class="arrow">{arrow('source')}</span>
              <button type="button" class="col-resizer" tabindex="-1" aria-label="Resize column" title="Drag to resize" onpointerdown={(e) => startResize('source', e)} onclick={(e) => e.stopPropagation()}></button></th>
            <th class="sortable rcol" onclick={() => run.sortTrip(trip.id, 'destination')}>To <span class="arrow">{arrow('destination')}</span>
              <button type="button" class="col-resizer" tabindex="-1" aria-label="Resize column" title="Drag to resize" onpointerdown={(e) => startResize('destination', e)} onclick={(e) => e.stopPropagation()}></button></th>
            {#each sizes as s}<th class="szcol" title="{s} SCU crates">{s}</th>{/each}
            <th class="th-crates">Crates</th><th class="done-col" title="Complete">✓</th><th></th>
          </tr>
        </thead>
        <tbody bind:this={tbodyEl}>
          {#if trip.items.length === 0}
            <tr class="empty-row"><td colspan={colCount}>No cargo on this trip yet.</td></tr>
          {:else}
            {#each trip.items as item (item.id)}
              <ItemRow {trip} {item} {sizes} {dragId} onGripDown={startDrag} />
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

      {#if usedCommodities.length || usedLocations.length}
        <aside class="ref-rail" aria-label="Quick fill">
          <div class="ref-tip">click to copy / fill</div>
          {#if usedCommodities.length}
            <div class="ref-grp">
              <div class="ref-h">Commodities</div>
              {#each usedCommodities as v}<button type="button" class="ref-chip" title="Fill focused cell + copy" onclick={() => quickFill(v)}>{v}</button>{/each}
            </div>
          {/if}
          {#if usedLocations.length}
            <div class="ref-grp">
              <div class="ref-h">Locations</div>
              {#each usedLocations as v}<button type="button" class="ref-chip" title="Fill focused cell + copy" onclick={() => quickFill(v)}>{v}</button>{/each}
            </div>
          {/if}
        </aside>
      {/if}
    </div>

    <div class="add-row-wrap">
      <button class="btn ghost sm" onclick={() => run.addItem(trip.id)}>+ Add Commodity</button>
    </div>
  </div>
</div>
