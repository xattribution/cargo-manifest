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
}

export function missionRollups(sections: Trip[]): MissionRollup[] {
  const byMission = new Map<number, { entries: { it: any; sizes: any }[]; src: Set<string>; dst: Set<string> }>();
  for (const sec of sections) {
    for (const it of sec.items) {
      const m = Math.max(1, Math.min(10, Number(it.mission) || 1));
      let b = byMission.get(m);
      if (!b) { b = { entries: [], src: new Set(), dst: new Set() }; byMission.set(m, b); }
      b.entries.push({ it, sizes: sec.sizes });
      const s = (it.source || '').trim().toLowerCase();
      const d = (it.destination || '').trim().toLowerCase();
      if (s) b.src.add(s);
      if (d) b.dst.add(d);
    }
  }
  const out: MissionRollup[] = [];
  for (const [mission, b] of byMission) {
    const agg = aggregate(b.entries);
    out.push({
      mission,
      agg,
      maxSize: maxCrateSize(agg.totals),
      sources: b.src.size,
      dests: b.dst.size,
      items: b.entries.length,
      done: b.entries.filter((e) => e.it.done).length,
    });
  }
  return out.sort((a, b) => a.mission - b.mission);
}
