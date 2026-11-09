import { expect, test } from '@playwright/test';
import { apiCall, PASSWORD, randPhone, RUN } from './helpers.js';

test.describe('sign-in rules', () => {
  test('a member account is refused at sign-in', async ({ page }) => {
    const phone = randPhone();
    await apiCall('POST', '/auth/resident/register', { body: { phone, name: `Member ${RUN}`, password: PASSWORD } });
    await page.goto('/login');
    await page.fill('#phone', phone);
    await page.fill('#password', PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText('This is a member account. Members use the NIVASA app.');
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => sessionStorage.getItem('nivasa.vendor.session'))).toBeNull();
  });

  test('wrong password shows the server message; right password signs in', async ({ page }) => {
    const phone = randPhone();
    await apiCall('POST', '/auth/vendor/register', { body: { phone, name: `Vendor ${RUN}`, password: PASSWORD } });
    await page.goto('/login');
    await page.fill('#phone', `+91 ${phone}`);
    await page.fill('#password', 'WrongPassword123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText('Incorrect mobile number or password.');
    await page.fill('#password', PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.waitForURL('**/dashboard');
    await expect(page.getByTestId('kyc-banner')).toBeVisible();
  });

  test('client-side checks: phone and password rules', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#phone', '12345');
    await page.getByTestId('login-submit').click();
    await expect(page.getByText(/all 10 digits of the mobile number \(5 entered\)/)).toBeVisible();
    await expect(page.getByText('Enter your password')).toBeVisible();
    await page.goto('/register');
    await page.fill('#name', 'Ravi');
    await page.fill('#phone', '9876543210');
    await page.fill('#new-password', 'short');
    await page.fill('#confirm-password', 'other');
    await page.getByTestId('register-submit').click();
    await expect(page.getByText(/Password needs: at least 10 characters, at least one number/)).toBeVisible();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('a dead session ends with "Your session ended" on the sign-in page', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => sessionStorage.setItem('nivasa.vendor.session', JSON.stringify({ accessToken: 'bad', refreshToken: 'bad', user: { _id: 'x', name: 'Old', accountType: 'vendor' }, vendor: null })));
    await page.goto('/dashboard');
    await page.waitForURL(/\/login\?reason=expired/);
    await expect(page.getByTestId('session-alert')).toContainText('Your session ended');
  });
});
