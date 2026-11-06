import { defineConfig } from '@playwright/test';

// Tests always start their OWN dev server, proxied to the LOCAL backend — never reuse a running `npm run dev`
// (that one proxies to the live server) and never point at production.
const API_TARGET = process.env.API_BASE || 'http://127.0.0.1:3013';
if (API_TARGET.includes('skillinnovex.in') || API_TARGET.includes('mongodb.net')) throw new Error('Refusing to run UI tests against production.');
const PORT = Number(process.env.E2E_PORT || 5183);

/** Visual QA: screenshots of every main page at 1440 and 390 px → qa-screenshots/ (gitignored). */
export default defineConfig({
  testDir: 'tests/qa',
  timeout: 900_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, browserName: 'chromium', headless: true },
  webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: false, timeout: 60_000, env: { DEV_PROXY_TARGET: API_TARGET, VITE_API_BASE_URL: '/' } },
});
