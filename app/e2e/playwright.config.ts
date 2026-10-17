import { defineConfig, devices } from '@playwright/test';

// End-to-end runs drive the dev server against the Supabase project from app/.env.local.
// Every run signs up fresh users on example.com and creates its own families.
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5174';

export default defineConfig({
  testDir: '.',
  // Sign-up, the first recipe download and realtime round trips take tens of seconds on a cold start.
  timeout: 240_000,
  expect: { timeout: 45_000 },
  // Runs share one live project and its sign-up rate limit.
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results',
  // The installed Google Chrome: Playwright's own browser download is unreliable from this network.
  use: { ...devices['Pixel 7'], channel: 'chrome', actionTimeout: 30_000, baseURL: BASE_URL, locale: 'ru-RU', timezoneId: 'Europe/Moscow', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --port 5174 --strictPort', url: BASE_URL, reuseExistingServer: true, timeout: 120_000 },
});
