// Per-mission rollup. Buckets every cargo line by its mission # (1–10) and aggregates,
// so the Missions panel can show SCU/crates/size-breakdown + pickup/dropoff counts and
// drive per-mission ship assignment.
import { aggregate, maxCrateSize } from './crate';
import type { Trip } from './types';
import type { Aggregate } from './crate';

export interface MissionRollup {
  mission: number;
  agg: Aggregate;
  maxSize: number; // largest crate size present (for grid-aware fit)
  sources: number; // distinct pickup locations
  dests: number; // distinct dropoff locations
  items: number;
  done: number; // delivered lines
  doneScu: number; // delivered SCU (lines marked done)
}

// `order` is the user's display order from state.missionOrder. Missions with items always
// appear; blank missions (in `order` but with no items) are kept so you can build them up.
export function missionRollups(sections: Trip[], order: number[] = []): MissionRollup[] {
  const byMission = new Map<number, { entries: { it: any; sizes: any }[]; src: Set<string>; dst: Set<string> }>();
  const ensure = (m: number) => {
    let b = byMission.get(m);
    if (!b) { b = { entries: [], src: new Set(), dst: new Set() }; byMission.set(m, b); }
    return b;
  };
  for (const sec of sections) {
    for (const it of sec.items) {
      const m = Math.max(1, Math.min(10, Number(it.mission) || 1));
      const b = ensure(m);
      b.entries.push({ it, sizes: sec.sizes });
      const s = (it.source || '').trim().toLowerCase();
      const d = (it.destination || '').trim().toLowerCase();
      if (s) b.src.add(s);
      if (d) b.dst.add(d);
    }
  }
  for (const m of order) ensure(m); // keep blank missions visible

  const build = (mission: number): MissionRollup => {
    const b = byMission.get(mission)!;
    const agg = aggregate(b.entries);
    const doneEntries = b.entries.filter((e) => e.it.done);
    const doneScu = doneEntries.reduce((a, e) => a + Math.max(0, Math.floor(Number(e.it.scu) || 0)), 0);
    return { mission, agg, maxSize: maxCrateSize(agg.totals), sources: b.src.size, dests: b.dst.size, items: b.entries.length, done: doneEntries.length, doneScu };
  };
  // ordered first (in the user's order), then any remaining missions ascending
  const seen = new Set<number>();
  const out: MissionRollup[] = [];
  for (const m of order) if (byMission.has(m) && !seen.has(m)) { seen.add(m); out.push(build(m)); }
  for (const m of [...byMission.keys()].sort((a, b) => a - b)) if (!seen.has(m)) { seen.add(m); out.push(build(m)); }
  return out;
}
