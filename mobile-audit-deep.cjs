// Deep mobile UI audit: horizontal overflow + touch targets + tiny text + offscreen elements.
// Usage: node mobile-audit-deep.cjs  (dev server on :3000 with DEV_OTP_RESPONSE=true)
const { chromium } = require('@playwright/test');

const WIDTHS = [320, 360, 390];
const VIEWS = [
  { name: 'Dashboard', nav: 'Home' },
  { name: 'Accounts', nav: 'Wallets' },
  { name: 'Ledger', nav: 'Ledger' },
  { name: 'Reports', nav: 'Analytics' },
  { name: 'Debts', nav: 'Debt' },
  { name: 'Budgets', nav: 'Budget' },
  { name: 'Goals', nav: 'Goal' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // --- DEV-ONLY session mint ---
  const email = `deep-audit-${Date.now()}@example.com`;
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  let minted = false;
  try {
    const mintResp = await page.request.post('http://localhost:3000/api/dev/mint-session', { data: { email } });
    const mint = await mintResp.json().catch(() => ({}));
    if (mint.success && mint.token) {
      await page.context().addCookies([
        { name: 'session_token', value: mint.token, url: 'http://localhost:3000', httpOnly: true, sameSite: 'Strict' },
      ]);
      minted = true;
      console.log('SESSION MINTED for', email);
    } else {
      console.log('MINT_FAILED:', JSON.stringify(mint).slice(0, 200));
    }
  } catch (e) {
    console.log('MINT_ERROR:', e.message.slice(0, 120));
  }
  if (!minted) {
    console.error('FATAL: could not mint dev session');
    await browser.close();
    process.exit(1);
  }

  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  const insideApp = await page.evaluate(() => !document.querySelector('input[type="email"]'));
  if (!insideApp) {
    console.error('FATAL: still on login screen');
    await browser.close();
    process.exit(1);
  }

  const results = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(700);

    for (const view of VIEWS) {
      try {
        const navBtn = page.locator(`nav button:has-text("${view.nav}"), nav a:has-text("${view.nav}")`).first();
        if (await navBtn.count()) {
          await navBtn.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(1400);
        }
      } catch {}

      const audit = await page.evaluate(() => {
        const vw = window.innerWidth;
        const docW = document.documentElement.scrollWidth;
        const issues = { overflow: docW > vw + 1, docW, vw, tinyText: [], smallTouch: [], offscreen: [] };

        const walk = (root) => {
          for (const el of root.querySelectorAll('*')) {
            if (el.closest('svg, [aria-hidden="true"]')) continue;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width === 0 || r.height === 0) continue;

            // Horizontal offenders (visible elements only)
            if (issues.overflow && (r.right > vw + 1 || r.left < -1)) {
              const cls = String(el.className || '').slice(0, 70);
              issues.offscreen.push(`${el.tagName.toLowerCase()}.${cls} left=${Math.round(r.left)} right=${Math.round(r.right)}`);
            }

            // Touch targets: interactive elements smaller than 40x40 (iOS/Android minimum ~44/48)
            const tag = el.tagName.toLowerCase();
            const isInteractive =
              tag === 'button' ||
              tag === 'a' ||
              tag === 'select' ||
              tag === 'input' ||
              (tag === 'div' && (el.getAttribute('onclick') || el.getAttribute('role') === 'button' || el.getAttribute('tabindex') !== null));
            if (isInteractive) {
              const w = Math.max(r.width, parseFloat(cs.minWidth) || 0);
              const h = Math.max(r.height, parseFloat(cs.minHeight) || 0);
              if (w > 0 && h > 0 && (w < 36 || h < 26)) {
                const label = (el.getAttribute('aria-label') || el.textContent || tag).trim().slice(0, 30);
                issues.smallTouch.push(`${tag} "${label}" ${Math.round(w)}x${Math.round(h)}`);
              }
            }

            // Deliberately small text (not tiny numerals in badges, which are a design choice)
            const fs = parseFloat(cs.fontSize);
            if (fs < 9 && r.height < 40 && el.children.length === 0) {
              const label = (el.textContent || '').trim().slice(0, 30);
              if (label) issues.tinyText.push(`${el.tagName.toLowerCase()} "${label}" ${fs}px`);
            }
          }
        };
        walk(document.body);

        const dedupe = (arr) => [...new Set(arr)].slice(0, 5);
        return {
          overflow: issues.overflow,
          docW: issues.docW,
          vw: issues.vw,
          offscreen: dedupe(issues.offscreen),
          smallTouch: dedupe(issues.smallTouch),
          tinyText: dedupe(issues.tinyText),
          smallTouchCount: issues.smallTouch.length,
          tinyTextCount: issues.tinyText.length,
        };
      });
      results.push({ width, view: view.name, ...audit });
    }
  }

  let bad = 0;
  for (const r of results) {
    const flag = r.overflow ? '❌ OVERFLOW' : '✅ ok';
    if (r.overflow) bad++;
    console.log(`\n${flag} [${r.width}px] ${r.view} — doc=${r.docW} vw=${r.vw}`);
    r.offscreen.forEach((o) => console.log('    ⤷ offscreen:', o));
    r.smallTouch.forEach((o) => console.log(`    ⤷ small touch (${r.smallTouchCount} total):`, o));
    r.tinyText.forEach((o) => console.log(`    ⤷ tiny text (${r.tinyTextCount} total):`, o));
  }
  const overflowCount = bad;
  const touchIssues = results.reduce((s, r) => s + r.smallTouchCount, 0);
  const textIssues = results.reduce((s, r) => s + r.tinyTextCount, 0);
  console.log(`\nSUMMARY: ${overflowCount} overflow combos, ${touchIssues} small touch targets, ${textIssues} tiny text nodes`);

  await browser.close();
  process.exit(overflowCount === 0 ? 0 : 2);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
