import { test, expect } from '@playwright/test';
import { loginUser, registerUser, uniqueEmail, TestUser } from './auth';

test.describe.serial('Auth flows', () => {
  test('send-otp returns dev passcode, verify accept a valid email, reject bad otp', async ({ page }) => {
    const user = uniqueEmail('e2e-otp');

    const send = await page.request.post('/api/auth/send-otp', {
      data: { email: user.email },
    });
    const sendData = await send.json();
    expect(send.status()).toBe(200);
    expect(sendData.success).toBe(true);
    expect(sendData.devOtp).toMatch(/^\d{6}$/);

    const wrong = await page.request.post('/api/auth/verify-otp', {
      data: {
        email: user.email,
        otp: '000000',
        forRegistrationOrReset: true,
      },
    });
    const wrongData = await wrong.json().catch(() => ({}));
    expect(wrong.status()).toBe(401);
    expect(wrongData.success).toBe(false);

    // A wrong attempt consumes the code (single-use). Request a fresh one.
    const resend = await page.request.post('/api/auth/send-otp', {
      data: { email: user.email },
    });
    expect(resend.status()).toBe(200);
    const resendData = await resend.json();
    expect(resendData.devOtp).toMatch(/^\d{6}$/);

    const good = await page.request.post('/api/auth/verify-otp', {
      data: {
        email: user.email,
        otp: resendData.devOtp,
        forRegistrationOrReset: true,
      },
    });
    expect(good.status()).toBe(200);
    expect((await good.json()).success).toBe(true);
  });

  test('register creates an account, then login-password works', async ({ page }) => {
    const user = uniqueEmail('e2e-reg');
    await registerUser(page, user);

    const bad = await page.request.post('/api/auth/login-password', {
      data: { email: user.email, password: 'WrongPass1!', rememberMe: false },
    });
    const badData = await bad.json().catch(() => ({}));
    expect(bad.status()).toBe(401);
    expect(badData.success).toBe(false);

    const good = await page.request.post('/api/auth/login-password', {
      data: { email: user.email, password: user.password, rememberMe: false },
    });
    expect(good.status()).toBe(200);
    const goodData = await good.json();
    expect(goodData.success).toBe(true);
    expect(goodData.token).toBeTruthy();
    expect(goodData.deviceToken).toBeTruthy();
  });

  test('UI unlock with httpOnly cookie session opens the dashboard', async ({ page }) => {
    const user = uniqueEmail('e2e-ui');
    await registerUser(page, user);
    const { token } = await loginUser(page, user);

    await page.goto('/');
    await page.waitForSelector('[id="header-profile-trigger"]', {
      timeout: 20000,
    });
    await expect(page).toHaveTitle(/EM Budget/);
    await expect(page.getByRole('button', { name: 'Overview Hub' })).toBeVisible({
      timeout: 20000,
    });

    // Profile modal reflects the logged-in email.
    await page.locator('[id="header-profile-trigger"]').click();
    await expect(page.locator(`text=${user.email}`).first()).toBeVisible({
      timeout: 10000,
    });
    expect(token).toBeTruthy();
  });
});
