import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Content scripts cannot be ES modules in MV3, so build one self-contained IIFE.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/content-entry.ts'),
      formats: ['iife'],
      name: 'UdmContent',
      fileName: () => 'content.js',
    },
  },
});
