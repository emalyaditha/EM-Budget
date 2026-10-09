/**
 * #64 — `App.tsx` handler goldens, recorded from the real web app.
 *
 * Why this exists: every logic unit in `parity/LOGIC_SPEC.md` §0 could be measured by *importing* the
 * module and calling the function. `App.tsx` cannot. Its money math lives in closures inside the
 * component body (`handleAddExpense` at `:1136`, `handlePayCreditCard` at `:2381`, `handleEditTransaction`
 * at `:3451` …), reached only through `setState`, and `INVENTORY.md` R7 flags them as the highest-value
 * untested surface in the app. So the only way to get an honest golden is to make the real handlers run
 * and read the state they leave behind. That is what this file does: it drives the real UI in a real
 * browser, against a real tenant, and records the resulting ledger.
 *
 * Run:
 *   npm run dev                 # the dev server, with DEV_OTP_RESPONSE returning the passcode
 *   npx playwright test -c parity/live/playwright.config.ts
 *
 * What is real and what is controlled:
 * - **Real**: the React app, every handler, `money.ts`, `creditCards.ts`, the validators, the tenant.
 *   Nothing here imports app code, stubs a handler, or asserts a hand-written expectation. `expected` is
 *   only ever what the app produced.
 * - **Controlled**: the ledger the app boots from (`seed-state.json`, written into the same localStorage
 *   mirror the app uses), the wall clock, and the cloud, which is held off — see the `context.route` note
 *   below.
 * - **Ephemeral**: the tenant, under the `qa-handlers-<stamp>` prefix. `INVENTORY.md` D22 — created for
 *   this run and destroyed in `test.afterAll`, which runs whether the test passed, failed or timed out,
 *   and proved gone by counting every table `parity/live/tenant.ts` knows about.
 *
 * The app is never modified, and the emitter refuses to write a golden if `src/App.tsx` has drifted from
 * the `pre-flutter` baseline it claims to describe.
 *
 * Byte-stability: `clock.setFixedTime` pins `Date.now()`/`new Date()` for the whole session while leaving
 * every timer running in real time, so the app's 4-second app-lock race and 60-second rollover interval
 * still behave like the app's and not like a stopped clock. On top of that the minted ids and the ISO
 * stamps are normalised to placeholders, so a re-run at a different pinned instant — or a re-run on a
 * different day — emits the same bytes.
 */

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginUser, registerUser, uniqueEmail, type TestUser } from '../../e2e/auth';
import { srcTreeDigest, sha256File } from '../fixtures/src-tree';
import { destroyTenant, inspect } from './tenant';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SEED_PATH = path.join(HERE, 'seed-state.json');
const OUT_PATH = path.join(REPO, 'parity', 'fixtures', 'app-handlers.json');
const TAG = 'pre-flutter';
const UNIT_FILE = 'src/App.tsx';

/** The instant the browser is pinned to, and the value `_provenance.pinnedNow`
 *  records. Asia/Colombo renders it as the local day `2026-10-04`, which is the
 *  day every date-window in the app computes against. `new Date(FIXED_NOW)` is
 *  what the page sees, so a run on any real date produces the same ledger. */
const FIXED_NOW = '2026-10-04T04:30:00.000Z';

/** D22: the harness owns exactly this one tenant and no other. The stamp inside
 *  the address is what makes it unique per run; `--leftover qa-handlers` in
 *  `tenant.ts` counts any that outlived its run. */
const TENANT_PREFIX = 'qa-handlers';
const TENANT: TestUser = uniqueEmail(TENANT_PREFIX);

/** Set as soon as `/api/auth/register` succeeds, so `afterAll` destroys only
 *  what was actually created — a tenant that never came into existence must not
 *  trigger twenty deletes. */
let tenantCreated = false;

/** The app's own storage keys (`src/utils.ts:85-87`, `:126`). Writing them is how the harness hands the
 *  app a ledger without driving eight "create account" forms first — it is a returning user's boot path,
 *  read by `loadStateFromStorage`, not a test double. */
const MIRROR_KEY = 'cashflow_manager_state_v1';
const OWNER_KEY = 'cashflow_manager_state_owner_v1';
const DIRTY_KEY = 'cashflow_manager_state_dirty_owner_v1';

const SEED = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as Record<string, any>;
const CREDIT_CARD = (SEED.cards as any[]).find((c) => c.cardType === 'Credit');

/** Every ledger collection, uniformly. A case records all of them before and after, so "this handler did
 *  not touch `debts`" is a recorded fact rather than a gap in the golden. `userProfile`, `pinCode`,
 *  `pinEnabled`, `budgets` and `savingsGoals` are excluded on purpose: the PIN is a credential and must
 *  never reach a fixture, and no handler under test writes the rest. */
const SLICES = [
  'cashAccounts',
  'cards',
  'creditCards',
  'creditCardPurchases',
  'creditCardInstallments',
  'creditCardInstallmentPayments',
  'incomes',
  'expenses',
  'debts',
  'loansGiven',
  'subscriptions',
  'transactions',
  'notifications',
] as const;

// ---------------------------------------------------------------------------
// normalisation — what a browser run cannot repeat
// ---------------------------------------------------------------------------

/** Ids the seed owns, so the only ids treated as generated are ones a handler minted
 *  (`generateUniqueId` → `crypto.randomUUID`, which no clock pinning can make reproducible). */
const SEED_IDS = new Set<string>();
const collectIds = (v: unknown): void => {
  if (Array.isArray(v)) for (const x of v) collectIds(x);
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'id' && typeof x === 'string') SEED_IDS.add(x);
      collectIds(x);
    }
  }
};
collectIds(SEED);

const ID_KEYS = new Set([
  'id',
  'referenceId',
  'chargeExpenseId',
  'installmentId',
  'purchaseId',
  'debtId',
  'loanId',
  'paymentId',
]);
const STAMP_KEYS = new Set(['updated_at', 'updatedAt', 'created_at', 'createdAt']);
const DAY_KEYS = new Set([
  'date',
  'appliedDate',
  'lastPaymentDate',
  'lastPaidDate',
  'paidDate',
  'dueDate',
  'nextPaymentDate',
  'startDate',
  'dateGiven',
]);

/** Aliases are handed out in encounter order, so two rows minted by one handler keep distinct names and a
 *  `referenceId` still points at its own row. `crypto.randomUUID()` is not a clock, so no pinning can make
 *  it repeat; aliasing is the only thing that makes its output stable. The `<now>`/`<today>` placeholders
 *  are the second line of defence: `clock.setFixedTime` already makes the wall clock identical across
 *  runs, but recording the stamps as placeholders means the golden stays byte-identical if the pinned
 *  instant is ever re-chosen. */
function makeNormalizer(todayKey: string) {
  const aliases = new Map<string, string>();
  const aliasFor = (raw: string): string => {
    if (SEED_IDS.has(raw)) return raw;
    let seen = aliases.get(raw);
    if (!seen) {
      seen = `gen-${aliases.size + 1}`;
      aliases.set(raw, seen);
    }
    return seen;
  };
  const walk = (value: unknown, key: string | null): unknown => {
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(v, k);
      return out;
    }
    if (typeof value !== 'string') return value;
    if (STAMP_KEYS.has(key ?? '')) return '<now>';
    if (ID_KEYS.has(key ?? '')) return aliasFor(value);
    if (DAY_KEYS.has(key ?? '') && value === todayKey) return '<today>';
    return value;
  };
  return walk;
}

const git = (args: string[]): string => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

// ---------------------------------------------------------------------------
// reading the app's state back
// ---------------------------------------------------------------------------

async function readMirror(page: Page): Promise<Record<string, any>> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), MIRROR_KEY);
  if (!raw) throw new Error('the app has not written its localStorage mirror yet');
  return JSON.parse(raw) as Record<string, any>;
}

/** `saveStateToStorage` runs in an effect (`App.tsx:780`), so the mirror lands a beat after the click.
 *  Poll for a difference rather than sleeping for one: this is the only wait in the file that guards a
 *  race, and every other step is Playwright auto-waiting on a real element. */
async function readMirrorAfter(page: Page, before: Record<string, any>): Promise<Record<string, any>> {
  let after = before;
  await expect
    .poll(
      async () => {
        after = await readMirror(page);
        return JSON.stringify(after) !== JSON.stringify(before);
      },
      { timeout: 20000, message: 'the handler ran but the state mirror never changed' },
    )
    .toBe(true);
  return after;
}

const pick = (state: Record<string, any>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of SLICES) out[key] = state[key] ?? [];
  return out;
};

type Case = { name: string; input: unknown; expected: unknown };
const cases: Case[] = [];

/** One case per flow: three outflows, three card settlements, two edits, two deletions, one each of
 *  inflow, transfer, debt repayment and loan receipt, one subscription payment, and one dialog **refusal**
 *  — 16, which is the sum of the `EXPECTED_CASES` groups, not a number to be adjusted when a flow is
 *  dropped. */
const EXPECTED_CASES = 16;

test('App.tsx handler goldens', async ({ browser }) => {
  test.setTimeout(900_000);
  const user = TENANT;
  const context: BrowserContext = await browser.newContext({ timezoneId: 'Asia/Colombo', locale: 'en-US' });
  // Pinned before the first page exists, so no app code ever observes a real
  // wall clock. `setFixedTime` freezes `Date` and leaves timers running, which
  // is the half of the job `install()` would get wrong: an installed clock stops
  // the 4-second app-lock race and the 60-second rollover interval too, and then
  // the golden describes an app that is not this one.
  await context.clock.setFixedTime(new Date(FIXED_NOW));
  const page: Page = await context.newPage();

  try {
    // ---------------------------------------------------------------- cloud, held off
    // Set before the first navigation, so even the login round trip cannot push a ledger into the
    // tenant. Two things would otherwise contaminate these goldens: the background hydration merging a
    // cloud snapshot into the seed (`App.tsx:604-624`), and the 1500 ms auto-push carrying one case's
    // minted rows into the next case's boot. With the REST host blocked every case starts from exactly
    // `seed-state.json`, and `isStateDirty` — the app's own reason not to let an empty cloud replace a
    // local ledger (`utils.ts:98-124`) — is seeded to keep that true.
    await context.route('**/rest/v1/**', (route) => route.abort());

    // ------------------------------------------------------------------- auth
    // Registered and logged in through the app's own routes, so the browser holds a real session cookie
    // for a real `auth_accounts` row. Inserting a row with the service key would describe an account the
    // app could never have created.
    await registerUser(page, user);
    tenantCreated = true;
    console.log(`  tenant ${user.email}`);
    await loginUser(page, user);

    await page.addInitScript(
      ({ mirrorKey, ownerKey, dirtyKey, seed, email }) => {
        window.localStorage.setItem(mirrorKey, JSON.stringify(seed));
        window.localStorage.setItem(ownerKey, email);
        window.localStorage.setItem(dirtyKey, email);
      },
      { mirrorKey: MIRROR_KEY, ownerKey: OWNER_KEY, dirtyKey: DIRTY_KEY, seed: SEED, email: user.email },
    );

    const todayKey = await page.evaluate(() => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    });
    const walk = makeNormalizer(todayKey);

    const boot = async () => {
      await page.goto('/');
      const cont = page.getByRole('button', { name: 'Continue to app' });
      if (await cont.isVisible().catch(() => false)) await cont.click();
      await page.waitForSelector('#full-workspace-view', { timeout: 60000 });
      // Let the hydration failure and the 4-second app-lock race (`App.tsx:572-576`) settle, so `before`
      // is the settled seed and not a mid-boot paint.
      await page.waitForTimeout(2500);
    };

    /** `buildArgs` is called with the post-action state because for some flows the arguments the handler
     *  actually received are only knowable from it — the edit form re-submits the whole row, and reading
     *  it back is the difference between recording what I meant to type and what the app sent. */
    const record = async (
      name: string,
      buildArgs: (after: Record<string, any>) => unknown[],
      before: Record<string, any>,
    ) => {
      const after = await readMirrorAfter(page, before);
      cases.push({
        name,
        input: { args: buildArgs(after), before: walk(pick(before), null) },
        expected: walk(pick(after), null),
      });
      console.log(`  recorded ${name}`);
      return after;
    };

    /** A refusal is also a measurement, and the only one this harness can make of a guarded screen: the
     *  dialog rejects before the handler runs, so the ledger does not move and `record`'s wait would only
     *  time out. The message is asserted rather than stored, which keeps every case in this unit the same
     *  `{ ledger }` shape and turns a changed message into a red run instead of a silently re-recorded
     *  golden. */
    const recordRefusal = async (
      name: string,
      buildArgs: () => unknown[],
      before: Record<string, any>,
      said: RegExp,
    ) => {
      const toast = page.getByRole('status').first();
      await expect(toast).toBeVisible({ timeout: 8000 });
      const message = (await toast.textContent()) ?? '';
      expect(message, 'the dialog refused, but not with the recorded reason').toMatch(said);
      const after = await readMirror(page);
      expect(pick(after)).toEqual(pick(before));
      cases.push({
        name,
        input: { args: buildArgs(), before: walk(pick(before), null) },
        expected: walk(pick(after), null),
      });
      console.log(`  refused ${name} — ${message}`);
    };

    /** The tab buttons are the only navigation (`App.tsx:3835-3842`); the app has no router. */
    const openTab = async (label: string) => {
      await page.getByRole('button', { name: label, exact: true }).first().click();
      await page.waitForTimeout(500);
    };

    // The Dashboard activity sheet defaults to `recent` = today's ledger only
    // (`Dashboard.tsx:136,281-290`), and every seeded row predates the run day,
    // so nothing is clickable until the range is widened. The control is
    // `role="tab"` inside `role="tablist" aria-label="Transactions range"`
    // (`SegmentedControl.tsx:20-33` + `Dashboard.tsx:396-403`) — a button query
    // would never resolve, and a second tablist ("Portfolio trend") exists, so
    // the lookup is scoped by the tablist's own label.
    const showWholeLedger = async () => {
      const range = page.getByRole('tablist', { name: 'Transactions range' });
      await range.getByRole('tab', { name: 'View All', exact: true }).click();
      await expect(range.getByRole('tab', { name: 'View All' })).toHaveAttribute('aria-selected', 'true');
    };

    // ============================================================ handleAddIncome
    {
      await boot();
      const before = await readMirror(page);
      await openTab('Ledger Registry');
      await page.getByRole('button', { name: 'Inflow', exact: true }).click();
      const form = page.locator('#log-income-form');
      await form.locator('input[type="number"]').first().fill('12500.75');
      await form.locator('#income-source-field').fill('Dividend');
      await form.getByRole('button', { name: 'Business', exact: true }).click();
      await form.locator('input[type="date"]').fill('2026-09-20');
      await form.locator('select').selectOption('cash-a:cash');
      await page.getByRole('button', { name: 'Record inflow' }).click();
      await record(
        'handleAddIncome(inflow into cash, fixed date)',
        () => [12500.75, '2026-09-20', 'Dividend', 'Business', 'cash-a', 'cash'],
        before,
      );
    }

    // ============================================================ handleAddExpense
    // Three branches of `:1191-1234`: cash that stays above Rs. 5,000; a debit card crossing the
    // Rs. 10,000 line and carrying a bank charge, which mints the second expense/transaction pair at
    // `:1255-1288`; and a cash account that starts under Rs. 5,000.
    const EXPENSES = [
      {
        tag: 'from cash, no bank charge',
        amount: '3500.5',
        title: 'Electric bill',
        category: 'Utilities',
        method: 'cash-a:cash',
        charge: null as string | null,
      },
      {
        tag: 'from a debit card with a bank charge',
        amount: '20000.4',
        title: 'Vehicle service',
        category: 'Transport',
        method: 'card-debit:card',
        charge: '99.99',
      },
      {
        tag: 'from cash already below the low-balance line',
        amount: '1500.2',
        title: 'Clinic',
        category: 'Medical',
        method: 'cash-b:cash',
        charge: null,
      },
    ];
    for (const spec of EXPENSES) {
      await boot();
      const before = await readMirror(page);
      await openTab('Ledger Registry');
      await page.getByRole('button', { name: 'Outflow', exact: true }).click();
      const form = page.locator('#log-expense-form');
      await form.locator('input[type="number"]').first().fill(spec.amount);
      await form.locator('#expense-title-field').fill(spec.title);
      await form.getByRole('button', { name: spec.category, exact: true }).click();
      await form.locator('input[type="date"]').fill('2026-09-21');
      await form.locator('select').selectOption(spec.method);
      if (spec.charge !== null) await form.locator('input[placeholder="0 — optional"]').fill(spec.charge);
      await page.getByRole('button', { name: 'Settle outflow' }).click();
      const [methodId, methodType] = spec.method.split(':');
      await record(
        `handleAddExpense(${spec.tag})`,
        () => [
          spec.title,
          'Charge',
          Number(spec.amount),
          '2026-09-21',
          spec.category,
          methodId,
          methodType,
          spec.charge === null ? 0 : Number(spec.charge),
        ],
        before,
      );
    }

    // ============================================================ handlePayCreditCard
    // Three triggers, three argument derivations:
    //   [title="Pay custom"]  → parseFloat of what was typed        (CreditCardManagement.tsx:613)
    //   [aria-label="Pay minimum"] → `c.minPayment`, seeded          (:546)
    //   [aria-label="Settle full balance"] → `Math.abs(c.currentBalance)` (:580) — the one that clears
    //                       the due date, because `maybeRollCard` returns `{dueDate: undefined}` once the
    //                       balance reaches zero (`creditCards.ts:260-268`).
    const PAYS = [
      { aria: 'Pay custom', attr: 'title', amount: '5000.25', tag: 'custom partial settlement' },
      { aria: 'Pay minimum', attr: 'aria-label', amount: null, tag: 'minimum due' },
      { aria: 'Settle full balance', attr: 'aria-label', amount: null, tag: 'full balance' },
    ];
    for (const spec of PAYS) {
      await boot();
      const before = await readMirror(page);
      await openTab('Track Liabilities');
      if (spec.amount !== null) await page.locator('input[placeholder="Repay amount"]').fill(spec.amount);
      await page
        .locator('select')
        .filter({ has: page.locator('option[value="cash-cash-a"]') })
        .first()
        .selectOption('cash-cash-a');
      await page.locator(`[${spec.attr}="${spec.aria}"]`).first().click();
      const paid =
        spec.amount !== null
          ? Number(spec.amount)
          : spec.aria === 'Pay minimum'
            ? CREDIT_CARD.minPayment
            : Math.abs(CREDIT_CARD.currentBalance);
      await record(`handlePayCreditCard(${spec.tag})`, () => [CREDIT_CARD.id, paid, 'cash-a', 'cash'], before);
    }

    // ============================================================ handleEditTransaction
    // The undo/re-apply pair at `App.tsx:3476-3486` and the debt branch at `:3512-3540`. Only the amount
    // is touched; `newData` is read back off the resulting row, because the form re-submits every field
    // it was seeded with and the golden must record what was sent, not what I intended.
    const EDITS = [
      { txId: 'tx-exp-1', title: 'Rent', amount: '30000.25', tag: 'expense row, amount reduced' },
      { txId: 'tx-dp-1', title: 'Lanka Lease repayment', amount: '42000', tag: 'debt_payment row, amount raised' },
    ];
    for (const spec of EDITS) {
      await boot();
      const before = await readMirror(page);
      await openTab('Overview Hub');
      await showWholeLedger();
      // `TransactionRow` renders the whole row as one `<button class="tx-row">`
      // (`ui/TransactionRow.tsx:28`), and only rows with `logType === 'transaction'`
      // get an `onClick` (`Dashboard.tsx:438`), so the click target is the button
      // itself rather than any text inside it.
      await page
        .locator('section[aria-label="Transactions"] button.tx-row')
        .filter({ hasText: spec.title })
        .first()
        .click();
      const modal = page.locator('#edit-transaction-modal-container');
      await modal.locator('input[type="number"]').first().fill(spec.amount);
      await modal.getByRole('button', { name: 'Save Entries' }).click();
      await record(
        `handleEditTransaction(${spec.tag})`,
        (after) => {
          const row = (after.transactions as any[]).find((t) => t.id === spec.txId);
          if (!row) throw new Error(`${spec.txId} vanished from the ledger during an edit`);
          if (row.amount !== Number(spec.amount)) {
            throw new Error(`the edit form submitted ${row.amount}, not the ${spec.amount} this case claims`);
          }
          return [
            spec.txId,
            {
              title: row.title,
              amount: row.amount,
              date: row.date,
              category: row.category,
              accountId: row.accountId,
              accountType: row.accountType,
            },
          ];
        },
        before,
      );
    }

    // ============================================================ handleDeleteTransaction
    // A plain withdrawal and a two-legged transfer, so the reversal is measured on one account and on
    // both. `:3070` is where the balance comes back and the tombstone is recorded.
    const DELETES = [
      { txId: 'tx-wd-1', title: 'ATP withdrawal', tag: 'withdrawal row' },
      { txId: 'tx-tr-1', title: 'Float top-up', tag: 'transfer row, both legs' },
    ];
    for (const spec of DELETES) {
      await boot();
      const before = await readMirror(page);
      await openTab('Overview Hub');
      await showWholeLedger();
      // `TransactionRow` renders the whole row as one `<button class="tx-row">`
      // (`ui/TransactionRow.tsx:28`), and only rows with `logType === 'transaction'`
      // get an `onClick` (`Dashboard.tsx:438`), so the click target is the button
      // itself rather than any text inside it.
      await page
        .locator('section[aria-label="Transactions"] button.tx-row')
        .filter({ hasText: spec.title })
        .first()
        .click();
      const modal = page.locator('#edit-transaction-modal-container');
      await modal.getByRole('button', { name: 'Dismiss' }).click();
      await modal.getByRole('button', { name: 'Confirm Delete' }).click();
      await record(
        `handleDeleteTransaction(${spec.tag})`,
        (after) => {
          if ((after.transactions as any[]).some((t) => t.id === spec.txId)) {
            throw new Error(`${spec.txId} survived the delete click`);
          }
          return [spec.txId];
        },
        before,
      );
    }

    // ============================================================ handleTransferFunds
    {
      await boot();
      const before = await readMirror(page);
      await openTab('Wallets Portfolio');
      const form = page.locator('#transfer-capital');
      await form.locator('select').first().selectOption('cash-cash-a');
      await form.locator('select').nth(1).selectOption('card-card-debit');
      await form.locator('input[placeholder="0.00"]').nth(0).fill('5000.5');
      await form.locator('input[placeholder="0.00"]').nth(1).fill('150.25');
      await form.locator('input[type="date"]').fill('2026-09-22');
      await form.locator('input[placeholder^="e.g. Move reserves"]').fill('Reserves to card');
      await form.getByRole('button', { name: 'Execute transfer' }).click();
      await record(
        'handleTransferFunds(cash to debit card with fee)',
        () => ['cash-a', 'cash', 'card-debit', 'card', 5000.5, 'Reserves to card', '2026-09-22', 150.25],
        before,
      );
    }

    // ============================================================ handleMakeDebtPayment
    {
      await boot();
      const before = await readMirror(page);
      await openTab('Track Liabilities');
      await page.getByRole('button', { name: 'Repay', exact: true }).first().click();
      const form = page
        .locator('form')
        .filter({ has: page.getByRole('button', { name: 'Process repayment' }) })
        .first();
      await form.locator('input[placeholder="10000"]').fill('2500.25');
      await form.locator('select').selectOption('cash-b:cash');
      await form.getByRole('button', { name: 'Process repayment' }).click();
      await record(
        'handleMakeDebtPayment(partial repayment from cash)',
        () => ['debt-1', 2500.25, 'cash-b', 'cash', 0],
        before,
      );
    }

    // ============================================================ handleMakeLoanSettlement
    {
      await boot();
      const before = await readMirror(page);
      await openTab('Track Loans Given');
      await page.getByRole('button', { name: 'Receive', exact: true }).first().click();
      const form = page
        .locator('form')
        .filter({ has: page.getByRole('button', { name: 'Post receipt' }) })
        .first();
      // `Receive` pre-fills the whole remaining amount (`LoansTracker.tsx:479`); overwriting it with an
      // explicit number is what makes this a partial settlement.
      await form.locator('input[type="number"]').first().fill('10000.5');
      await form.locator('select').selectOption('cash-a:cash');
      await form.getByRole('button', { name: 'Post receipt' }).click();
      // The fifth argument is the option's **label**, not the account name: `LoansTracker.tsx:84` builds
      // `` `${acc.name} (Wallet)` `` and that string is what lands on the settlement row. Reading it back
      // off the row is the difference between the args I meant to type and the args the component sent,
      // and it is the only argument in this file that a typed value cannot determine.
      await record(
        'handleMakeLoanSettlement(partial receipt into cash)',
        (after) => {
          const loan = (after.loansGiven as any[]).find((l) => l.id === 'loan-1');
          const settled = (loan?.settlements as any[])?.find((s) => s.amount === 10000.5);
          if (!settled) throw new Error('the receipt never landed on loan-1');
          return ['loan-1', 10000.5, 'cash-a', 'cash', settled.receivedInName, 0];
        },
        before,
      );
    }

    // ============================================================ handlePaySubscription
    {
      await boot();
      const before = await readMirror(page);
      await openTab('Ledger Registry');
      await page.getByRole('button', { name: 'Settle', exact: true }).first().click();
      const pay = page
        .locator('div')
        .filter({ has: page.getByRole('button', { name: 'Authorize & post' }) })
        .last();
      await pay.locator('select').first().selectOption('cash-a:cash');
      await pay.locator('input[type="date"]').first().fill('2026-09-23');
      await pay.getByRole('button', { name: 'Authorize & post' }).click();
      await record(
        'handlePaySubscription(monthly plan from cash)',
        () => ['sub-1', 'cash-a', 'cash', '2026-09-23', 0],
        before,
      );
    }

    // The same subscription, paid from the credit card — and the dialog will not allow it.
    // `SubscriptionManagement.tsx:124-133` calls a card's `currentBalance` its spendable money, which for a
    // credit card is the debt (Travel Credit: -40,406.29 against a 250,000 limit), so the guard at `:127`
    // rejects the payment before `handlePaySubscription` ever runs. That is B-28 measured rather than read:
    // the handler's debit-only alert rule at `App.tsx:2223` is unreachable from this screen, and what the
    // user gets instead is a dead option in the list. The case is named for the dialog and not for the
    // handler, because the handler was never called; its golden is the seed, unchanged.
    {
      await boot();
      const before = await readMirror(page);
      await openTab('Ledger Registry');
      await page.getByRole('button', { name: 'Settle', exact: true }).first().click();
      const pay = page
        .locator('div')
        .filter({ has: page.getByRole('button', { name: 'Authorize & post' }) })
        .last();
      await pay.locator('select').first().selectOption('card-credit:card');
      await pay.locator('input[type="date"]').first().fill('2026-09-23');
      await pay.getByRole('button', { name: 'Authorize & post' }).click();
      await recordRefusal(
        'subscriptionPayDialog.authorize(credit card as the funding source — B-28)',
        () => ['sub-1', 'card-credit', 'card', '2026-09-23', 0],
        before,
        /^Insufficient /,
      );
    }
  } finally {
    // The browser is closed here, not in `afterAll`, because a worker killed by
    // a test timeout does not carry a live `BrowserContext` into its hooks. The
    // tenant is storage, not a browser object, so its teardown can live in the
    // hook that runs even when this block is exited by a thrown timeout.
    await context.close().catch(() => undefined);
  }

  // ------------------------------------------------------------------------- emit
  // Unreached if any flow threw, so a partial run never overwrites a good
  // fixture with a short one.
  expect(cases.length, 'every flow in this run must record a case').toBe(EXPECTED_CASES);

  const workBlob = git(['hash-object', UNIT_FILE]);
  const tagBlob = git(['rev-parse', `${TAG}:${UNIT_FILE}`]);
  if (workBlob !== tagBlob) {
    throw new Error(
      `${UNIT_FILE} has drifted from ${TAG} (working ${workBlob} != tagged ${tagBlob}); ` +
        'these goldens would not describe the ported baseline',
    );
  }
  const provenance = {
    generatedFrom: TAG,
    sourceCommit: git(['rev-list', '-n', '1', TAG]),
    unitFile: UNIT_FILE,
    gitBlob: tagBlob,
    srcTree: srcTreeDigest(REPO),
    sha256: sha256File(REPO, UNIT_FILE),
    tz: 'Asia/Colombo',
    locale: 'en-US',
    node: process.version,
    pinnedNow: FIXED_NOW,
    sentinelAlphabet: ['NaN', 'Infinity', '-Infinity', '-0', 'undefined', 'undefined-result'],
    harness: {
      clock: `pinned to ${FIXED_NOW} by clock.setFixedTime; timers keep running in real time, and ISO stamps still normalise to <now>`,
      ids: 'handler-minted ids are aliased gen-1..gen-n in first-seen order and stay linked through referenceId',
      cloud: 'Supabase REST blocked; the ledger is the seeded localStorage mirror',
      surface:
        'live UI, chromium-via-Chrome 1280x800, one qa-handlers-<stamp> tenant per run, destroyed in afterAll (D22)',
      seed: sha256File(REPO, path.relative(REPO, SEED_PATH)),
    },
  };
  const raw = `${JSON.stringify({ _provenance: provenance, cases }, null, 2)}\n`;
  // Prettier disagrees with `JSON.stringify(_, null, 2)` on short arrays, and CI checks the
  // whole repo — so the emitter formats its own bytes, as `formatFixtures()` does for the others.
  const prettier = await import('prettier');
  const text = await prettier.format(raw, {
    ...(await prettier.resolveConfig(OUT_PATH)),
    parser: 'json',
    filepath: OUT_PATH,
  });
  writeFileSync(OUT_PATH, text, 'utf8');
  console.log(`wrote ${path.relative(REPO, OUT_PATH)} — ${cases.length} cases`);
});

/**
 * D22 teardown, in a file-level hook so it is not conditional on the test
 * reaching its own end. `destroyTenant` counts every table before and after and
 * throws on residue; the counts are logged either way, because "I deleted it"
 * without a number is the same claim the first `--selftest` made before it
 * leaked an orphan.
 */
test.afterAll(async () => {
  if (!tenantCreated) {
    console.log(`tenant ${TENANT.email}: never created — nothing to destroy`);
    return;
  }
  const rows = await destroyTenant(TENANT.email);
  const after = await inspect(TENANT.email);
  const seen = Object.entries(rows).filter(([, n]) => n > 0);
  const left = Object.entries(after).filter(([, n]) => n > 0);
  console.log(`tenant ${TENANT.email}: ${seen.map(([t, n]) => `${t}=${n}`).join(', ') || '(no rows)'}`);
  console.log(left.length === 0 ? 'TEARDOWN CLEAN — every table back to zero' : `LEAK: ${JSON.stringify(left)}`);
  if (left.length > 0) throw new Error(`tenant teardown leaked: ${JSON.stringify(left)}`);
});
