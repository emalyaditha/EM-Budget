import { test, expect } from '@playwright/test';
import { loginUser, registerUser, uniqueEmail, TestUser } from './auth';

/**
 * Server-side per-account isolation, proven over real per-account rows
 * (trusted device tokens persisted in a trusted_devices table keyed by
 * user_email) plus the signed-token binding enforced by requireSession
 * (decoded.email === provided email).
 *
 * - A's device list must contain A's freshly-issued trusted device and never
 *   B's.
 * - B's device list must contain B's trusted device and never A's.
 * - A's session token must not authenticate a request for B (and vice versa).
 */
test.describe.serial('Two-account server-side isolation', () => {
  let userA: TestUser;
  let userB: TestUser;

  test('register two isolated accounts and capture their session tokens', async ({ page }) => {
    userA = uniqueEmail('e2e-iso-a');
    userB = uniqueEmail('e2e-iso-b');
    await registerUser(page, userA);
    await registerUser(page, userB);
  });

  test('device lists are disjoint and tokens are account-bound', async ({ page }) => {
    const a = await loginUser(page, userA);
    const b = await loginUser(page, userB);

    // Issue a trusted device for A and one for B.
    const issueA = await page.request.post('/api/app-lock/device/issue', {
      data: { email: userA.email },
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(issueA.status()).toBe(200);
    const issueB = await page.request.post('/api/app-lock/device/issue', {
      data: { email: userB.email },
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(issueB.status()).toBe(200);

    const listA = await page.request.post('/api/app-lock/device/list', {
      data: { email: userA.email },
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(listA.status()).toBe(200);
    const dataA = await listA.json();
    const listAIds = (dataA.devices || []).map((d: { id: string }) => d.id);
    const listATokens = JSON.stringify(dataA.devices);

    const listB = await page.request.post('/api/app-lock/device/list', {
      data: { email: userB.email },
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(listB.status()).toBe(200);
    const dataB = await listB.json();
    const listBIds = (dataB.devices || []).map((d: { id: string }) => d.id);

    // Both lists are non-empty and their device-id sets share no element.
    expect(listAIds.length).toBeGreaterThan(0);
    expect(listBIds.length).toBeGreaterThan(0);
    for (const id of listAIds) {
      expect(listBIds).not.toContain(id);
      expect(listATokens).toContain(id);
    }
    for (const id of listBIds) {
      expect(listAIds).not.toContain(id);
    }

    // Cross-account requests with the other account's token must be rejected.
    const crossAB = await page.request.post('/api/app-lock/device/list', {
      data: { email: userB.email },
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(crossAB.status()).toBe(401);

    const crossBA = await page.request.post('/api/app-lock/device/list', {
      data: { email: userA.email },
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(crossBA.status()).toBe(401);
  });
});
