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

  // Drop-off = real completion (it.done). Pick-up = "collected" = manually picked up OR
  // already delivered, so a source auto-checks once all its cargo has been dropped off.
  const complete = (it: Item) => (mode === 'pickup' ? it.pickedUp || it.done : it.done);

  interface Group { key: string; list: Entry[]; agg: ReturnType<typeof aggregate>; items: Item[]; allDone: boolean; someDone: boolean; }

  const groups = $derived.by((): Group[] => {
    const m = groupEntries(run.state.sections, field);
    return [...m.entries()]
      .sort((a, b) => aggregate(b[1]).scu - aggregate(a[1]).scu)
      .map(([key, list]) => {
        const items = list.map((x) => x.it);
        return {
          key, list, agg: aggregate(list), items,
          allDone: items.length > 0 && items.every(complete),
          someDone: items.some(complete),
        };
      });
  });
  const empty = $derived(flatEntries(run.state.sections).length === 0);

  function toggle(g: Group) {
    const val = !g.allDone;
    if (mode === 'pickup') run.setGroupPicked(g.items, val);
    else run.setGroupDone(g.items, val);
  }
</script>

<div class="card-list">
  {#if empty}
    <div class="empty-cards">Nothing here yet.</div>
  {:else}
    {#each groups as g (g.key)}
      <div class="gcard {cls}" class:done={g.allDone}>
        <div class="ghead">
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
