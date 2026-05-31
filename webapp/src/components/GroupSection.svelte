<script lang="ts">
  import { run } from '../stores/run.svelte';
  import { aggregate, groupEntries, flatEntries } from '../lib/crate';
  import { missionColor } from '../lib/mission';
  import { pillList } from '../lib/format';
  import type { Entry } from '../lib/crate';
  import type { Item } from '../lib/types';

  let {
    field, cls, title, hint, open, onToggle, labelField, otherField, otherPrefix,
  }: {
    field: 'destination' | 'source';
    cls: 'dest' | 'src';
    title: string;
    hint: string;
    open: boolean;
    onToggle: () => void;
    labelField: 'commodity';
    otherField: 'source' | 'destination';
    otherPrefix: string;
  } = $props();

  interface Group { key: string; list: Entry[]; agg: ReturnType<typeof aggregate>; items: Item[]; allDone: boolean; someDone: boolean; }

  const groups = $derived.by((): Group[] => {
    const m = groupEntries(run.state.sections, field);
    return [...m.entries()]
      .sort((a, b) => aggregate(b[1]).scu - aggregate(a[1]).scu)
      .map(([key, list]) => ({
        key,
        list,
        agg: aggregate(list),
        items: list.map((x) => x.it),
        allDone: list.length > 0 && list.every((x) => x.it.done),
        someDone: list.some((x) => x.it.done),
      }));
  });
  const empty = $derived(flatEntries(run.state.sections).length === 0);
</script>

<section>
  <div class="sec-head collapse-head" class:collapsed={!open} role="button" tabindex="0"
    onclick={onToggle} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}>
    <div class="bar" style={cls === 'dest' ? 'background:var(--amber)' : ''}></div>
    <h2>{title}</h2><span class="hint">{hint}</span><span class="caret">▾</span>
  </div>
  <div class="group-grid" class:collapsed={!open}>
    {#if empty}
      <div style="color:var(--txt-faint);font-size:13px;padding:4px">Nothing to group yet.</div>
    {:else}
      {#each groups as g (g.key)}
        <div class="gcard {cls}" class:done={g.allDone}>
          <div class="ghead">
            <input type="checkbox" class="cardbox" title="Mark this stop complete"
              checked={g.allDone} indeterminate={g.someDone && !g.allDone}
              onchange={() => run.setGroupDone(g.items, !g.allDone)} />
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
              <div class:gi-done={entry.it.done}>
                <span class="mdot" style="background:{missionColor(entry.it.mission)}"></span>
                <span>{entry.it[labelField] || '(unnamed)'}</span>
                — {Math.max(0, Math.floor(Number(entry.it.scu) || 0))} SCU{#if (entry.it[otherField] || '').trim()} <span style="color:var(--txt-faint)">{otherPrefix} {entry.it[otherField]}</span>{/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>
