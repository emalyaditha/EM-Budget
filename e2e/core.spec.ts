import { test, expect } from '@playwright/test';
import { loginUser, registerUser, uniqueEmail, TestUser } from './auth';

/**
 * Core UI smoke: with a real, verified session the dashboard mounts and the
 * key chrome (theme toggle, profile modal, notifications) is reachable and
 * functional against the full stack (real backend + real Supabase sync).
 */
test.describe.serial('Core dashboard smoke', () => {
  let user: TestUser;

  test('register a fresh account', async ({ page }) => {
    user = uniqueEmail('e2e-core');
    await registerUser(page, user);
  });

  test('dashboard mounts and chrome is interactive', async ({ page }) => {
    await loginUser(page, user);
    await page.goto('/');

    await page.waitForSelector('[id="header-profile-trigger"]', { timeout: 20000 });
    await expect(page).toHaveTitle(/EM Budget/);
    await expect(page.locator(`text=${user.email}`).first()).toBeVisible({
      timeout: 20000,
    });

    const themeButton = page.getByRole('button', { name: 'Switch to light mode' });
    if (await themeButton.count()) {
      await themeButton.click();
    }
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible({ timeout: 5000 });

    // Notifications first — nothing overlays the chrome at this point.
    await page.locator('[id="header-notification-trigger"]').click();
    await expect(page.getByRole('button', { name: 'Close notifications' })).toBeVisible({ timeout: 5000 });

    // Dismiss the notifications overlay before interacting with profile.
    const closeNotifications = page.getByRole('button', {
      name: 'Close notifications',
    });
    await closeNotifications.click();
    await expect(closeNotifications).not.toBeVisible({ timeout: 5000 });

    // Profile modal on top of everything is fine as the last interaction.
    await page.locator('[id="header-profile-trigger"]').click();
    await expect(page.locator(`text=${user.email}`).first()).toBeVisible({
      timeout: 5000,
    });
  });
});
