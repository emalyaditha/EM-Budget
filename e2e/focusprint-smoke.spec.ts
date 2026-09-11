import { test, expect, Page } from '@playwright/test';
import { loginUser, registerUser, uniqueEmail, TestUser } from './auth';

function activeElementInside(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    return Boolean(el.closest(sel));
  }, selector);
}

test.describe.serial('M3 focus trap + print smoke', () => {
  let user: TestUser;

  async function go(page: Page): Promise<void> {
    await loginUser(page, user);
    await page.goto('/');
    await page.waitForSelector('[id="header-profile-trigger"]', { timeout: 20000 });
  }

  test('register a fresh account', async ({ page }) => {
    user = uniqueEmail('e2e-m3smoke');
    await registerUser(page, user);
  });

  test('Settings drawer traps focus and closes on Escape', async ({ page }) => {
    await go(page);
    await page.locator('[id="header-profile-trigger"]').click();
    const settingsEntry = page.getByText('Encryption & sync settings');
    await expect(settingsEntry).toBeVisible({ timeout: 5000 });
    await settingsEntry.click();

    const drawer = page.locator('#settings-panel-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    expect(await activeElementInside(page, '#settings-panel-drawer')).toBe(true);

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await activeElementInside(page, '#settings-panel-drawer')).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible({ timeout: 5000 });
  });

  test('QuickActionModal traps focus and closes on Escape', async ({ page }) => {
    await go(page);
    const addButton = page.getByRole('button', { name: 'Add', exact: true }).first();
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
    await expect(dialog).toBeVisible({ timeout: 5000 });
    expect(await activeElementInside(page, '[role="dialog"][aria-modal="true"]')).toBe(true);

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await activeElementInside(page, '[role="dialog"][aria-modal="true"]')).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('Reports print media shows report chrome and hides controls', async ({ page }) => {
    await go(page);
    const reportsNav = page.getByRole('button', { name: 'Reports Centre' });
    await expect(reportsNav).toBeVisible({ timeout: 5000 });
    await reportsNav.click();

    await page.waitForSelector('[id="reports-centre-view"]', { timeout: 10000 });
    const header = page.locator('#print-report-header');
    const footer = page.locator('#print-report-footer');
    await expect(header).not.toBeVisible();
    await expect(footer).not.toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(header).toBeVisible();
    await expect(footer).toBeVisible();

    const interactive = page.locator('button');
    for (const btn of await interactive.all()) {
      await expect(btn).toBeHidden({ timeout: 3000 });
    }

    await page.emulateMedia({ media: 'screen' });
    await expect(header).not.toBeVisible();
  });
});