import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { login } from './helpers.js';

/** Uses the treasurer account created by `npm run api-check` (.e2e-state.json). */
const statePath = new URL('../../.e2e-state.json', import.meta.url);
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath)) : null;

test('treasurer sees finance, cannot manage buildings or open complaints', async ({ page }) => {
  test.skip(!state?.treasurer, 'Run npm run api-check first to create the treasurer account');
  await login(page, state.treasurer.email, state.treasurer.password);
  await expect(page.getByTestId('society-dashboard')).toBeVisible();

  const nav = page.locator('#sidebar');
  await expect(nav.getByText('Billing & invoices')).toBeVisible();
  await expect(nav.getByText('Complaints')).toHaveCount(0);
  await expect(nav.getByText('Community')).toHaveCount(0);
  await expect(nav.getByText('Voting')).toHaveCount(0);

  // Read-only structure: write buttons disabled with the reason.
  await page.goto('/society/structure');
  await expect(page.getByTestId('add-building')).toBeDisabled();
  await expect(page.locator('[title="Your role (Treasurer) cannot do this"]').first()).toBeVisible();
  await expect(page.getByText('Only society admins can add or edit buildings and flats.')).toBeVisible();

  // Direct URL to a forbidden module shows a designed lock state, not a broken page.
  await page.goto('/society/complaints');
  await expect(page.getByText('Not available for your role')).toBeVisible();
  await page.goto('/society/voting');
  await expect(page.getByText('Not available for your role')).toBeVisible();

  // Finance works.
  await page.goto('/society/billing');
  await expect(page.getByTestId('invoices-table')).toBeVisible();
  await expect(page.getByTestId('open-generate')).toBeEnabled();

  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);
});
