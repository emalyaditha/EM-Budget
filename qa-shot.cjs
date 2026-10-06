/**
 * UI QA harness — logs in through the real auth stack, walks every tab,
 * captures screenshots and reports horizontal overflow + console errors.
 * Usage: node qa-shot.cjs [tag] [--tabs a,b] [--widths 320,390] [--theme dark]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = 'D:/tmp/qa';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const TAG = arg('--tag', 'run');
const THEME = arg('--theme', 'dark');
const WIDTHS = arg('--widths', '1440').split(',').map(Number);
const TABS = arg(
  '--tabs',
  'Overview Hub,Wallets Portfolio,Ledger Registry,Smart Budgets,Savings Jars,Track Liabilities,Track Loans Given,Reports Centre',
).split(',');
const SEED = arg('--seed', '1') !== '0';
// Optional element-only capture: `--element section[aria-label=Transactions]`
// shoots the first visible match instead of the viewport, and `--click "View All"`
// presses a control just before each shot so both states of a toggle can be read.
const ELEMENT = arg('--element', '');
const CLICK = arg('--click', '');
// Same as --click but matched on aria-label, for icon-only controls.
const CLICK_ARIA = arg('--click-aria', '');
// `--fill "#edit-card-balance=5000"` — comma separated selector=value pairs.
const FILLS = (arg('--fill', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Realistic ledger so screens are judged with content, not empty states. */
function buildSeed(ownerEmail) {
  const S = Date.now().toString(36);
  const S2 = (x) => `${S}-${x}`;
  const iso = (d) => d.toISOString().slice(0, 10);
  const now = new Date();
  const daysAgo = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return iso(d);
  };
  const cash = [
    { id: S2('ca-1'), name: 'Primary Salary Wallet', balance: 184500 },
    { id: S2('ca-2'), name: 'Office Safe', balance: 26000 },
    { id: S2('ca-3'), name: 'Emergency Float', balance: 90500 },
  ];
  const cards = [
    {
      id: S2('cd-1'),
      cardName: 'Everyday Debit',
      bankName: 'Commercial Bank',
      cardType: 'Debit',
      currentBalance: 74250,
      cardNumber: '4520 **** **** 3776',
      cardTheme: 'blue',
    },
    {
      id: S2('cd-2'),
      cardName: 'Travel Credit',
      bankName: 'National Savings',
      cardType: 'Credit',
      currentBalance: -38420,
      limit: 250000,
      cardNumber: '5311 **** **** 5679',
      cardTheme: 'violet',
      dueDate: daysAgo(-12),
      minPayment: 5000,
      apr: 24.9,
    },
  ];
  const creditCards = [
    {
      id: S2('cc-1'),
      name: 'Rewards Platinum',
      balance: 38420,
      limit: 250000,
      dueDate: daysAgo(-12),
      minPayment: 5000,
    },
  ];
  const merchants = [
    ['Cinnamon Grand Groceries', 'Food', 6840],
    ['Pickme commute', 'Transport', 1450],
    ['Fort Nawala Weekly', 'Shopping', 12300],
    ['CEB electricity', 'Utilities', 5620],
    ['Netflix', 'Entertainment', 2899],
    ['Kandy Clinic', 'Medical', 9500],
    ['University fees', 'Education', 42000],
    ['Spareroom rent', 'Rent', 55000],
    ['AIA premium', 'Insurance', 11250],
    ['Spotify', 'Entertainment', 1199],
    ['Dilmah restock', 'Food', 3260],
    ['Petrol', 'Transport', 6000],
  ];
  const transactions = [];
  for (let i = 0; i < 46; i++) {
    const m = merchants[i % merchants.length];
    const day = Math.round(i * 1.9);
    transactions.push({
      id: `tx-${S}-${i}`,
      type: 'expense',
      title: m[0],
      amount: m[2],
      date: daysAgo(day),
      category: m[1],
      accountId: i % 3 === 0 ? S2('cd-1') : S2('ca-1'),
      accountType: i % 3 === 0 ? 'card' : 'cash',
    });
  }
  [0, 30, 60, 90].forEach((d, i) =>
    transactions.push({
      id: `tx-in-${S}-${i}`,
      type: 'income',
      title: i === 2 ? 'Freelance retainer' : 'Monthly salary',
      amount: i === 2 ? 145000 : 265000,
      date: daysAgo(d + 2),
      category: i === 2 ? 'Freelance' : 'Salary',
      accountId: S2('ca-1'),
      accountType: 'cash',
    }),
  );
  transactions.sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    userProfile: { name: 'Emal Yaditha', email: ownerEmail },
    cashAccounts: cash,
    cards,
    creditCards,
    creditCardPurchases: [],
    creditCardInstallments: [],
    creditCardInstallmentPayments: [],
    incomes: [
      {
        id: S2('in-1'),
        amount: 265000,
        date: daysAgo(3),
        source: 'Employer',
        category: 'Salary',
        targetAccountId: S2('ca-1'),
        targetType: 'cash',
      },
    ],
    expenses: transactions
      .filter((t) => t.type === 'expense')
      .slice(0, 22)
      .map((t) => ({
        id: `ex-${S}-${t.id}`,
        title: t.title,
        description: '',
        amount: t.amount,
        date: t.date,
        category: t.category,
        paymentMethodId: t.accountId,
        paymentMethodType: t.accountType,
      })),
    debts: [
      {
        id: S2('db-1'),
        debtSource: 'Nine Acres Finance',
        totalAmount: 900000,
        remainingAmount: 612500,
        dueDate: daysAgo(-40),
        notes: 'Vehicle financing',
        payments: [
          {
            id: S2('dp-1'),
            debtId: S2('db-1'),
            amount: 25000,
            date: daysAgo(20),
            paidFromId: S2('ca-1'),
            paidFromType: 'cash',
          },
        ],
        accountId: S2('ca-1'),
        accountType: 'cash',
        accountName: 'Primary Salary Wallet',
        status: 'Active',
      },
      {
        id: S2('db-2'),
        debtSource: 'Family — Ruwan',
        totalAmount: 150000,
        remainingAmount: 45000,
        dueDate: daysAgo(-8),
        notes: '',
        payments: [],
        status: 'Active',
      },
    ],
    transactions,
    notifications: [
      {
        id: S2('nt-1'),
        type: 'reminder',
        title: 'Credit card due in 12 days',
        message: 'Rewards Platinum minimum payment of Rs. 5,000 is approaching.',
        date: daysAgo(0),
        read: false,
      },
      {
        id: S2('nt-2'),
        type: 'alert',
        title: 'Food budget at 84%',
        message: 'You have spent most of this month’s Food allowance.',
        date: daysAgo(1),
        read: false,
      },
    ],
    subscriptions: [
      {
        id: S2('sb-1'),
        name: 'Netflix',
        amount: 2899,
        billingCycle: 'Monthly',
        dueDate: daysAgo(-6),
        category: 'Entertainment',
        status: 'Active',
        paymentMethodId: S2('cd-2'),
        paymentMethodType: 'card',
        lastPaidDate: daysAgo(24),
      },
      {
        id: S2('sb-2'),
        name: 'Spotify Family',
        amount: 2399,
        billingCycle: 'Monthly',
        dueDate: daysAgo(-9),
        category: 'Entertainment',
        status: 'Active',
        lastPaidDate: daysAgo(21),
      },
      {
        id: S2('sb-3'),
        name: 'AWS',
        amount: 11400,
        billingCycle: 'Monthly',
        dueDate: daysAgo(-2),
        category: 'Utilities',
        status: 'Active',
        lastPaidDate: daysAgo(28),
      },
      {
        id: S2('sb-4'),
        name: 'Adobe CC',
        amount: 7200,
        billingCycle: 'Yearly',
        dueDate: daysAgo(-120),
        category: 'Other',
        status: 'Paused',
      },
    ],
    loansGiven: [
      {
        id: S2('ln-1'),
        borrowerName: 'Tharindu Perera',
        totalAmount: 120000,
        remainingAmount: 40000,
        dateGiven: daysAgo(70),
        sourceAccountId: S2('ca-1'),
        sourceAccountType: 'cash',
        sourceAccountName: 'Primary Salary Wallet',
        status: 'Partially Settled',
        notes: 'Returned in two instalments',
        settlements: [
          {
            id: S2('ls-1'),
            loanId: S2('ln-1'),
            amount: 50000,
            date: daysAgo(35),
            receivedInId: S2('ca-1'),
            receivedInType: 'cash',
            receivedInName: 'Primary Salary Wallet',
          },
          {
            id: S2('ls-2'),
            loanId: S2('ln-1'),
            amount: 30000,
            date: daysAgo(10),
            receivedInId: S2('cd-1'),
            receivedInType: 'card',
            receivedInName: 'Everyday Debit',
          },
        ],
      },
      {
        id: S2('ln-2'),
        borrowerName: 'Nethmi Silva',
        totalAmount: 35000,
        remainingAmount: 35000,
        dateGiven: daysAgo(14),
        sourceAccountId: S2('cd-1'),
        sourceAccountType: 'card',
        sourceAccountName: 'Everyday Debit',
        status: 'Active',
        notes: '',
        settlements: [],
      },
    ],
    budgets: [
      { id: S2('bg-1'), category: 'Food', limit: 45000, spent: 37800, icon: '🍚', subBreakdown: [] },
      { id: S2('bg-2'), category: 'Transport', limit: 20000, spent: 12450, icon: '🛺', subBreakdown: [] },
      { id: S2('bg-3'), category: 'Utilities', limit: 30000, spent: 28900, icon: '💡', subBreakdown: [] },
      { id: S2('bg-4'), category: 'Entertainment', limit: 12000, spent: 4098, icon: '🎬', subBreakdown: [] },
      { id: S2('bg-5'), category: 'Shopping', limit: 25000, spent: 26100, icon: '🛍️', subBreakdown: [] },
      { id: S2('bg-6'), category: 'Medical', limit: 15000, spent: 9500, icon: '🩺', subBreakdown: [] },
    ],
    savingsGoals: [
      { id: S2('sg-1'), name: 'Japan Trip', target: 850000, current: 312000, targetDate: daysAgo(-210) },
      { id: S2('sg-2'), name: 'Laptop Upgrade', target: 320000, current: 288000, targetDate: daysAgo(-45) },
      { id: S2('sg-3'), name: 'House Deposit', target: 4500000, current: 940000, targetDate: daysAgo(-720) },
    ],
    pinCode: '',
    pinEnabled: false,
    currency: 'LKR',
  };
}

fs.mkdirSync(OUT, { recursive: true });

module.exports = { buildSeed, BASE };

if (require.main === module)
  (async () => {
    const browser = await chromium.launch();
    const errors = [];
    const overflow = [];
    const seen = new Set();
    // A fresh tenant per run: reusing one account accumulates every previous
    // seed into it, so screenshots show rows from earlier runs. Seed ids are
    // already run-scoped (Date.now base36) and bank_cards' PK is `id` alone,
    // so separate tenants cannot collide on insert.
    const email = arg('--email', `qa-${Date.now().toString(36)}@example.com`);
    const password = process.env.QA_HARNESS_PASSWORD;
    if (!password) {
      console.error('FATAL: QA_HARNESS_PASSWORD is not set. The harness registers a throwaway');
      console.error(`       tenant (${email}) and needs it; do not commit a literal here.`);
      await browser.close();
      process.exit(1);
    }

    for (const width of WIDTHS) {
      const height = width < 768 ? 844 : 900;
      const ctx = await browser.newContext({
        viewport: { width, height },
        colorScheme: THEME,
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${width}px pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`${width}px: ${m.text()}`);
      });

      const api = async (p, body) => {
        const r = await page.request.post(BASE + p, { data: body });
        return { s: r.status(), d: await r.json().catch(() => ({})) };
      };

      const send = await api('/api/auth/send-otp', { email });
      const otp = send.d.devOtp || '';
      if (!/^\d{6}$/.test(otp)) {
        console.error('FATAL: no dev OTP returned; start the server with DEV_OTP_RESPONSE=true');
        await browser.close();
        process.exit(1);
      }
      // Existing harness account: log straight in. Otherwise register it once.
      let login = await api('/api/auth/login-password', { email, password, rememberMe: false });
      if (login.s !== 200 || !login.d.success) {
        await api('/api/auth/verify-otp', { email, otp, forRegistrationOrReset: true });
        await api('/api/auth/register', { email, password, otp, rememberMe: false });
        login = await api('/api/auth/login-password', { email, password, rememberMe: false });
      }
      if (login.s !== 200 || !login.d.success) {
        console.error('FATAL: could not authenticate the harness account:', JSON.stringify(login).slice(0, 200));
        await browser.close();
        process.exit(1);
      }

      if (SEED) {
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
        await page.evaluate(
          ([seed, owner]) => {
            localStorage.setItem('cashflow_manager_state_v1', JSON.stringify(seed));
            localStorage.setItem('cashflow_manager_state_owner_v1', owner);
            // Hydration replaces local with cloud unless local is marked dirty.
            localStorage.setItem('cashflow_manager_state_dirty_owner_v1', owner);
          },
          [buildSeed(email), email],
        );
      }

      // Supabase realtime keeps a socket open, so networkidle never settles
      // reliably here. Wait for load, then for the app's own boot marker.
      await page.goto(BASE + '/', { waitUntil: 'load' });
      await page
        .waitForSelector('#full-workspace-view', { timeout: 45000 })
        .catch(() => console.log(`warn: workspace not mounted by 45s @ ${width}px`));
      await page.waitForTimeout(2500);

      const shot = async (name) => {
        const file = path.join(OUT, `${TAG}-${width}-${name}.png`);
        if (ELEMENT) {
          const target = page.locator(`${ELEMENT} >> visible=true`).first();
          if (await target.count()) {
            await target.scrollIntoViewIfNeeded();
            await target.screenshot({ path: file });
            return file;
          }
        }
        await page.screenshot({ path: file });
        return file;
      };

      // Seed a little real data so tables/cards/charts are not all empty states.

      if (process.env.QA_DEBUG) {
        const vis = await page.$$eval('button', (els) =>
          els
            .filter((e) => e.offsetParent !== null)
            .map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40))
            .filter(Boolean),
        );
        console.log(`[${width}px] visible buttons: ${JSON.stringify(vis)}`);
      }

      for (const tab of TABS) {
        // `visible=true` matters: below lg the sidebar button still exists in the
        // DOM (display:none) and would otherwise win `.first()`.
        const find = () => page.locator(`button:has-text("${tab}") >> visible=true`).first();
        let btn = find();
        if (!(await btn.count())) {
          // Same label is only reachable through the bottom bar's "More" drawer.
          const more = page.locator('[aria-label="More"] >> visible=true').first();
          if (await more.count()) {
            await more.click();
            await page.waitForTimeout(600);
            btn = find();
          }
        }
        if (!(await btn.count())) {
          errors.push(`tab not found at ${width}px: ${tab}`);
          continue;
        }
        await btn.click();
        await page.waitForTimeout(1100);
        // Open an icon-only control (eg "Edit card"), type into a field, then press
        // a labelled button, so a whole edit flow can be walked before the shot.
        if (CLICK_ARIA) {
          const press = page.locator(`button[aria-label="${CLICK_ARIA}"] >> visible=true`).first();
          if (!(await press.count())) {
            errors.push(`aria-label control not found at ${width}px: ${CLICK_ARIA}`);
          } else {
            await press.click();
            await page.waitForTimeout(700);
          }
        }
        for (const pair of FILLS) {
          const idx = pair.lastIndexOf('=');
          const sel = pair.slice(0, idx);
          const value = pair.slice(idx + 1);
          const field = page.locator(`${sel} >> visible=true`).first();
          if (!(await field.count())) {
            errors.push(`fill target not found at ${width}px: ${sel}`);
            continue;
          }
          await field.fill(value);
          await page.waitForTimeout(250);
        }
        if (CLICK) {
          const press = page.locator(`button:has-text("${CLICK}") >> visible=true`).first();
          if (await press.count()) {
            await press.click();
            await page.waitForTimeout(900);
          } else {
            errors.push(`button not found at ${width}px: ${CLICK}`);
          }
        }
        const slug = tab.replace(/[^a-z]/gi, '').toLowerCase();
        await shot(`${slug}${CLICK_ARIA || FILLS.length ? '-flow' : ''}${CLICK ? '-saved' : ''}`);
        seen.add(slug);

        const bad = await page.evaluate(() => {
          const de = document.documentElement;
          const over = de.scrollWidth - de.clientWidth;
          const culprits = [];
          if (over > 1) {
            document.querySelectorAll('*').forEach((el) => {
              const r = el.getBoundingClientRect();
              if (r.right > de.clientWidth + 2 && r.width > 24 && r.width < de.clientWidth * 1.6) {
                const cs = getComputedStyle(el);
                if (cs.position === 'fixed') return;
                culprits.push(
                  `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`.slice(0, 110),
                );
              }
            });
          }
          return { over, culprits: [...new Set(culprits)].slice(0, 5) };
        });
        if (bad.over > 1) overflow.push(`${width}px / ${tab}: +${bad.over}px  ${bad.culprits.join(' | ')}`);
      }

      await ctx.close();
    }

    await browser.close();
    const noise = /401|403|GSI_LOGGER|origin is not allowed|favicon|net::ERR/;
    const real = errors.filter((e) => !noise.test(e));
    console.log(`\n=== ${TAG} @ ${WIDTHS.join('/')}px, ${THEME} ===`);
    console.log(`tabs captured: ${seen.size}/${TABS.length}`);
    console.log(`\n-- console errors (${real.length}) --\n${real.slice(0, 12).join('\n') || '(none)'}`);
    console.log(`\n-- horizontal overflow (${overflow.length}) --\n${overflow.slice(0, 20).join('\n') || '(none)'}`);
    console.log(`\nshots in ${OUT}`);
  })().catch((e) => {
    console.error('HARNESS FAIL:', e.message);
    process.exit(1);
  });
