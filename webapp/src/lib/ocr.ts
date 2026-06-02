// Lazy OCR via Tesseract.js, wired to LOCALLY VENDORED assets (public/ocr) so it runs fully
// offline and the image never leaves the browser. tesseract.js itself is dynamically
// imported the first time, so it adds nothing to the initial bundle.
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = `${import.meta.env.BASE_URL}ocr`;
      const worker = await createWorker('eng', 1, {
        workerPath: `${base}/worker.min.js`,
        langPath: base,
        corePath: base,
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          if (onProgress && m.status === 'recognizing text') onProgress(m.progress);
        },
      });
      return worker;
    })();
  }
  return workerPromise;
}

// Preprocess into a canvas. Variants trade off differently against stylized game text, so we
// run several and vote — `mode` picks the transform.
//  0: upscale + grayscale + soft contrast (good general)
//  1: stronger upscale + hard threshold (crisp edges, helps thin glyphs)
//  2: upscale + grayscale + gentle gamma (helps faint/antialiased text)
async function preprocess(file: Blob, mode: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const targetW = mode === 1 ? 2000 : 1600;
  const scale = Math.min(4, Math.max(1, targetW / bmp.width));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (mode === 1) {
      v = v > 135 ? 255 : 0;                                   // hard threshold
    } else if (mode === 2) {
      v = Math.min(255, Math.pow(v / 255, 0.72) * 255);        // gamma lift
    } else {
      v = v < 110 ? v * 0.5 : Math.min(255, (v - 110) * 1.7 + 110); // soft contrast
    }
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  bmp.close?.();
  return canvas;
}

export interface OcrResult { text: string; confidence: number; }

// Run a single pass with the given preprocessing mode.
export async function ocrPass(file: Blob, mode: number, onProgress?: (p: number) => void): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  const canvas = await preprocess(file, mode);
  const { data } = await worker.recognize(canvas);
  canvas.width = canvas.height = 0;
  return { text: data.text, confidence: data.confidence };
}

// Multi-pass: run `passes` preprocessing variants. Returns all raw texts (highest-confidence
// first) so the parser can deconflict per field. The image never persists.
export async function ocrMulti(file: Blob, passes = 3, onProgress?: (p: number) => void): Promise<OcrResult[]> {
  const modes = [0, 1, 2].slice(0, Math.max(1, passes));
  const out: OcrResult[] = [];
  for (let i = 0; i < modes.length; i++) {
    const r = await ocrPass(file, modes[i], (p) => onProgress?.((i + p) / modes.length));
    out.push(r);
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
