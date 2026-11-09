import { expect, test } from '@playwright/test';
import { API, apiCall, dialog, expectToast, giveReason, ownerLogin, ownerToken, PASSWORD, randPhone, RUN } from './helpers.js';

/**
 * Society workspace → Voting (same screen as SocialPanel): the owner creates a vote, a member votes (API), the owner
 * ends it and publishes the result — every change goes through the "Reason for this change" prompt. LOCAL backend only.
 */
if (/skillinnovex\.in|mongodb\.net|vercel\.app/.test(API)) throw new Error('Refusing to run against production.');
test.describe.configure({ mode: 'serial' });

let page;
const seed = {};
const QUESTION = `Paint the lobby this winter? (${RUN})`;

test.beforeAll(async ({ browser }) => {
  const T = await ownerToken();
  const repEmail = `voting.master.${RUN.toLowerCase()}@example.com`;
  const reg = await apiCall('POST', '/public/society-registrations', {
    body: { societyName: `Voting Master ${RUN}`, addressLine: '5 Lake View Road', city: 'Kolkata', state: 'West Bengal', pincode: '700029', phone: '3324567890', email: `office.vm.${RUN.toLowerCase()}@example.com`, representative: { name: 'Sohini Ghosh', phone: randPhone(), email: repEmail }, documents: [], submit: true },
  });
  const q = await apiCall('GET', `/platform/society-registrations?q=${reg.referenceCode}`, { token: T });
  const appr = await apiCall('POST', `/platform/society-registrations/${q.items[0]._id}/approve`, { token: T, body: {} });
  await apiCall('POST', '/public/society-registrations/activate', { body: { referenceCode: reg.referenceCode, accessKey: reg.accessKey, password: PASSWORD } });
  const adm = (await apiCall('POST', '/auth/admin/login', { body: { email: repEmail, password: PASSWORD } })).accessToken;
  const b = await apiCall('POST', '/society/buildings', { token: adm, body: { name: 'Tower V', floors: 1 } });
  await apiCall('POST', '/society/flats/bulk', { token: adm, body: { buildingId: b._id, fromFloor: 1, toFloor: 1, unitsPerFloor: 2, pattern: '{floor}{unit}' } });
  const r = await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name: `Kabir ${RUN}`, password: PASSWORD } });
  const m = await apiCall('POST', '/memberships', { token: r.accessToken, body: { societyId: appr.society._id, buildingId: b._id, flatNumber: '101', residentType: 'owner' } });
  await apiCall('POST', `/society/memberships/${m._id}/approve`, { token: adm, body: {} });
  Object.assign(seed, { societyId: appr.society._id, resident: r.accessToken });
  page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await ownerLogin(page);
});
test.afterAll(async () => page?.close());

test('owner runs a vote inside the society workspace (reason asked for each change)', async () => {
  await page.goto(`/admin/societies/${seed.societyId}`);
  await page.getByTestId('open-workspace').click();
  await expect(page.getByTestId('society-dashboard')).toBeVisible();
  await page.locator('#sidebar').getByRole('link', { name: 'Voting' }).click();
  await expect(page.getByRole('heading', { name: 'Voting' })).toBeVisible();

  await page.getByTestId('new-vote').first().click();
  await dialog(page).locator('#vote-question').fill(QUESTION);
  await dialog(page).getByTestId('vote-publish').click();
  await giveReason(page, 'Committee asked us to set up the vote');
  await expectToast(page, 'Vote published');
  const detail = page.getByTestId('vote-detail');
  await expect(detail).toContainText(QUESTION);

  const polls = await apiCall('GET', '/resident/polls', { token: seed.resident });
  const poll = polls.items.find((p) => p.question === QUESTION);
  await apiCall('POST', `/resident/polls/${poll._id}/vote`, { token: seed.resident, body: { optionId: poll.options[0]._id } });
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.reload();
  const card = page.getByTestId('vote-card').filter({ hasText: QUESTION });
  await expect(card.getByTestId('vote-turnout')).toContainText('1 of 1 member (100%)');
  await card.getByTestId('vote-open').click();
  await expect(detail.getByTestId('voters-table')).toContainText(`Kabir ${RUN}`);

  await page.getByTestId('vote-end').click();
  await dialog(page).getByRole('button', { name: 'End now' }).click();
  await giveReason(page, 'Committee asked to close voting early');
  await expectToast(page, 'Vote ended');
  await detail.locator('#vote-result-text').fill('Members agreed. Painting starts in December.');
  await detail.getByTestId('result-publish').click();
  await giveReason(page, 'Publishing the result for the committee');
  await expectToast(page, 'Result published');
  await expect(detail.getByTestId('result-badge')).toBeVisible();
});
