import { test } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const state = JSON.parse(readFileSync(new URL('../../.e2e-state.json', import.meta.url)));
const WIDTHS = process.env.QA_WIDTHS ? process.env.QA_WIDTHS.split(',').map(Number) : [1440, 390];
const ONLY = process.env.QA_ONLY ? process.env.QA_ONLY.split(',') : null;

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
}

async function shoot(page, name) {
  if (ONLY && !ONLY.some((o) => name.includes(o))) return;
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await settle(page);
    // The app shell scrolls inside <main>; expand it so the full page is captured.
    await page.addStyleTag({ content: '.h-screen{height:auto!important;min-height:100vh}.h-screen>div,main{overflow:visible!important}#sidebar{align-self:stretch}' });
    mkdirSync(`qa-screenshots/${w}`, { recursive: true });
    await page.screenshot({ path: `qa-screenshots/${w}/${name}.png`, fullPage: true });
  }
}

async function login(page, email, password) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('[data-testid=login-submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test('public pages', async ({ page }) => {
  for (const [name, path] of [
    ['public-login', '/login'],
    ['public-forgot', '/forgot-password'],
    ['public-register', '/register'],
    ['public-status', '/status'],
    ['public-set-password', '/set-password?token=abcdefghijklmnopqrstuvwxyz123456'],
    ['public-404', '/nope'],
  ]) {
    await page.goto(path);
    await shoot(page, name);
  }
});

test('platform owner is pointed to the Master Admin panel', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', state.superAdmin.email);
  await page.fill('#password', state.superAdmin.password);
  await page.click('[data-testid=login-submit]');
  await page.getByText('Use the Master Admin panel').waitFor();
  await shoot(page, 'public-login-owner-redirect');
});

test('society admin pages', async ({ page }) => {
  await login(page, state.societyAdmin.email, state.societyAdmin.password);
  for (const [name, path] of [
    ['society-dashboard', '/society'],
    ['society-residents', '/society/residents'],
    ['society-directory', '/society/residents?tab=approved'],
    ['society-structure', '/society/structure'],
    ['society-complaints', '/society/complaints'],
    ['society-announcements', '/society/announcements'],
    ['society-community', '/society/community'],
    ['society-voting', '/society/voting?status=all'],
    ['society-facilities', '/society/facilities'],
    ['society-facility-list', '/society/facilities?tab=facilities'],
    ['society-services', '/society/services'],
    ['society-listings', '/society/listings'],
    ['society-billing', '/society/billing'],
    ['society-payments', '/society/payments'],
    ['society-expenses', '/society/expenses'],
    ['society-ledger', '/society/ledger'],
    ['society-reports', '/society/reports'],
    ['society-staff', '/society/staff'],
    ['society-profile', '/society/profile'],
    ['society-categories', '/society/categories'],
    ['society-audit', '/society/audit'],
  ]) {
    await page.goto(path);
    await shoot(page, name);
  }
});

test('interactive states (drawers, modals, mobile nav)', async ({ page }) => {
  await login(page, state.societyAdmin.email, state.societyAdmin.password);
  const snap = async (name, w) => {
    await page.waitForTimeout(500);
    mkdirSync(`qa-screenshots/${w}`, { recursive: true });
    await page.screenshot({ path: `qa-screenshots/${w}/${name}.png` });
  };
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await page.goto('/society/billing');
    await page.getByTestId('invoices-table').locator('tbody tr').first().click();
    await page.getByTestId('invoice-detail').waitFor();
    await snap('state-invoice-drawer', w);
    await page.goto('/society/billing');
    await page.getByTestId('invoices-table').locator('tbody tr').nth(8).click();
    await page.getByTestId('open-record-payment').click();
    await snap('state-record-payment', w);
    await page.goto('/society/complaints');
    await page.getByTestId('complaints-table').locator('tbody tr').first().click();
    await page.getByTestId('complaint-detail').waitFor();
    await snap('state-complaint-drawer', w);
    await page.goto('/society/structure');
    await page.getByTestId('open-bulk').click();
    await page.locator('input[name=toFloor]').fill('3');
    await snap('state-bulk-modal', w);
    await page.goto('/society/staff');
    await page.getByTestId('invite-staff').click();
    await snap('state-invite-modal', w);
    if (w < 1024) {
      await page.goto('/society');
      await page.getByTestId('toggle-sidebar').click();
      await snap('state-mobile-nav', w);
    } else {
      await page.goto('/society');
      await page.getByTestId('toggle-sidebar').click();
      await snap('state-collapsed-sidebar', w);
      await page.getByTestId('toggle-sidebar').click();
      await page.getByTestId('notifications-bell').click();
      await snap('state-notifications', w);
    }
  }
});
