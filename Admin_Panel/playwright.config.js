import { defineConfig } from '@playwright/test';

// Tests always start their OWN dev server, proxied to the LOCAL backend — never reuse a running `npm run dev`
// (that one proxies to the live server) and never point at production.
const API_TARGET = process.env.API_BASE || 'http://127.0.0.1:3013';
const PORT = Number(process.env.E2E_PORT) || 5184;
if (API_TARGET.includes('skillinnovex.in') || API_TARGET.includes('mongodb.net')) throw new Error('Refusing to run UI tests against production.');

/**
 * End-to-end UI tests against a dedicated Vite dev server (E2E_PORT, default 5184) and a LOCAL backend (API_BASE, default 3013).
 * Never point this at production. Run: npm run e2e
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1366, height: 860 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 60_000, env: { DEV_PROXY_TARGET: API_TARGET } },
});
