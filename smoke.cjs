// Temporary smoke test — verifies the app renders without runtime errors.
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  const rootLen = await page.evaluate(() =>
    document.getElementById('root') ? document.getElementById('root').innerHTML.length : -1,
  );
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));

  console.log('TITLE:', title);
  console.log('ROOT_HTML_LENGTH:', rootLen);
  console.log('BODY_TEXT_PREVIEW:', JSON.stringify(bodyText));
  console.log('ERROR_COUNT:', errors.length);
  errors.slice(0, 15).forEach((e) => console.log(' -', e.slice(0, 300)));
  await page.screenshot({ path: 'smoke.png', fullPage: false });
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
