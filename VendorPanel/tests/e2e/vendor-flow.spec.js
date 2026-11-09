import { expect, test } from '@playwright/test';
import { apiCall, dialog, expectToast, istDay, ownerToken, panelSession, png, randPhone, registerInUi, RUN, submitKycInUi } from './helpers.js';

/**
 * Full vendor journey against the LOCAL backend:
 * create account → KYC needed → KYC with 3 photos → owner approves (API) → add a service with commission preview →
 * member books (API) → accept → complete → mark cash paid → settlement → boost request → sign out.
 */
test('vendor: sign-up → KYC → service → booking → cash → settlement → boost → sign out', async ({ page }) => {
  const owner = await ownerToken();
  const before = (await apiCall('GET', '/public/config')).services?.commissionPercent ?? 0;
  await apiCall('PUT', '/platform/settings/services.commissionPercent', { token: owner, body: { value: 10 } });
  try {
    // 1. Create account → dashboard says KYC is needed.
    const { business } = await registerInUi(page);
    await expect(page.getByTestId('dashboard-name')).toHaveText(business);
    await expect(page.getByTestId('kyc-banner')).toContainText('Complete your KYC to start listing');

    // 2. Pending KYC: "Add a service" lands on KYC with the reason (not an error toast).
    await page.getByTestId('quick-add-service').click();
    await page.waitForURL('**/kyc');
    await expect(page.getByTestId('kyc-reason')).toContainText('Complete your KYC to add a service');
    await expect(page.getByTestId('toast-error')).toHaveCount(0);

    // 3. Submit KYC with three document photos; client-side checks first.
    await page.getByTestId('kyc-form').locator('[name=pan]').fill('ABCD1234F');
    await page.getByTestId('kyc-submit').click();
    await expect(page.getByText(/PAN has 10 characters \(you entered 9\)/)).toBeVisible();
    await submitKycInUi(page, { business });

    // 4. Owner approves the KYC through the API.
    const s = await panelSession(page);
    const vendorId = s.user._id;
    await apiCall('POST', `/platform/vendors/${vendorId}/kyc`, { token: owner, body: { decision: 'approved' } });
    await page.goto('/kyc');
    await expect(page.getByTestId('kyc-status')).toContainText('Verified');
    await expect(page.getByTestId('kyc-summary')).toContainText('XXXX XXXX'); // masked Aadhaar
    await expect(page.getByTestId('kyc-form')).toHaveCount(0);

    // 5. Add a service with a price → live commission preview.
    await page.goto('/services/new');
    const form = page.getByTestId('service-form');
    await expect(form.locator('[name=categoryId] option')).not.toHaveCount(1);
    await form.locator('[name=categoryId]').selectOption({ index: 1 });
    await form.locator('[name=title]').fill(`Tap & leak repair ${RUN}`);
    await page.getByTestId('priceType-fixed').click();
    await form.locator('[name=price]').fill('499');
    await expect(page.getByTestId('commission-amount')).toHaveText('− ₹49.90');
    await expect(page.getByTestId('commission-earn')).toHaveText('₹449.10');
    await form.locator('[name=city]').fill('Pune');
    await page.getByTestId('service-photos-input').setInputFiles(png(0, 'work.png'));
    await expect(page.getByTestId('service-photos').locator('img')).toHaveCount(1);
    await page.getByTestId('service-save').click();
    await expectToast(page, 'Service saved');
    await page.waitForURL('**/services');
    const card = page.getByTestId('service-card').filter({ hasText: `Tap & leak repair ${RUN}` });
    await expect(card).toBeVisible();
    await expect(card).toContainText('commission 10%');

    // Platform approves the listing (if approval is required) so members can book it.
    const tokens = await panelSession(page);
    const mine = await apiCall('GET', '/service-offers/mine', { token: tokens.accessToken });
    const offer = mine.items.find((o) => o.title === `Tap & leak repair ${RUN}`);
    if (offer.moderationStatus === 'pending') await apiCall('POST', `/platform/listings/service/${offer._id}/moderate`, { token: owner, body: { decision: 'approved' } });

    // 6. A member books it through the API.
    const member = await apiCall('POST', '/auth/resident/register', { body: { phone: randPhone(), name: `Member ${RUN}`, password: 'Member2026secure' } });
    await apiCall('POST', `/service-offers/${offer._id}/bookings`, { token: member.accessToken, body: { preferredDate: istDay(1), preferredTime: '10:30', address: 'Flat 4B, Green Park, Baner, Pune', note: 'Kitchen tap leaking' } });

    // 7. Vendor accepts (a double-click sends ONE request) → completes → marks cash paid.
    await page.goto('/bookings');
    const booking = page.getByTestId('booking-card').filter({ hasText: `Tap & leak repair ${RUN}` });
    await expect(booking).toContainText('New request');
    await expect(booking).toContainText('Kitchen tap leaking');
    let accepts = 0;
    page.on('request', (r) => r.method() === 'POST' && /\/vendor\/bookings\/[^/]+\/accept$/.test(r.url()) && accepts++);
    await booking.getByTestId('booking-accept').dblclick();
    await expectToast(page, 'Booking accepted');
    expect(accepts).toBe(1);
    await expect(booking).toContainText('Confirmed');

    await booking.getByTestId('booking-complete').click();
    await dialog(page).getByTestId('confirm-ok').click();
    await expectToast(page, 'Marked as done');

    await page.getByTestId('tab-completed').click();
    const done = page.getByTestId('booking-card').filter({ hasText: `Tap & leak repair ${RUN}` });
    await expect(done).toContainText('Payment not recorded');
    await done.getByTestId('booking-mark-paid').click();
    const pay = dialog(page);
    await expect(pay.locator('[name=amount]')).toHaveValue('499');
    await pay.getByTestId('mark-paid-next').click();
    await expect(pay).toContainText('Record ₹499 received in cash?');
    await pay.getByTestId('mark-paid-confirm').click();
    await expectToast(page, 'Cash payment recorded');

    // 8. Settlement shows the numbers (booking + totals).
    await expect(done.getByTestId('booking-settlement')).toContainText('₹49.90');
    await expect(done.getByTestId('booking-net')).toHaveText('₹49.90');
    await expect(done.getByTestId('booking-mark-paid')).toHaveCount(0);
    const totals = page.getByTestId('vendor-settlement');
    await expect(totals.getByTestId('settle-cash')).toHaveText('₹499');
    await expect(totals.getByTestId('settle-commission')).toHaveText('₹49.90');
    await expect(totals.getByTestId('settle-net')).toHaveText('₹49.90');
    await expect(totals).toContainText('You owe NIVASA');

    await page.goto('/dashboard');
    await expect(page.getByTestId('stat-cash')).toContainText('₹499');
    await expect(page.getByTestId('kyc-banner')).toHaveCount(0);

    // 9. Boost request for the live service.
    await page.goto('/services');
    await page.getByTestId('service-card').filter({ hasText: `Tap & leak repair ${RUN}` }).getByRole('button', { name: 'Boost' }).click();
    await page.waitForURL(/\/boosts\/new/);
    await expect(page.getByTestId('boost-option').filter({ hasText: `Tap & leak repair ${RUN}` })).toHaveAttribute('aria-checked', 'true');
    await page.fill('[name=area]', 'Baner');
    await page.getByTestId('boost-days-7').click();
    await expect(page.getByTestId('boost-summary')).toContainText('for 7 days');
    await page.getByTestId('boost-submit').click();
    await expectToast(page, 'Boost submitted for review');
    await page.waitForURL('**/boosts');
    const ad = page.getByTestId('boost-card').filter({ hasText: `Tap & leak repair ${RUN}` });
    await expect(ad).toContainText('In review');
    await expect(ad).toContainText('Baner, Pune · 7 days');

    // 10. Sign out.
    await page.getByTestId('user-menu').click();
    await page.getByTestId('logout').click();
    await page.waitForURL('**/login');
    expect(await panelSession(page)).toBeNull();
    await page.goto('/dashboard');
    await page.waitForURL('**/login');
  } finally {
    await apiCall('PUT', '/platform/settings/services.commissionPercent', { token: owner, body: { value: before } });
  }
});
