// Drives test/ocr-harness.html through the REAL OCR pipeline in headless Chromium.
// Needs the dev server running (`npm run dev`) and playwright available:
//   node test/ocr-e2e.mjs [http://localhost:5173]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5173';
const exePath = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';

const browser = await chromium.launch({ executablePath: exePath }).catch(() => chromium.launch());
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`${base}/test/ocr-harness.html`);
const result = await page.evaluate(() => window.__run(), { timeout: 120000 });
console.log(JSON.stringify({ pass: result.pass, reward: result.reward, legs: result.legs }, null, 2));
if (!result.pass) {
  console.error('--- expected ---'); console.error(JSON.stringify(result.expected, null, 2));
  console.error('--- raw OCR (best pass) ---'); console.error(result.rawFirstPass);
}
await browser.close();
process.exit(result.pass ? 0 : 1);
