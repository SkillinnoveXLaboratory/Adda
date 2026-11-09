import { defineConfig } from '@playwright/test';

// UI audit: every page at 390 px and 1440 px against the LOCAL backend — never production.
const API_TARGET = process.env.API_BASE || 'http://127.0.0.1:3013';
if (API_TARGET.includes('skillinnovex.in') || API_TARGET.includes('mongodb.net')) throw new Error('Refusing to run UI tests against production.');
const PORT = Number(process.env.E2E_PORT || 5186);

/** Run: API_BASE=http://127.0.0.1:3020 npm run ui-audit   (SHOTS_DIR=<folder> also saves full-page screenshots). */
export default defineConfig({
  testDir: 'tests/audit',
  timeout: 600_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, browserName: 'chromium', headless: true },
  webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 60_000, env: { DEV_PROXY_TARGET: API_TARGET, VITE_API_BASE_URL: '/' } },
});
