import { test, expect } from '@playwright/test';
import { loginUser, registerUser, uniqueEmail } from './auth';

// Covers the wired app-lock gate: boot decision renders LockScreen instead of
// the workspace, PIN unlock works through the UI, and the seconds-granularity
// idle timeout re-locks an untouched vault. Requires DEV_OTP_RESPONSE=true.
// The seconds/idle case additionally needs migration 20261001000000 applied to
// Supabase (npm run db:migrate); it self-skips while the column is missing.
test.describe.serial('App lock gate', () => {
  const user = uniqueEmail('e2e-lock');
  const PIN = '739152';

  // fill() can set the DOM value before React's onChange commits state;
  // pressSequentially dispatches trusted key events so state lands first.
  async function enterPin(page: import('@playwright/test').Page, value: string) {
    await page.locator('#lock-pin').clear();
    await page.locator('#lock-pin').pressSequentially(value, { delay: 30 });
    await expect(page.locator('#lock-pin')).toHaveValue(value);
    await page.getByRole('button', { name: 'Unlock' }).click();
  }

  test('configures a PIN; reload gates the app; PIN unlocks', async ({ page }) => {
    await registerUser(page, user);
    await loginUser(page, user);
    await expect(page.locator('#full-workspace-view')).toBeVisible();

    const set = await page.request.post('/api/app-lock/pin/set', { data: { email: user.email, pin: PIN } });
    expect(set.status()).toBe(200);

    // Reload: no trusted device yet, so the lock gate replaces the workspace.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'App Locked' })).toBeVisible();
    await expect(page.locator('#full-workspace-view')).toHaveCount(0);

    // Wrong PIN keeps the gate up; the error response also returns the form
    // to idle state, which the next attempt requires.
    await enterPin(page, '111111');
    await expect(page.getByText('Incorrect PIN')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'App Locked' })).toBeVisible();

    // Correct PIN restores the app.
    await enterPin(page, PIN);
    await expect(page.locator('#full-workspace-view')).toBeVisible();
  });

  test('seconds idle timeout is persisted and re-locks the vault', async ({ page }) => {
    // Fresh context: log in again. The PIN gate appears at boot (trusted-device
    // issuance in test 1 is fire-and-forget, so treat the gate as expected).
    await loginUser(page, user);
    const locked = await page
      .getByRole('heading', { name: 'App Locked' })
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    const idle = await page.request.post('/api/app-lock/pin/idle-seconds', {
      data: { email: user.email, seconds: 5 },
    });
    expect(idle.status()).toBe(200);

    const status = await page.request.post('/api/app-lock/status', { data: { email: user.email } });
    if ((await status.json()).lockIdleSeconds === null) {
      test.skip(true, 'lock_idle_seconds column missing — run npm run db:migrate');
    }
    expect((await status.json()).lockIdleSeconds).toBe(5);

    if (locked) {
      await enterPin(page, PIN);
      await expect(page.locator('#full-workspace-view')).toBeVisible();
    } else {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'App Locked' })).toBeVisible();
      await enterPin(page, PIN);
      await expect(page.locator('#full-workspace-view')).toBeVisible();
    }

    // No further interaction: the 5s idle timeout re-arms the gate.
    await expect(page.getByRole('heading', { name: 'App Locked' })).toBeVisible({ timeout: 15000 });
  });
});
