import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite for the Tor-Sockets web app.
 *
 * Strategy: read-heavy smoke + contract tests. The web app is server-rendered
 * (RSC + ISR), so E2E validates the real SSR output, the REST API contract,
 * and the federation crypto end-to-end. Tests are resilient to the amount of
 * DB data (they assert structure/shape, not exact values) so they pass against
 * the dev DB (real data) and a fresh CI DB alike.
 *
 * Prerequisites: `docker compose up -d` and the env sourced (DATABASE_URL,
 * FEDERATION_PRIVATE_KEY_PATH, TOR_SOCKETS_BASE_URL) - same as `pnpm dev`.
 */
// Point the suite at an already-running server (e.g. a production build on
// another port) with E2E_BASE_URL; otherwise it drives `pnpm dev` on :3000.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const usesExternalServer = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: usesExternalServer
    ? undefined
    : {
        // Reuse a running dev server locally; start fresh in CI.
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
