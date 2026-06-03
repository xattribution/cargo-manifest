// Partial-completion route optimizer (Drop Off).
//
// Intent: when you only want to complete T% of the run (the Missions "Submit %" slider),
// you maximise rep-per-time by visiting the FEWEST destinations that still deliver ≥ T% of
// the total load — preferring a single stop, the one covering the most missions, and the
// least cargo (closest to the target, least overkill).
//
// Crucial constraint: you deliver WHOLE crates in the sizes already in your manifest (you
// can't repackage). So the "minimum cargo" for a chosen destination is the smallest subset
// of its actual crates whose SCU ≥ the target.

import { ALL_SIZES, crateCount } from './crate';

export interface DestStat {
  key: string;                       // destination name
  scu: number;                       // total SCU delivered there
  totals: Record<number, number>;    // crate size -> count at this destination
  missions: Set<number>;             // distinct mission #s served there
}

export interface DeliverPlan { counts: Record<number, number>; scu: number; crates: number; }

const sumScu = (t: Record<number, number>) => ALL_SIZES.reduce((s, sz) => s + sz * (t[sz] || 0), 0);

// Smallest whole-crate subset of `totals` whose SCU ≥ target (clamped to what's available).
// Minimises delivered SCU (least overage), then crate count. Respects the exact box sizes —
// it only uses crates that actually exist at that destination.
export function minCrateSubset(totals: Record<number, number>, target: number): DeliverPlan {
  const avail = sumScu(totals);
  const t = Math.min(Math.max(0, Math.ceil(target)), avail);
  if (t <= 0) return { counts: {}, scu: 0, crates: 0 };
  const allCrates = crateCount(totals);

  // Guard: exact DP only when small; otherwise greedy largest-first (the natural load order).
  if (avail > 6000 || allCrates > 600) {
    const counts: Record<number, number> = {}; let scu = 0;
    for (const sz of ALL_SIZES) { let n = totals[sz] || 0; while (n > 0 && scu < t) { counts[sz] = (counts[sz] || 0) + 1; scu += sz; n--; } }
    return { counts, scu, crates: crateCount(counts) };
  }

  // 0/1 bounded subset-sum DP: best[s] = min crates to reach EXACTLY sum s.
  const best = new Array(avail + 1).fill(Infinity);
  const pick: Array<Record<number, number> | undefined> = new Array(avail + 1);
  best[0] = 0; pick[0] = {};
  for (const sz of ALL_SIZES) {
    const n = totals[sz] || 0;
    for (let k = 0; k < n; k++) {
      for (let s = avail; s >= sz; s--) {
        const prev = pick[s - sz];
        if (prev && best[s - sz] + 1 < best[s]) {
          best[s] = best[s - sz] + 1;
          const next: Record<number, number> = { ...prev };
          next[sz] = (next[sz] || 0) + 1;
          pick[s] = next;
        }
      }
    }
  }
  // first reachable sum ≥ t = least overage (sums ascend); ties resolved by crate count in DP.
  for (let s = t; s <= avail; s++) {
    if (best[s] < Infinity) { const counts = pick[s] || {}; return { counts, scu: s, crates: crateCount(counts) }; }
  }
  return { counts: { ...totals }, scu: avail, crates: allCrates }; // fallback: everything
}

export interface OptResult {
  active: boolean;                       // pct<100 and there's load to optimise
  pct: number;
  total: number;                         // total run SCU (across destinations)
  target: number;                        // SCU you need to deliver to hit pct
  best: string | null;                   // ★ the single recommended destination
  recommended: Set<string>;              // the chosen route (single dest, or combo)
  qualifying: Set<string>;               // destinations that meet the target in ONE stop
  combo: boolean;                        // recommendation needs multiple stops
  plans: Record<string, DeliverPlan>;    // per recommended/qualifying key: min crate delivery
}

export function optimizeDropoff(stats: DestStat[], pct: number): OptResult {
  const total = stats.reduce((a, s) => a + s.scu, 0);
  const target = Math.ceil((total * pct) / 100);
  const res: OptResult = { active: pct < 100 && total > 0, pct, total, target, best: null, recommended: new Set(), qualifying: new Set(), combo: false, plans: {} };
  if (!res.active) return res;

  const cands = stats.filter((s) => s.key && s.key !== '(unassigned)');
  const qualifying = cands.filter((s) => s.scu >= target);
  for (const s of qualifying) res.qualifying.add(s.key);

  if (qualifying.length) {
    // most missions first, then least cargo to meet target (least overkill), then smallest dest
    const withPlan = qualifying.map((s) => ({ s, plan: minCrateSubset(s.totals, target) }));
    withPlan.sort((a, b) => (b.s.missions.size - a.s.missions.size) || (a.plan.scu - b.plan.scu) || (a.s.scu - b.s.scu));
    res.best = withPlan[0].s.key;
    res.recommended.add(res.best);
    for (const { s, plan } of withPlan) res.plans[s.key] = plan;
  } else {
    // no single stop reaches the target → minimal largest-first combo (heuristic, fewest stops)
    const sorted = [...cands].sort((a, b) => b.scu - a.scu);
    const route: DestStat[] = []; let acc = 0;
    for (const s of sorted) { route.push(s); acc += s.scu; if (acc >= target) break; }
    res.combo = true;
    let need = target;
    route.forEach((s, i) => {
      res.recommended.add(s.key);
      if (i < route.length - 1) { res.plans[s.key] = { counts: { ...s.totals }, scu: s.scu, crates: crateCount(s.totals) }; need -= s.scu; }
      else { res.plans[s.key] = minCrateSubset(s.totals, need); } // last stop: only what's still needed
    });
  }
  return res;
}
