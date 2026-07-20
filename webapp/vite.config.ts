import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: { port: 5173, host: true },
  preview: { port: 8080, host: true },
  build: { target: 'es2020', sourcemap: false },
  // tesseract.js is dynamically imported and CommonJS; it must be PRE-BUNDLED in dev or
  // the raw `require` throws in the browser (worker/core stay locally-vendored in
  // public/ocr regardless — paths are passed explicitly at createWorker time).
  optimizeDeps: { include: ['tesseract.js'] },
});
