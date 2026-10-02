import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import { loginUser, registerUser, uniqueEmail, type TestUser } from './auth';

/**
 * The sync indicator beside the profile avatar. On a phone this is the only
 * on-screen evidence of whether an edit reached the cloud: the header pill is
 * `hidden md:flex` and the footer scrolls away. So its visibility at phone
 * width is the behaviour under test, not styling.
 *
 * One context is shared by every test — the session cookie and the offline flag
 * both live on it, and re-login would burn the auth rate limit.
 */
const DOT = '#header-sync-indicator > span';
const TOAST = '[aria-live="polite"][aria-atomic="true"] [role="status"]';
const SYNCED = 'bg-[var(--success)]';
const PENDING = 'bg-amber-500';
const UNAVAILABLE = 'bg-[var(--ink-3)]';

/**
 * Green means the server confirmed the write, so it needs a real Supabase
 * project. Without VITE_SUPABASE_URL the client correctly reports the cloud as
 * unreachable and the dot stays gray forever — CI authenticates against the
 * server's in-memory fallback, which the browser cannot see. Resolved the same
 * way Vite resolves it, so the test skips on "not configured" rather than on
 * "cloud is down", which would hide a genuine regression.
 */
const hasCloud = Boolean(loadEnv('development', process.cwd(), 'VITE_').VITE_SUPABASE_URL?.trim());

test.describe('Login overlay focus containment', () => {
  test('hidden chrome is out of the tab order while the overlay is up', async ({ page }) => {
    // The overlay is fixed and covers the app, which hides the chrome but does
    // not by itself remove it from the tab order. Keyboard reachability is the
    // ground truth here — an element can still be in the DOM and be inert.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('#email-2fa-container', { timeout: 20000 });

    const regionsInert = await page.evaluate(() =>
      ['#header-brand-rail', 'main', 'footer', 'nav[aria-label="Bottom Navigation"]'].every((s) =>
        document.querySelector(s)?.hasAttribute('inert'),
      ),
    );
    expect(regionsInert).toBe(true);

    const chromeIds = ['header-sync-indicator', 'header-profile-trigger', 'header-notification-trigger'];
    let landedOnChrome: string | null = null;
    for (let i = 0; i < 30 && !landedOnChrome; i++) {
      await page.keyboard.press('Tab');
      landedOnChrome = await page.evaluate((ids) => {
        const id = document.activeElement?.id || '';
        return ids.includes(id) ? id : null;
      }, chromeIds);
    }
    expect(landedOnChrome).toBeNull();
  });
});

test.describe.serial('Sync indicator', () => {
  let context: BrowserContext;
  let page: Page;
  let user: TestUser;

  const dotClass = () => page.locator(DOT).getAttribute('class');
  const pollDotClass = () => expect.poll(dotClass, { timeout: 45000 });

  test.beforeAll(async ({ browser }) => {
    user = uniqueEmail('e2e-dot');
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
    await registerUser(page, user);
    await loginUser(page, user);
    await page.waitForSelector('[id="header-sync-indicator"]', { timeout: 25000 });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('is visible beside the avatar at phone width', async () => {
    const dot = page.locator(DOT);
    await expect(dot).toBeVisible();

    const box = await dot.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(8);
    expect(box!.height).toBeGreaterThanOrEqual(8);
    // Inside the phone viewport — not clipped by the header's edge.
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    // The text pill is desktop-only, which is exactly why the dot has to exist.
    await expect(page.locator('[id="header-sync-pill"]')).toBeHidden();

    await page.screenshot({ path: 'test-results/sync-dot-mobile.png' });
  });

  test('turns green once the ledger is confirmed in the cloud', async () => {
    test.skip(!hasCloud, 'no Supabase project configured');
    await pollDotClass().toContain(SYNCED);
    expect(await dotClass()).not.toContain(UNAVAILABLE);
    await page.screenshot({ path: 'test-results/sync-dot-mobile-synced.png' });
  });

  test('goes orange for a real edit and back to green once confirmed', async () => {
    test.skip(!hasCloud, 'no Supabase project configured');
    await pollDotClass().toContain(SYNCED);

    // The currency selector writes straight through updateState, which is the
    // same path every ledger edit takes and the one that sets the dirty marker.
    await page.locator('[id="header-profile-trigger"]').click();
    const currency = page.locator('select:has(option[value="Rs."])');
    await currency.selectOption('$');
    await page.getByRole('button', { name: 'Close profile' }).click();

    await pollDotClass().toContain(PENDING);
    await pollDotClass().toContain(SYNCED);
  });

  test('stays green while Settings opens and closes with nothing pending', async () => {
    test.skip(!hasCloud, 'no Supabase project configured');
    // The auto-sync effect lists isSettingsOpen as a dependency, so opening a
    // modal re-runs it. It must not report "syncing" for a ledger that is
    // already confirmed in the cloud.
    await pollDotClass().toContain(SYNCED);
    await page.locator('[id="header-profile-trigger"]').click();
    await page.getByText('Encryption & sync settings').click();
    await page.waitForTimeout(900);
    expect(await dotClass()).toContain(SYNCED);

    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.waitForTimeout(900);
    expect(await dotClass()).toContain(SYNCED);
  });

  test('turns gray with no internet, and stops claiming green', async () => {
    await context.setOffline(true);
    await pollDotClass().toContain(UNAVAILABLE);
    expect(await dotClass()).not.toContain(SYNCED);
    await page.screenshot({ path: 'test-results/sync-dot-mobile-offline.png' });
  });

  test('recovers from gray once the link returns', async () => {
    // Restored before the skip — the tests after this share the context, and
    // leaving it offline would silently change what they assert.
    await context.setOffline(false);
    test.skip(!hasCloud, 'no Supabase project configured');
    // Reachability is re-probed when the browser reports online again, so this
    // leaves gray without a reload.
    await expect
      .poll(async () => (await dotClass())?.includes(SYNCED) || (await dotClass())?.includes(PENDING), {
        timeout: 45000,
      })
      .toBe(true);
  });

  test('tapping the dot reads the status out, since a phone has no hover', async () => {
    await page.locator('[id="header-sync-indicator"]').click();
    const toast = page.locator(TOAST).first();
    await expect(toast).toBeVisible({ timeout: 5000 });
    expect((await toast.innerText()).trim().length).toBeGreaterThan(10);
  });

  test('the text pill returns at desktop width', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('[id="header-sync-pill"]')).toBeVisible();
    await expect(page.locator(DOT)).toBeVisible();
  });
});
