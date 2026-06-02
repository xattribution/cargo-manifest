<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { aggregate, groupEntries, flatEntries } from '../lib/crate';
  import { missionColor, missionFg } from '../lib/mission';
  import { pillList } from '../lib/format';
  import type { Entry } from '../lib/crate';
  import type { Item } from '../lib/types';

  let {
    field, cls, mode, labelField, otherField, otherPrefix,
  }: {
    field: 'destination' | 'source';
    cls: 'dest' | 'src';
    mode: 'pickup' | 'dropoff';
    labelField: 'commodity';
    otherField: 'source' | 'destination';
    otherPrefix: string;
  } = $props();

  const which = $derived(mode === 'pickup' ? 'pick' : 'drop');

  // Drop-off = real completion (it.done). Pick-up = "collected" = manually picked up OR
  // already delivered, so a source auto-checks once all its cargo has been dropped off.
  const complete = (it: Item) => (mode === 'pickup' ? it.pickedUp || it.done : it.done);

  interface Group { key: string; list: Entry[]; agg: ReturnType<typeof aggregate>; items: Item[]; allDone: boolean; someDone: boolean; }

  // Manual order (run.state.pickOrder/dropOrder) wins; new/unknown keys fall to the end
  // sorted by SCU desc. This keeps drag-reordering stable while new cargo still shows up.
  const groups = $derived.by((): Group[] => {
    const m = groupEntries(run.state.sections, field);
    const built = [...m.entries()].map(([key, list]) => {
      const items = list.map((x) => x.it);
      return {
        key, list, agg: aggregate(list), items,
        allDone: items.length > 0 && items.every(complete),
        someDone: items.some(complete),
      } as Group;
    });
    const order = which === 'pick' ? run.state.pickOrder : run.state.dropOrder;
    const idx = new Map(order.map((k, i) => [k, i]));
    return built.sort((a, b) => {
      const ai = idx.has(a.key) ? idx.get(a.key)! : Infinity;
      const bi = idx.has(b.key) ? idx.get(b.key)! : Infinity;
      if (ai !== bi) return ai - bi;
      return b.agg.scu - a.agg.scu;
    });
  });
  const empty = $derived(flatEntries(run.state.sections).length === 0);

  function toggle(g: Group) {
    const val = !g.allDone;
    if (mode === 'pickup') run.setGroupPicked(g.items, val);
    else run.setGroupDone(g.items, val);
  }

  // ---- pointer-based card drag-reorder ----
  let listEl: HTMLDivElement;
  let dragKey = $state<string | null>(null);
  function startDrag(key: string, e: PointerEvent) {
    dragKey = key;
    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag, { once: true });
    window.addEventListener('pointercancel', endDrag, { once: true });
  }
  function onMove(e: PointerEvent) {
    if (!dragKey || !listEl) return;
    const cards = [...listEl.querySelectorAll<HTMLElement>('.gcard')];
    const keys = cards.map((c) => c.dataset.key!).filter((k) => k !== dragKey);
    let idx = keys.length;
    let i = 0;
    for (const c of cards) {
      if (c.dataset.key === dragKey) continue;
      const b = c.getBoundingClientRect();
      if (e.clientY < b.top + b.height / 2) { idx = i; break; }
      i++;
    }
    keys.splice(idx, 0, dragKey);
    run.setCardOrder(which, keys);
  }
  function endDrag() {
    window.removeEventListener('pointermove', onMove);
    dragKey = null;
  }
</script>

<div class="card-list" bind:this={listEl}>
  {#if empty}
    <div class="empty-cards">Nothing here yet.</div>
  {:else}
    {#each groups as g (g.key)}
      <div class="gcard {cls}" class:done={g.allDone} class:dragging={dragKey === g.key} data-key={g.key}>
        <div class="ghead">
          <span class="cgrip" role="button" tabindex="-1" aria-label="Drag to reorder" title="Drag to reorder"
            onpointerdown={(e) => startDrag(g.key, e)}>⠿</span>
          <input type="checkbox" class="cardbox"
            title={mode === 'pickup' ? 'Mark as picked up (visual reminder only)' : 'Mark this drop-off complete'}
            checked={g.allDone} indeterminate={g.someDone && !g.allDone}
            onchange={() => toggle(g)} />
          <div class="gname">{g.key} <span class="gscu">{g.agg.scu.toLocaleString()} SCU</span></div>
        </div>
        <div class="gpills">
          {#each pillList(g.agg.totals) as p}<span class="pill {p.cls}">{p.n}<span class="mult">×</span>{p.size}</span>{/each}
          {#if g.agg.leftover > 0}<span class="pill leftover">{g.agg.leftover} unpacked</span>{/if}
          {#if pillList(g.agg.totals).length === 0 && g.agg.leftover === 0}<span style="color:var(--txt-faint)">—</span>{/if}
        </div>
        <div class="gmeta">{g.agg.crates} crate{g.agg.crates === 1 ? '' : 's'} · {g.items.length} item{g.items.length === 1 ? '' : 's'}</div>
        <div class="gitems">
          {#each g.list as entry (entry.it.id)}
            <div class="giline" class:gi-done={complete(entry.it)}>
              <span class="mchip" style="background:{missionColor(entry.it.mission)};color:{missionFg(missionColor(entry.it.mission))}" title="Mission {entry.it.mission}">{entry.it.mission}</span>
              <span class="gi-name">{entry.it[labelField] || '(unnamed)'}</span>
              <span class="gi-scu">{Math.max(0, Math.floor(Number(entry.it.scu) || 0))} SCU</span>
              {#if (entry.it[otherField] || '').trim()}<span class="gi-other">{otherPrefix} {entry.it[otherField]}</span>{/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>
