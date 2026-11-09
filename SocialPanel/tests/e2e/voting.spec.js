import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { API, apiCall, dialog, expectToast, login, randPhone, RUN, SA } from './helpers.js';

/**
 * Society Voting (skills/society-voting/DRY_CHECK.md row 4), against the LOCAL backend only:
 * admin creates a vote (Interested / Not interested) → two members vote (API) → page shows 50 % / 50 %, turnout and
 * voter names → End now → publish result → result badge. Plus: form validation, search, CSV, delete with 0 votes,
 * Community's old polls link lands on Voting.
 * Optional screenshots: VOTING_SHOTS=<dir> npm run e2e -- voting
 */
if (/skillinnovex\.in|mongodb\.net|vercel\.app/.test(API)) throw new Error('Refusing to run against production.');
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'Voting2026secure';
const SHOTS = process.env.VOTING_SHOTS || '';
const QUESTION = `Should we install solar panels on the roof? (${RUN})`;
const NOTE = 'Cost is shared by all flats. Vote Interested if you want a quote meeting.';
const RESULT = 'Tied 1–1. The committee will hold a meeting on Sunday at 6 pm before deciding.';
const ist = (offsetDays) => new Date(Date.now() + 330 * 60000 + offsetDays * 86400000).toISOString().slice(0, 10);

let page;
const ctx = {};

async function shot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: w > 500 ? 900 : 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/${name}-${w}.png` });
  }
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.waitForTimeout(300);
}

/** Registration → owner approves → activate → society admin; building with A-101..A-202; two approved members. */
async function seed() {
  const owner = (await apiCall('POST', '/auth/admin/login', { body: SA })).accessToken;
  const email = `vote.e2e.${RUN.toLowerCase()}@example.com`;
  const reg = await apiCall('POST', '/public/society-registrations', {
    body: { societyName: `Voting Residency ${RUN}`, addressLine: '1 Test Road', area: 'Baner', city: 'Pune', state: 'Maharashtra', pincode: '411045', phone: randPhone(), email: `office.vote.${RUN.toLowerCase()}@example.com`, totalUnits: 10, representative: { name: 'Vote Admin', designation: 'Secretary', phone: randPhone(), email }, documents: [], submit: true },
  });
  const row = (await apiCall('GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: owner })).items[0];
  await apiCall('POST', `/platform/society-registrations/${row._id}/review`, { token: owner });
  const appr = await apiCall('POST', `/platform/society-registrations/${row._id}/approve`, { token: owner, body: {} });
  await apiCall('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.referenceCode, accessKey: reg.accessKey, password: PASSWORD } });
  const T = (await apiCall('POST', '/auth/admin/login', { body: { email, password: PASSWORD } })).accessToken;
  const b = await apiCall('POST', '/society/buildings', { token: T, body: { name: 'Tower A', floors: 2 } });
  await apiCall('POST', '/society/flats/bulk', { token: T, body: { buildingId: b._id, fromFloor: 1, toFloor: 2, unitsPerFloor: 2, pattern: '{building}-{floor}{unit}', areaSqft: 900 } });
  const member = async (name, flatNumber) => {
    const r = await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name, password: PASSWORD } });
    const m = await apiCall('POST', '/memberships', { token: r.accessToken, body: { societyId: appr.society._id, buildingId: b._id, flatNumber, residentType: 'owner' } });
    await apiCall('POST', `/society/memberships/${m._id}/approve`, { token: T, body: {} });
    return r.accessToken;
  };
  Object.assign(ctx, { email, T, rahul: await member('Rahul Voter', 'A-101'), priya: await member('Priya Voter', 'A-102') });
}

test.beforeAll(async ({ browser }) => {
  await seed();
  page = await browser.newPage({ acceptDownloads: true });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await login(page, ctx.email, PASSWORD);
});
test.afterAll(async () => page?.close());

test('Voting is in the sidebar; Community’s old polls tab lands on it', async () => {
  await page.goto('/society/community?tab=polls');
  await expect(page).toHaveURL(/\/society\/voting/);
  await page.goto('/society/community');
  await expect(page.getByRole('tab', { name: /Polls/ })).toHaveCount(0);
  await page.locator('#sidebar').getByRole('link', { name: 'Voting' }).click();
  await expect(page.getByRole('heading', { name: 'Voting' })).toBeVisible();
  await expect(page.getByText('No open votes')).toBeVisible();
});

test('create a vote: defaults, validation, preview', async () => {
  await page.getByTestId('new-vote').first().click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'New vote' })).toBeVisible();
  await expect(d.getByTestId('vote-option-input')).toHaveCount(2);
  await expect(d.getByTestId('vote-option-input').nth(0)).toHaveValue('Interested');
  await expect(d.getByTestId('vote-option-input').nth(1)).toHaveValue('Not interested');

  // Empty question + close time in the past → specific errors in place, nothing sent.
  await d.getByLabel('Close date').fill(ist(-1));
  await d.getByLabel('Close time').fill('10:00');
  await d.getByTestId('vote-publish').click();
  await expect(d.getByText('Write the question members will answer')).toBeVisible();
  await expect(d.getByText(/at least 5 minutes from now/)).toBeVisible();

  // Add / remove options (max 4).
  await d.getByRole('button', { name: 'Add option' }).click();
  await d.getByRole('button', { name: 'Add option' }).click();
  await expect(d.getByTestId('vote-option-input')).toHaveCount(4);
  await expect(d.getByRole('button', { name: 'Add option' })).toBeDisabled();
  await d.getByLabel('Remove option 4').click();
  await d.getByLabel('Remove option 3').click();
  await expect(d.getByTestId('vote-option-input')).toHaveCount(2);

  await d.locator('#vote-question').fill(QUESTION);
  await d.locator('#vote-note').fill(NOTE);
  await d.getByLabel('Close date').fill(ist(2));
  await d.getByLabel('Close time').fill('18:00');
  await expect(d.getByTestId('vote-preview')).toContainText(QUESTION);
  await expect(d.getByTestId('vote-preview')).toContainText('Not interested');
  await expect(d.getByTestId('vote-preview')).toContainText(/Closes in/);
  await shot('voting-new-vote-modal');
  await d.getByTestId('vote-publish').click();
  await expectToast(page, 'Vote published');

  // Detail opens for the new vote: 0 votes, nobody yet, result waits for the end.
  const detail = page.getByTestId('vote-detail');
  await expect(detail).toContainText(QUESTION);
  await expect(detail.getByTestId('vote-turnout')).toContainText('0 of 2 members (0%)');
  await expect(detail.getByText('Nobody has voted yet')).toBeVisible();
  await expect(detail.getByText(/Publish the result after the vote ends/)).toBeVisible();
  await expect(page.getByTestId('vote-delete')).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  const card = page.getByTestId('vote-card').filter({ hasText: QUESTION });
  await expect(card).toContainText(NOTE);
  await expect(card).toContainText(/Closes in/);
  ctx.pollId = (await apiCall('GET', '/society/polls?status=open', { token: ctx.T })).items.find((p) => p.question === QUESTION)._id;
});

test('two members vote → 50 % / 50 %, turnout and voter names', async () => {
  const poll = await apiCall('GET', `/resident/polls/${ctx.pollId}`, { token: ctx.rahul });
  await apiCall('POST', `/resident/polls/${ctx.pollId}/vote`, { token: ctx.rahul, body: { optionId: poll.options[0]._id } });
  await apiCall('POST', `/resident/polls/${ctx.pollId}/vote`, { token: ctx.priya, body: { optionId: poll.options[1]._id } });

  await page.reload();
  const card = page.getByTestId('vote-card').filter({ hasText: QUESTION });
  await expect(card.getByTestId('vote-option').nth(0)).toContainText('1 vote · 50%');
  await expect(card.getByTestId('vote-option').nth(1)).toContainText('1 vote · 50%');
  await expect(card.getByTestId('vote-turnout')).toContainText('2 of 2 members (100%)');
  await shot('voting-list-open');

  await card.getByTestId('vote-open').click();
  const detail = page.getByTestId('vote-detail');
  const table = detail.getByTestId('voters-table');
  await expect(table).toContainText('Rahul Voter');
  await expect(table).toContainText('A-101');
  await expect(table).toContainText('Interested');
  await expect(table).toContainText('Priya Voter');
  await expect(table).toContainText('Not interested');
  await expect(page.getByTestId('vote-delete')).toHaveCount(0);
  await expect(detail.getByTestId('delete-explained')).toBeVisible();

  await detail.getByPlaceholder('Search name or flat').fill('a-102');
  await expect(table).toContainText('Priya Voter');
  await expect(table).not.toContainText('Rahul Voter');
  await detail.getByPlaceholder('Search name or flat').fill('');

  const [download] = await Promise.all([page.waitForEvent('download'), detail.getByTestId('voters-csv').click()]);
  expect(download.suggestedFilename()).toMatch(/^vote-should-we-install-solar-panels.*\.csv$/);
  await shot('voting-detail-voters');
});

test('End now → publish result → result badge', async () => {
  await page.getByTestId('vote-end').click();
  await dialog(page).getByRole('button', { name: 'End now' }).click();
  await expectToast(page, 'Vote ended');
  const detail = page.getByTestId('vote-detail');
  await expect(page.getByTestId('vote-end')).toHaveCount(0);
  await expect(detail).toContainText(/Ended .* ended by Vote Admin/);

  await detail.getByTestId('result-publish').click();
  await expect(detail.getByText('Write the result members will see')).toBeVisible();
  await detail.locator('#vote-result-text').fill(RESULT);
  await detail.getByTestId('result-publish').click();
  await expectToast(page, 'Result published');
  await expect(detail.getByTestId('vote-result')).toContainText(RESULT);
  await expect(detail.getByTestId('vote-result')).toContainText('By Vote Admin');
  await expect(detail.getByTestId('result-badge')).toBeVisible();

  // Edit later.
  await detail.getByTestId('result-edit').click();
  await detail.locator('#vote-result-text').fill(`${RESULT} Bring your questions.`);
  await detail.getByTestId('result-publish').click();
  await expectToast(page, 'Result updated');
  await expect(detail.getByTestId('vote-result')).toContainText('Bring your questions.');
  await shot('voting-detail-ended-result');
  await page.getByRole('button', { name: 'Close panel' }).click();

  // Gone from Open, listed under Ended with the badge.
  await expect(page.getByTestId('vote-card').filter({ hasText: QUESTION })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Ended' }).click();
  await expect(page).toHaveURL(/status=ended/);
  const card = page.getByTestId('vote-card').filter({ hasText: QUESTION });
  await expect(card.getByTestId('result-badge')).toBeVisible();
  await expect(card).toContainText(/Ended \d{2} \w{3} \d{4}/);
  await shot('voting-list-ended');

  // Members see the result.
  const mine = await apiCall('GET', `/resident/polls/${ctx.pollId}`, { token: ctx.rahul });
  expect(mine.result).toContain('Bring your questions.');
});

test('a vote nobody voted in can be deleted', async () => {
  const q = `Wrong vote created by mistake ${RUN}`;
  await apiCall('POST', '/society/polls', { token: ctx.T, body: { question: q, options: ['Interested', 'Not interested'] } });
  await page.getByRole('tab', { name: 'All' }).click();
  const card = page.getByTestId('vote-card').filter({ hasText: q });
  await expect(card).toContainText('Open until you end it');
  await card.getByTestId('vote-open').click();
  await page.getByTestId('vote-delete').click();
  await dialog(page).getByRole('button', { name: 'Delete' }).click();
  await expectToast(page, 'Vote deleted');
  await expect(page.getByTestId('vote-card').filter({ hasText: q })).toHaveCount(0);
  await expect(page.getByTestId('vote-card').filter({ hasText: QUESTION })).toHaveCount(1);
});

test('API base is local', () => {
  expect(API).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+\/api\/v1$/);
});
