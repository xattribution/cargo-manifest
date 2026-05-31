// Copies the baseline catalog CSVs (the single source of truth lives in the repo-root
// /data folder) into webapp/public/data so Vite can serve them as static assets.
// Run automatically before `dev` and `build`. public/data is gitignored — it is a
// generated copy, never edit it directly; edit ../data/*.csv instead.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FILES = ['ships.csv', 'commodities.csv', 'locations.csv'];

// Look for the baseline either at repo-root /data (normal checkout) or alongside the
// webapp folder (Docker build copies it to /app/data with webapp at /app/webapp).
const candidates = [resolve(here, '../../data'), resolve(here, '../data')];
const src = candidates.find((dir) => FILES.every((f) => existsSync(resolve(dir, f))));

if (!src) {
  console.error('[sync-data] Could not find baseline CSVs in any of:', candidates);
  process.exit(1);
}

const out = resolve(here, '../public/data');
mkdirSync(out, { recursive: true });
for (const f of FILES) copyFileSync(resolve(src, f), resolve(out, f));
console.log(`[sync-data] Copied ${FILES.length} baseline CSVs from ${src} -> ${out}`);
