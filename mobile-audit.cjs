// Mobile UI audit — checks every main view for horizontal overflow at phone widths.
// Registers a fresh account (DEV_OTP_RESPONSE mode), then visits each view and
// measures document.scrollWidth vs innerWidth, collecting offending elements.
const { chromium } = require('@playwright/test');

const WIDTHS = [320, 360, 390];
const VIEWS = [
  { name: 'Dashboard', nav: 'Dashboard' },
  { name: 'Reports', nav: 'Reports' },
  { name: 'Cash & Cards', nav: 'Cash' },
  { name: 'Debts', nav: 'Debt' },
  { name: 'Budgets', nav: 'Budget' },
  { name: 'Goals', nav: 'Goal' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // --- DEV-ONLY: mint a session directly (requires DEV_OTP_RESPONSE=true, dev server only) ---
  const email = `mobile-audit-${Date.now()}@example.com`;
  const password = `Str0ngP@ss${Date.now()}`;
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  let minted = false;
  try {
    const mintResp = await page.request.post('http://localhost:3000/api/dev/mint-session', {
      data: { email },
    });
    const mint = await mintResp.json().catch(() => ({}));
    if (mint.success && mint.token) {
      // Cookie — the API prefers the httpOnly session cookie
      await page.context().addCookies([
        {
          name: 'session_token',
          value: mint.token,
          url: 'http://localhost:3000',
          httpOnly: true,
          sameSite: 'Strict',
        },
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
    // Fallback: OTP registration flow (only works when SMTP is unavailable so devOtp is returned)
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first();
    if (await emailInput.count()) {
      try {
        const sendResp = await page.request.post('http://localhost:3000/api/auth/send-otp', { data: { email } });
        const send = await sendResp.json().catch(() => ({}));
        if (send.success && send.devOtp) {
          await emailInput.fill(email);
          await page.waitForTimeout(300);
          const next = page
            .locator('button:has-text("Send"), button:has-text("Continue"), button[type="submit"]')
            .first();
          await next.click().catch(() => {});
          await page.waitForTimeout(1500);
          const otpInput = page.locator('input[type="text"], input[inputmode="numeric"]').first();
          if (await otpInput.count()) await otpInput.fill(String(send.devOtp));
          await page.waitForTimeout(800);
          const pwFields = page.locator('input[type="password"]');
          if ((await pwFields.count()) >= 1) {
            await pwFields.first().fill(password);
            if ((await pwFields.count()) >= 2) await pwFields.nth(1).fill(password);
          }
          const regBtn = page
            .locator('button:has-text("Register"), button:has-text("Create"), button[type="submit"]')
            .first();
          await regBtn.click().catch(() => {});
          await page.waitForTimeout(4000);
        }
      } catch (e) {
        console.log('LOGIN_FLOW_PARTIAL:', e.message.slice(0, 120));
      }
    }
  }

  // Reload so the app picks up the session on boot
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Verify we actually got inside the app; otherwise results are meaningless
  const insideApp = await page.evaluate(() => !document.querySelector('input[type="email"]'));
  if (!insideApp) {
    console.warn('WARNING: still on login screen — audit results below are for the login page only.');
  }

  const results = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(600);

    for (const view of VIEWS) {
      try {
        // Try bottom nav / sidebar buttons by visible text
        const navBtn = page.locator(`button:has-text("${view.nav}"), a:has-text("${view.nav}")`).first();
        if (await navBtn.count()) {
          await navBtn.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(1200);
        }
      } catch {}

      const audit = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const vw = window.innerWidth;
        const offenders = [];
        if (docW > vw + 1) {
          const all = document.querySelectorAll('body *');
          for (const el of all) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
              const cls = (el.className && String(el.className).slice(0, 80)) || '';
              offenders.push(`${el.tagName.toLowerCase()}.${cls} right=${Math.round(r.right)}`);
              if (offenders.length >= 6) break;
            }
          }
        }
        return { overflow: docW > vw + 1, docW, vw, offenders };
      });
      results.push({ width, view: view.name, ...audit });
    }
  }

  let bad = 0;
  for (const r of results) {
    const flag = r.overflow ? '❌ OVERFLOW' : '✅ ok';
    if (r.overflow) bad++;
    console.log(`${flag} [${r.width}px] ${r.view} — doc=${r.docW} vw=${r.vw}`);
    r.offenders.forEach((o) => console.log('    •', o));
  }
  console.log(`\nSUMMARY: ${bad} overflowing view/width combos`);

  // Screenshot Reports at 320px for visual proof
  await page.setViewportSize({ width: 320, height: 700 });
  const reportsNav = page.locator('button:has-text("Reports"), a:has-text("Reports")').first();
  if (await reportsNav.count()) {
    await reportsNav.click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'mobile-reports-320.png', fullPage: true });
    console.log('SCREENSHOT: mobile-reports-320.png saved');
  }
  await browser.close();
  process.exit(bad === 0 ? 0 : 2);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
