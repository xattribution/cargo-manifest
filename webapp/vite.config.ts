import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: { port: 5173, host: true },
  preview: { port: 8080, host: true },
  build: { target: 'es2020', sourcemap: false },
  // tesseract.js is dynamically imported and uses our locally-vendored worker/core
  // (public/ocr); keep Vite from trying to pre-bundle its worker/node bits.
  optimizeDeps: { exclude: ['tesseract.js'] },
});
