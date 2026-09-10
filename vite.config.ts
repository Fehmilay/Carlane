import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100000,
    sourcemap: false,
    minify: 'esbuild',
  },
  esbuild: { keepNames: true },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
