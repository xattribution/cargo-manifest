// Small presentation helpers shared by components.
import { aggregate, flatEntries, groupEntries, deliveredScu, ALL_SIZES } from './crate';
import type { RunState } from './types';

// "2×32 · 1×16 · 3×8" — the ledger-style crate breakdown line (replaces the old chip row).
export function sizeLine(counts: Record<number, number>): string {
  return ALL_SIZES.filter((s) => counts[s]).map((s) => `${counts[s]}×${s}`).join(' · ');
}

// Datalist names = catalog names ∪ values already used in the run (matches original namesFor()).
export function datalistNames(catNames: string[], used: string[]): string[] {
  const s = new Set<string>();
  for (const n of catNames) if (n.trim()) s.add(n.trim());
  for (const u of used) if (u && u.trim()) s.add(u.trim());
  return [...s].sort((a, b) => a.localeCompare(b));
}

// Canonical plaintext serializer (Copy Summary Text). Mirrors summaryText() from the original.
export function summaryText(state: RunState): string {
  const agg = aggregate(flatEntries(state.sections));
  let out = `${state.name} — Cargo Manifest\nTotal: ${agg.scu} SCU in ${agg.crates} crates\n`;
  const parts: string[] = [];
  for (const s of ALL_SIZES) if (agg.totals[s]) parts.push(`${agg.totals[s]}× ${s}`);
  if (parts.length) out += `Crates: ${parts.join(', ')}\n`;
  if (agg.leftover > 0) out += `Unpacked: ${agg.leftover} SCU\n`;
  const delivered = deliveredScu(state.sections);
  if (delivered > 0) out += `Delivered: ${delivered}/${agg.scu} SCU\n`;
  out += `\nBy destination:\n`;
  const groups = [...groupEntries(state.sections, 'destination').entries()].sort((a, b) => aggregate(b[1]).scu - aggregate(a[1]).scu);
  for (const [k, list] of groups) {
    const a = aggregate(list);
    const p: string[] = [];
    for (const s of ALL_SIZES) if (a.totals[s]) p.push(`${a.totals[s]}×${s}`);
    out += `  ${k}: ${a.scu} SCU (${a.crates} crates${p.length ? ' — ' + p.join(', ') : ''})\n`;
  }
  return out;
}
