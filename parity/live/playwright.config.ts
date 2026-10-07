import { defineConfig } from '@playwright/test';

/**
 * A Playwright config for the parity harness only.
 *
 * The web app owns `playwright.config.ts` at the repo root — `testDir: './e2e'`,
 * 24 tests, and the CI job that runs them. The handler goldens are not part of
 * that suite and must never join it: a golden run creates and destroys a real
 * tenant, so it belongs to the migration, runs on demand, and is skipped by
 * every web-facing command. This file exists so `npx playwright test -c
 * parity/live/playwright.config.ts` selects exactly one spec and nothing in
 * `e2e/` is touched.
 *
 * `reuseExistingServer` is deliberate: the dev server is already running for
 * this work, and starting a second one would collide on port 3000.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'handlers.spec.ts',
  outputDir: '../../test-results/parity-handlers',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.QA_APP_URL || 'http://localhost:3000',
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    // The fixture provenance records exactly these two, so a machine set to
    // Colombo time and en-US number grouping reproduces the recorded bytes.
    timezoneId: 'Asia/Colombo',
    locale: 'en-US',
    // Playwright's default action timeout is "the rest of the test", and this
    // test gives itself fifteen minutes, so a selector that matches nothing
    // would burn the whole budget before naming itself. Twenty seconds is far
    // past any real animation here and short enough to fail at the flow that
    // is actually wrong.
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
