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
        langPath: base,            // serves eng.traineddata.gz from public/ocr
        corePath: base,            // serves tesseract-core-*-lstm.wasm(.js)
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

// Upscale + grayscale + light threshold: the single biggest accuracy lever on game UI text.
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(3, Math.max(1, 1600 / bmp.width));
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
    // luminance; SC objective text is bright on dark, so boost contrast around mid
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    v = v < 110 ? v * 0.5 : Math.min(255, (v - 110) * 1.7 + 110);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  bmp.close?.();
  return canvas;
}

export interface OcrResult { text: string; confidence: number; }

export async function ocrImage(file: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  const canvas = await preprocess(file);
  const { data } = await worker.recognize(canvas);
  // free the canvas promptly; the image is never persisted anywhere
  canvas.width = canvas.height = 0;
  return { text: data.text, confidence: data.confidence };
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
