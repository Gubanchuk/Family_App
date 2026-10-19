/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest } from './pwa.config.ts';

// Shown in Settings so a phone can tell which version it runs: build time (Moscow) and commit.
const BUILD = [
  new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ''),
  (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
].filter(Boolean).join(' · ');

export default defineConfig(({ mode }) => ({
  define: { __BUILD__: JSON.stringify(BUILD) },
  // The dev server passes /sb/ on to the base like the site's rewrite does (vercel.json), so
  // VITE_SUPABASE_PROXY=/sb runs the app on the same road the phones use.
  server: { proxy: { '/sb': { target: loadEnv(mode, process.cwd(), '').VITE_SUPABASE_URL || 'http://localhost:54321', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/sb/, '') } } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest,
      // /sb/ is the base behind the site: sign-in through Google opens it as a page and must reach the network.
      workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/sb\//], globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], importScripts: ['/push-sw.js'] },
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
    // Each PGlite is a whole Postgres in memory; on an 8 GB machine more than three at once starts swapping
    // and DB tests time out at random.
    maxWorkers: 3,
  },
}));
