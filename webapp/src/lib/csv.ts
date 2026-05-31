// Quote-aware CSV parse/serialize. Direct port of parseCSV/toCSV from the single-file app
// (handles escaped quotes, CRLF, and a leading BOM). Verified behaviour-identical.
import type { Category, CatalogRow } from './types';

export function parseCSV(text: string): Category {
  if (!text) return { header: [], rows: [] };
  text = text.replace(/^﻿/, '');
  const recs: string[][] = [];
  let rec: string[] = [];
  let f = '';
  let i = 0;
  let q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      f += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { rec.push(f); f = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { rec.push(f); recs.push(rec); rec = []; f = ''; i++; continue; }
    f += c; i++;
  }
  if (f.length > 0 || rec.length > 0) { rec.push(f); recs.push(rec); }
  if (!recs.length) return { header: [], rows: [] };
  const header = recs.shift()!.map((h) => h.trim());
  const rows = recs
    .filter((r) => r.some((x) => x != null && x.trim() !== ''))
    .map((r) => {
      const o: CatalogRow = {};
      header.forEach((h, idx) => (o[h] = r[idx] != null ? r[idx].trim() : ''));
      return o;
    });
  return { header, rows };
}

export function toCSV(header: string[], rows: CatalogRow[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.map(esc).join(',')];
  for (const r of rows) lines.push(header.map((h) => esc(r[h])).join(','));
  return lines.join('\r\n') + '\r\n';
}
