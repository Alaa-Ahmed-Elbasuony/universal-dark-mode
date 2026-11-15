import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Test fixture only: bundles a small real React app so E2E runs against actual React DOM.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'tests/e2e/pages',
    emptyOutDir: false,
    target: 'es2022',
    lib: {
      entry: resolve(import.meta.dirname, 'tests/e2e/spa-src/main.tsx'),
      formats: ['iife'],
      name: 'SpaFixture',
      fileName: () => 'spa.js',
    },
  },
});
