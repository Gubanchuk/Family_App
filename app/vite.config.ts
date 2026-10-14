/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './pwa.config.ts';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest,
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], importScripts: ['/push-sw.js'] },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    // PGlite boots a full Postgres per test file; give setup hooks room under parallel load.
    hookTimeout: 60_000,
    // The first import of a screen compiles a large module graph; under the parallel PGlite load it can pass 5 s.
    testTimeout: 20_000,
  },
});
