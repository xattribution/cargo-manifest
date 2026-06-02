// One-time (committed) fetch of the Tesseract English traineddata into vendor/tessdata,
// which IS tracked in git so offline/Docker builds need no network. Re-run only to update.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../vendor/tessdata');
mkdirSync(out, { recursive: true });
const dest = resolve(out, 'eng.traineddata.gz');
if (existsSync(dest) && !process.argv.includes('--force')) {
  console.log('[fetch-tessdata] already present:', dest, '(use --force to refresh)');
  process.exit(0);
}
const url = 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz';
console.log('[fetch-tessdata] downloading', url);
const res = await fetch(url);
if (!res.ok) { console.error('[fetch-tessdata] failed:', res.status); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(dest, buf);
console.log(`[fetch-tessdata] saved ${(buf.length / 1024 / 1024).toFixed(1)} MB -> ${dest}`);
