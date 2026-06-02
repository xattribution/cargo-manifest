// Build-time asset sync (runs before `dev`/`build`):
//  1. Copies the baseline catalog CSVs (single source of truth = repo-root /data) into
//     public/data so Vite serves them statically.
//  2. Vendors the Tesseract.js OCR runtime (worker + WASM core) from node_modules into
//     public/ocr so OCR works fully offline — no CDN, image never leaves the browser.
// public/data and the vendored OCR runtime are gitignored (regenerated). The eng
// traineddata is committed to the repo (see scripts/fetch-tessdata.mjs) so locked-down
// Docker builds with no network still have it.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FILES = ['ships.csv', 'commodities.csv', 'locations.csv'];

const candidates = [resolve(here, '../../data'), resolve(here, '../data')];
const src = candidates.find((dir) => FILES.every((f) => existsSync(resolve(dir, f))));
if (!src) {
  console.error('[sync-data] Could not find baseline CSVs in any of:', candidates);
  process.exit(1);
}
const dataOut = resolve(here, '../public/data');
mkdirSync(dataOut, { recursive: true });
for (const f of FILES) copyFileSync(resolve(src, f), resolve(dataOut, f));
console.log(`[sync-data] Copied ${FILES.length} baseline CSVs from ${src} -> ${dataOut}`);

// ---- OCR runtime (worker + core wasm) from node_modules ----
const ocrOut = resolve(here, '../public/ocr');
mkdirSync(ocrOut, { recursive: true });
const nm = resolve(here, '../node_modules');
const ocrAssets = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm'],
];
let copied = 0;
for (const [from, to] of ocrAssets) {
  const fp = resolve(nm, from);
  if (existsSync(fp)) { copyFileSync(fp, resolve(ocrOut, to)); copied++; }
  else console.warn(`[sync-data] OCR asset missing (run npm ci): ${from}`);
}
// committed traineddata (tracked) -> served location
const td = resolve(here, '../vendor/tessdata/eng.traineddata.gz');
if (existsSync(td)) { copyFileSync(td, resolve(ocrOut, 'eng.traineddata.gz')); copied++; }
else console.warn('[sync-data] vendor/tessdata/eng.traineddata.gz missing — run: npm run fetch-tessdata');
console.log(`[sync-data] Vendored ${copied} OCR runtime files -> ${ocrOut}`);
