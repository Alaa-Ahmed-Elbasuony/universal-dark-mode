import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The MAIN-world hook is a separate tiny IIFE, injected into the page's own JS world.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/main-world-hook.ts'),
      formats: ['iife'],
      name: 'UdmMainWorld',
      fileName: () => 'main-world.js',
    },
  },
});
