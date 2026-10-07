/**
 * Phase 1 golden generator.
 *
 * Runs the REAL logic modules and writes their actual output to
 * parity/fixtures/<unit>.json. `expected` is never typed by hand here — a case
 * is a call, not an assertion. See LOGIC_SPEC.md.
 *
 * Two rules are enforced mechanically rather than by trust:
 *
 *  1. Provenance (D7): every sampled source file must be byte-identical to the
 *     `pre-flutter` tag. If any blob drifted, this aborts before writing
 *     anything, so a golden can never silently describe newer code.
 *  2. Extraction (LOGIC_SPEC 12): the unrounded UI interest is module-private
 *     inside a .tsx, so its exact source bytes are pulled from the tag and
 *     transpiled for syntax only. Nothing is re-implemented.
 *
 * Usage: npx tsx parity/fixtures/generate.ts
 * Run under the timezone you record; LOGIC_SPEC 6 requires a second-zone proof.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

// ---------------------------------------------------------------------------
// imports of the code under measurement (never copies of it)
// ---------------------------------------------------------------------------
import {
  toMinorUnits,
  toMajorUnits,
  addMoney,
  subtractMoney,
  sumMoney,
  compareMoney,
  multiplyMoney,
  formatMoney,
} from '../../src/lib/money';
import {
  DEDUCTION_DAY,
  deductionDate,
  advanceDueDate,
  cycleWindowStart,
  computeMinimumPayment,
  cycleAnchor,
  paymentsInCycle,
  isMinimumSatisfied,
  daysBetween,
  interestForCycle,
  latePaymentFee,
  maybeRollCard,
  runCycleRollover,
} from '../../src/lib/creditCards';
import {
  calculateInstallmentFee,
  calculateMonthlyPayment,
  generateInstallmentSchedule,
  isCardEligibleForInstallment,
  getInstallmentProgress,
  formatFeeBreakdown,
} from '../../src/lib/installments';
import {
  localDayKey,
  todayLocal,
  isInCurrentMonth,
  isAlertDayRecent,
  addMonthsClamped,
  ledgerBalanceEffect,
  applyGoalAllocation,
  applyRepayment,
  isSpendingRow,
  budgetSpendingForMonth,
  calculateNetWorth,
} from '../../src/utils';
import { computeAlerts, daysRemaining, BUDGET_WARN_AT } from '../../src/lib/alerts';
import { transactionService } from '../../src/services/transactionService';
import { escapeCsvRow } from '../../src/lib/download';
import {
  CashAccountSchema,
  BankCardSchema,
  TransactionSchema,
  DebtSchema,
  SubscriptionSchema,
  BareRestoreStateSchema,
  LedgerExportV1Schema,
  LedgerRestorePayloadSchema,
  validateData,
} from '../../src/validators';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = HERE;

const TAG = 'pre-flutter';

// Paths of every file this generator samples, keyed by fixture unit.
const UNIT_SOURCES: Record<string, string> = {
  money: 'src/lib/money.ts',
  'number-locale': 'src/lib/money.ts',
  'credit-cycles': 'src/lib/creditCards.ts',
  'credit-payments': 'src/lib/creditCards.ts',
  'cycle-rollover': 'src/lib/creditCards.ts',
  installments: 'src/lib/installments.ts',
  'dates-local': 'src/utils.ts',
  'net-worth': 'src/utils.ts',
  alerts: 'src/lib/alerts.ts',
  'transaction-service': 'src/services/transactionService.ts',
  csv: 'src/lib/download.ts',
  validators: 'src/validators/index.ts',
  'display-interest': 'src/components/CreditCardManagement.tsx',
};

const git = (args: string[]): string => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');

/** The fixture set. The validator requires a file for each, in this order. */
export const UNITS = [
  'money',
  'number-locale',
  'credit-cycles',
  'credit-payments',
  'cycle-rollover',
  'installments',
  'dates-local',
  'net-worth',
  'alerts',
  'transaction-service',
  'csv',
  'validators',
  'display-interest',
] as const;

// ---------------------------------------------------------------------------
// D7 — provenance gate. Resolve the tag, then refuse to proceed if any sampled
// file has drifted from it. Runs before a single fixture is written.
// ---------------------------------------------------------------------------
function resolveProvenance(): Record<string, { commit: string; file: string; gitBlob: string; sha256: string }> {
  let commit: string;
  try {
    commit = git(['rev-list', '-n', '1', TAG]);
  } catch {
    throw new Error(`provenance: tag "${TAG}" does not exist. Create it before generating goldens.`);
  }
  if (!commit) throw new Error(`provenance: tag "${TAG}" resolves to no commit.`);

  const out: Record<string, { commit: string; file: string; gitBlob: string; sha256: string }> = {};
  const drift: string[] = [];

  for (const [unit, rel] of Object.entries(UNIT_SOURCES)) {
    let expectedBlob: string;
    try {
      expectedBlob = git(['rev-parse', `${commit}:${rel}`]);
    } catch {
      throw new Error(`provenance: ${rel} is not present in ${TAG} (${commit}).`);
    }
    const abs = path.join(REPO, rel);
    let bytes: Buffer;
    try {
      bytes = readFileSync(abs);
    } catch {
      drift.push(`${unit}: ${rel} missing from the working tree`);
      continue;
    }
    const actualBlob = git(['hash-object', rel]);
    // git hash-object applies text conversion, so compare normalised bytes too.
    if (actualBlob !== expectedBlob) {
      drift.push(`${unit}: ${rel} blob ${actualBlob} != ${TAG} blob ${expectedBlob}`);
    }
    out[unit] = { commit, file: rel, gitBlob: expectedBlob, sha256: sha256(bytes) };
  }

  if (drift.length) {
    throw new Error(
      `PROVENANCE VIOLATION — the following sources differ from ${TAG} (${commit}):\n  ${drift.join(
        '\n  ',
      )}\nNothing was written. Restore the sampled files to the tag, or cut a new tag and re-scope the spec.`,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// A deterministic clock. getMonthlyTotals reads new Date() at call time, and
// several helpers default nowMs to Date.now(), so goldens would otherwise move
// every day. Zero-arg Date construction and Date.now() are pinned; every
// explicit-argument call passes through untouched.
// ---------------------------------------------------------------------------
const PINNED_UTC = '2026-10-04T04:30:00.000Z'; // 10:00 in UTC+5:30, noon in UTC-6
const REAL_DATE = Date;
const PINNED_NOW = REAL_DATE.parse(PINNED_UTC);

class PinnedDate extends REAL_DATE {
  // No-arg construction means "now", and "now" is the thing being pinned.
  constructor(...args: unknown[]) {
    super(...(args.length === 0 ? [PINNED_NOW] : (args as [string | number | Date])));
  }
  static now(): number {
    return PINNED_NOW;
  }
}
globalThis.Date = PinnedDate as unknown as DateConstructor;

// ---------------------------------------------------------------------------
// JSON cannot carry NaN / Infinity / -0 / undefined / a thrown error, and a
// sentinel *string* could collide with real data. So these become single-key
// objects, which the validator treats as a closed alphabet.
// ---------------------------------------------------------------------------
const SENTINELS = ['NaN', 'Infinity', '-Infinity', '-0', 'undefined', 'undefined-result'] as const;

function enc(v: unknown): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { __sentinel__: 'NaN' };
    if (v === Infinity) return { __sentinel__: 'Infinity' };
    if (v === -Infinity) return { __sentinel__: '-Infinity' };
    if (Object.is(v, -0)) return { __sentinel__: '-0' };
    return v;
  }
  if (v === undefined) return { __sentinel__: 'undefined' };
  if (Array.isArray(v)) return v.map(enc);
  if (v instanceof Set) return [...v].map(enc);
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, val]) => [String(k), enc(val)]));
  if (v instanceof Error) return { __throws__: `${v.name}: ${v.message}` };
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = enc(val);
    return o;
  }
  return v;
}

type Case = { name: string; input: unknown; expected: unknown };

/** One measured call. `input` is documentation for the Dart port, and is
 *  encoded with the same rules so a reviewer can re-run the case by hand. */
function measure(name: string, input: unknown, fn: () => unknown): Case {
  let expected: unknown;
  try {
    expected = enc(fn());
  } catch (e) {
    const err = e as Error;
    expected = { __throws__: `${err.name}: ${err.message}` };
  }
  return { name, input: enc(input), expected };
}

/** A fixture whose case names collide cannot be turned into a test suite
 *  faithfully: the second one overwrites the first in any name-keyed
 *  structure, and the collision is invisible in the JSON. Catch it here, at
 *  the point the name was written, rather than in the Dart port. */
function assertUniqueNames(unit: string, cases: Case[]): void {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const k of cases) {
    if (typeof k.name !== 'string' || k.name.length === 0) throw new Error(`${unit}: a case has no name`);
    if (seen.has(k.name)) dupes.add(k.name);
    seen.add(k.name);
  }
  if (dupes.size > 0) {
    throw new Error(`${unit}: duplicate case names would silently drop cases: ${[...dupes].join(', ')}`);
  }
}

function write(
  unit: string,
  prov: Record<string, { commit: string; file: string; gitBlob: string; sha256: string }>,
  cases: Case[],
): void {
  assertUniqueNames(unit, cases);
  const p = prov[unit];
  if (!p) throw new Error(`no provenance recorded for unit "${unit}"`);
  const body = {
    _provenance: {
      generatedFrom: TAG,
      sourceCommit: p.commit,
      unitFile: p.file,
      gitBlob: p.gitBlob,
      sha256: p.sha256,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: Intl.NumberFormat().resolvedOptions().locale,
      node: process.version,
      pinnedNow: PINNED_UTC,
      sentinelAlphabet: SENTINELS,
    },
    cases,
  };
  writeFileSync(path.join(OUT, `${unit}.json`), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  console.log(`  ${unit.padEnd(20)} ${String(cases.length).padStart(4)} cases  <- ${p.file}`);
}

// ---------------------------------------------------------------------------
// shared fixtures for the object-shaped units
// ---------------------------------------------------------------------------
const tx = (over: Record<string, unknown> = {}) =>
  ({
    id: 'tx-1',
    title: 'Groceries',
    category: 'Shopping',
    type: 'expense',
    amount: 1200,
    date: '2026-10-02',
    accountId: 'ca-1',
    ...over,
  }) as never;

const creditCard = (over: Record<string, unknown> = {}) =>
  ({
    id: 'cc-1',
    cardName: 'Travel Credit',
    bankName: 'National Savings',
    cardType: 'Credit',
    currentBalance: -38420,
    limit: 250000,
    dueDate: '2026-10-07',
    minPayment: 1921,
    apr: 24.9,
    isCanceled: false,
    isFrozen: false,
    ...over,
  }) as never;

const debitCard = (over: Record<string, unknown> = {}) =>
  ({
    id: 'cd-1',
    cardName: 'Everyday Debit',
    bankName: 'Commercial Bank',
    cardType: 'Debit',
    currentBalance: 74250,
    cardNumber: '4520 **** **** 3776',
    isCanceled: false,
    isFrozen: false,
    ...over,
  }) as never;

// Numbers chosen so the case families below actually reach the interesting
// branch rather than collapsing to a round zero.
const AMOUNTS = [
  null,
  undefined,
  NaN,
  0,
  -0,
  0.1,
  0.2,
  19.99,
  -19.99,
  1234.567,
  -1234.567,
  2.5,
  -2.5,
  0.005,
  -0.005,
  1 / 3,
  100000,
  1e21,
  Infinity,
  -Infinity,
  '12abc',
  '  7.5 ',
  '1e3',
  '0x10',
  'abc',
  '',
  '-0.005',
  '1,250',
  38420,
  -38420,
];

// YYYY-MM-DD covering every month length, both leap centuries and the wrap.
const DAY31 = ['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31', '2026-10-31', '2026-12-31'];
const MONTH_ENDS = [
  '2026-01-29',
  '2026-01-30',
  '2026-01-31',
  '2026-02-01',
  '2026-02-28',
  '2026-04-30',
  '2026-06-30',
  '2026-09-30',
  '2026-11-30',
  '2026-12-31',
  '2028-02-29',
  '2100-02-28',
  '2000-02-29',
];
const BAD_DATES = [
  '',
  '2026-9-5',
  '2026-13-01',
  '2026-00-10',
  '2026-02-31',
  '2026-02-30',
  'not-a-date',
  '2026-10-04T18:30:00Z',
  '04-10-2026',
  '2026/10/04',
];

// ===========================================================================
// 1. money
// ===========================================================================
/**
 * Amounts that sit exactly on a decimal half in the *typed* sense — `0.015`,
 * `1.005`, `2.5` cents — which is where `money.ts`'s two formatters disagree.
 *
 * `toMajorUnits` uses `toFixed`, which rounds on the exact binary value, while
 * `formatMoney` uses `toLocaleString`, which rounds on the shortest decimal
 * (`(0.015).toFixed(2)` is `"0.01"`, the same value through `toLocaleString` is
 * `"0.02"`). Nothing in `INVENTORY.md` §5 warned about this pair, so the cases are
 * here to pin which side the port lands on; a Dart port that implements one
 * formatter with the other moves a displayed rupee by a paisa.
 */
const FORMAT_EDGE_AMOUNTS = [0.015, -0.015, 1.005, 8.835, 0.999, 999.9999, 125000.0049, 1e-7, 1e22, 2.5, -2.5];

function unitMoney(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  for (const a of AMOUNTS) c.push(measure(`toMinorUnits(${fmt(a)})`, [a], () => toMinorUnits(a as never)));
  for (const a of [null, undefined, NaN, 0, -0, 1999, 1234.5, 1234.4, Infinity, -12345, 1, 0.5, -0.5, 999999999999])
    c.push(measure(`toMajorUnits(${fmt(a)})`, [a], () => toMajorUnits(a as never)));
  for (const [a, b] of [
    [0.1, 0.2],
    [-2.5, 2.5],
    [19.99, 0.01],
    [0, 0],
    [NaN, 1],
    [Infinity, 1],
    [-38420, 5000],
    [1e21, 0.005],
  ]) {
    c.push(measure(`addMoney(${fmt(a)},${fmt(b)})`, [a, b], () => addMoney(a, b)));
    c.push(measure(`subtractMoney(${fmt(a)},${fmt(b)})`, [a, b], () => subtractMoney(a, b)));
    c.push(measure(`compareMoney(${fmt(a)},${fmt(b)})`, [a, b], () => compareMoney(a, b)));
  }
  for (const arr of [[], [0.1], [0.1, 0.2], [1, 2, 3], [NaN, 1], [Infinity], [-5000, 5000], [19.99, 19.99, 19.99]])
    c.push(measure(`sumMoney([${arr.map(fmt)}])`, [arr], () => sumMoney(arr)));
  for (const [a, f] of [
    [10, 1 / 3],
    [10, 0],
    [10, -1],
    [19.99, 100],
    [0.005, 1],
    [10, Infinity],
    [10, NaN],
    [-38420, 0.05],
  ])
    c.push(measure(`multiplyMoney(${fmt(a)},${fmt(f)})`, [a, f], () => multiplyMoney(a, f)));
  for (const amt of [-500, 0, -0, 1234.5, NaN, Infinity, 0.005, 125000.005, 1e21]) {
    c.push(measure(`formatMoney('Rs.',${fmt(amt)})`, ['Rs.', amt, {}], () => formatMoney('Rs.', amt)));
    c.push(
      measure(`formatMoney('Rs.',${fmt(amt)},signed)`, ['Rs.', amt, { signed: true }], () =>
        formatMoney('Rs.', amt, { signed: true }),
      ),
    );
    c.push(
      measure(`formatMoney('Rs.',${fmt(amt)},2dp)`, ['Rs.', amt, { minFractionDigits: 2, maxFractionDigits: 2 }], () =>
        formatMoney('Rs.', amt, { minFractionDigits: 2, maxFractionDigits: 2 }),
      ),
    );
    c.push(
      measure(`formatMoney('Rs.',${fmt(amt)},0dp)`, ['Rs.', amt, { maxFractionDigits: 0 }], () =>
        formatMoney('Rs.', amt, { maxFractionDigits: 0 }),
      ),
    );
    // min above max is silently clamped to max by Math.min()
    c.push(
      measure(
        `formatMoney('Rs.',${fmt(amt)},min>max)`,
        ['Rs.', amt, { minFractionDigits: 4, maxFractionDigits: 2 }],
        () => formatMoney('Rs.', amt, { minFractionDigits: 4, maxFractionDigits: 2 }),
      ),
    );
  }
  c.push(measure("formatMoney('',500)", ['', 500, {}], () => formatMoney('', 500)));

  // Half-cent negatives — the exact inputs where `Math.round`'s tie (toward +∞) and
  // Dart's `.round()` (away from zero) land differently and the value is not already an
  // integer, so `AMOUNTS`' `2.5` / `0.005` pair above does not cover them.
  for (const a of [-0.125, 0.125, -0.5, 0.5, -1.5, 1.5, -1e17 - 0.5, 1e17 + 0.5]) {
    c.push(measure(`toMinorUnits(${fmt(a)})`, [a], () => toMinorUnits(a as never)));
  }

  // Non-integer cents reaching `toFixed`, which rounds a second time and does it on the
  // exact binary value: `1.5` cents is `"0.01"` while `2.5` cents is `"0.03"`, because
  // `0.015` is below its decimal half in binary and `0.025` is above it.
  for (const cents of [1.5, 2.5, -1.5, -2.5, 12345.678, 1e-7, 1e21]) {
    c.push(measure(`toMajorUnits(${fmt(cents)})`, [cents], () => toMajorUnits(cents as never)));
  }

  // `formatMoney` on the same tie values, through `toLocaleString`, which rounds on the
  // shortest decimal instead — `0.015` here is `"0.02"`, not the `"0.01"` above.
  for (const amt of FORMAT_EDGE_AMOUNTS) {
    c.push(measure(`formatMoney('Rs.',${fmt(amt)})`, ['Rs.', amt, {}], () => formatMoney('Rs.', amt)));
    c.push(
      measure(`formatMoney('Rs.',${fmt(amt)},signed)`, ['Rs.', amt, { signed: true }], () =>
        formatMoney('Rs.', amt, { signed: true }),
      ),
    );
    c.push(
      measure(`formatMoney('Rs.',${fmt(amt)},2dp)`, ['Rs.', amt, { minFractionDigits: 2, maxFractionDigits: 2 }], () =>
        formatMoney('Rs.', amt, { minFractionDigits: 2, maxFractionDigits: 2 }),
      ),
    );
    c.push(
      measure(`formatMoney('Rs.',${fmt(amt)},0dp)`, ['Rs.', amt, { maxFractionDigits: 0 }], () =>
        formatMoney('Rs.', amt, { maxFractionDigits: 0 }),
      ),
    );
    c.push(
      measure(`formatMoney('Rs.',${fmt(amt)},4dp)`, ['Rs.', amt, { minFractionDigits: 2, maxFractionDigits: 4 }], () =>
        formatMoney('Rs.', amt, { minFractionDigits: 2, maxFractionDigits: 4 }),
      ),
    );
  }
  write('money', prov, c);
}

// ===========================================================================
// 1b. number-locale
// ===========================================================================
/**
 * `formatMoney` renders its digits through `toLocaleString(undefined, …)`
 * (`src/lib/money.ts:61`), so the separators, the grouping runs, the digit set and the
 * negative glyph all come from the runtime's locale — the browser's on the web, the
 * phone's in the port (ruled at the Phase 4 gate, `parity/DATA_SPEC.md` §11 D-12).
 *
 * The web can only ever be measured under the locale the generator happens to run in,
 * which is why `money.json` alone proves nothing about `en-IN` or `de-DE`. These cases
 * pin the same expression with the locale argument made explicit: `formatMoneyIn('de-DE',
 * 'Rs.', 1234.5)` is what a de-DE browser shows for the call `money.ts` makes.
 *
 * **This function is a transcription, not an import** — the only one in this file, and
 * forced by the fact that `money.ts` hardcodes `undefined`. It is copied from the tagged
 * bytes rather than called, and the `undefined` is the only token replaced. Two things
 * keep the copy honest: D7 refuses to generate at all unless `src/lib/money.ts` is
 * byte-identical to `pre-flutter`, and `assertCopyMatchesOriginal` below fails the run if
 * the transcription and the real function disagree under the runtime's own locale.
 */
function formatMoneyIn(
  tag: string,
  currency: string,
  amount: number,
  options: { minFractionDigits?: number; maxFractionDigits?: number; signed?: boolean } = {},
): string {
  const { minFractionDigits = 0, maxFractionDigits = 2, signed = false } = options;
  const safe = Number.isFinite(amount) ? amount : 0;
  const digits = Math.min(minFractionDigits, maxFractionDigits);
  const body = Math.abs(safe).toLocaleString(tag, {
    minimumFractionDigits: digits,
    maximumFractionDigits: maxFractionDigits,
  });
  return `${signed && safe < 0 ? '-' : ''}${currency}${body}`;
}

/** The copy's proof: passing the runtime's own tag explicitly must equal passing
 *  `undefined`. Anything else means the transcription drifted from `money.ts`. */
function assertCopyMatchesOriginal(): void {
  const here = Intl.NumberFormat().resolvedOptions().locale;
  for (const amount of [0.015, 1234.5, -500, 1e21, 999.9999, 1250000, 0]) {
    for (const options of [
      {},
      { minFractionDigits: 2, maxFractionDigits: 2 },
      { maxFractionDigits: 0 },
      { signed: true },
    ]) {
      const mine = formatMoneyIn(here, 'Rs.', amount, options);
      const real = formatMoney('Rs.', amount, options);
      if (mine !== real) {
        throw new Error(
          `number-locale: the transcribed formatter diverged from money.ts under ${here} for ` +
            `${JSON.stringify(amount)} ${JSON.stringify(options)}: "${mine}" != "${real}"`,
        );
      }
    }
  }
}

const NUMBER_LOCALES = [
  'en-US',
  'en-IN',
  'de-DE',
  'fr-FR',
  'hi-IN',
  'ar-EG',
  'cs-CZ',
  'bn-BD',
  // The product's own two: `en-LK` and `si-LK` are the locales a Sri Lankan user's
  // phone actually reports. Ruled at the Phase-4 gate (INVENTORY §13h D25): the app
  // formats in the device locale, so the locales its users see have to be measured,
  // not assumed. `Rs.` is the symbol the web's own CSV exporters default to
  // (`src/utils.ts:348`); the currency the *screens* render in comes from state.
  'en-LK',
  'si-LK',
];

/** Amounts chosen for what each one exercises: `1250000` is the lakh grouping,
 *  `1234567.891` the three-group case, `1e21` expansion past exponential notation,
 *  `1e-7` the zero-digit rounding, `0.015`/`1.005` the shortest-decimal tie, `-2.5` the
 *  negative shape, and `-0` the sign `Intl` keeps but `toFixed` drops. */
const NUMBER_LOCALE_AMOUNTS = [0, -0, 0.015, 1.005, 2.5, -2.5, 999.9999, 125000.0049, 1234567.891, 1250000, 1e21, 1e-7];

/** The baseline block: the same figures the web renders in `parity/screenshots/web/`,
 *  measured so that "what the phone prints for an LKR amount" is checked against what
 *  the browser printed for it, rather than against a guess.
 *
 *  `LKR` is the seeded state's `currency` (`qa-shot.cjs:320`), so it is the symbol in
 *  every one of the 48 PNGs. The first four amounts are read off
 *  `web/light/390/overviewhub.png` — available balance `750,500`, the ▲ delta
 *  `LKR488,820`, `Net worth LKR2,588,660`, `SPENT · TODAY LKR13,680` — and are produced
 *  by `formatMoney(currency, x, { maxFractionDigits: 0 })` at
 *  `src/components/dashboard/DashboardHero.tsx:194-228`. The rest are the money literals
 *  the harness seeds (`qa-shot.cjs:121-283`), which reach the other tabs' rows.
 *
 *  Three locales, not ten: `en-US` is the Chromium default this harness shot under (no
 *  `locale` is passed to `newContext`, so the browser inherits the OS), and `en-LK` /
 *  `si-LK` are the tags a Sri Lankan phone reports. If those three agree, the screenshot
 *  and the phone agree whatever the device language. */
const NUMBER_LOCALE_BASELINE_LOCALES = ['en-US', 'en-LK', 'si-LK'];
const NUMBER_LOCALE_BASELINE_AMOUNTS = [
  750500, 488820, 2588660, 13680, 265000, 145000, 900000, 612500, 2899, 2399, 11400, 7200, 25000, 50000, 30000,
];

function unitNumberLocale(prov: ReturnType<typeof resolveProvenance>): void {
  assertCopyMatchesOriginal();
  const c: Case[] = [];
  for (const tag of NUMBER_LOCALES) {
    for (const amt of NUMBER_LOCALE_AMOUNTS) {
      c.push(
        measure(`formatMoneyIn("${tag}",'Rs.',${fmt(amt)})`, [tag, 'Rs.', amt, {}], () =>
          formatMoneyIn(tag, 'Rs.', amt),
        ),
      );
      c.push(
        measure(
          `formatMoneyIn("${tag}",'Rs.',${fmt(amt)},2dp)`,
          [tag, 'Rs.', amt, { minFractionDigits: 2, maxFractionDigits: 2 }],
          () => formatMoneyIn(tag, 'Rs.', amt, { minFractionDigits: 2, maxFractionDigits: 2 }),
        ),
      );
    }
    for (const amt of [1234567.891, 0.015, 1250000, -2.5]) {
      c.push(
        measure(`formatMoneyIn("${tag}",'Rs.',${fmt(amt)},0dp)`, [tag, 'Rs.', amt, { maxFractionDigits: 0 }], () =>
          formatMoneyIn(tag, 'Rs.', amt, { maxFractionDigits: 0 }),
        ),
      );
    }
    c.push(
      measure(`formatMoneyIn("${tag}",'',1234567.891)`, [tag, '', 1234567.891, {}], () =>
        formatMoneyIn(tag, '', 1234567.891),
      ),
    );
  }
  for (const tag of NUMBER_LOCALE_BASELINE_LOCALES) {
    for (const amt of NUMBER_LOCALE_BASELINE_AMOUNTS) {
      c.push(
        measure(`baseline("${tag}",'LKR',${fmt(amt)})`, [tag, 'LKR', amt, { maxFractionDigits: 0 }], () =>
          formatMoneyIn(tag, 'LKR', amt, { maxFractionDigits: 0 }),
        ),
      );
    }
  }
  write('number-locale', prov, c);
}

// Case names must identify the input unambiguously, because a Dart test file
// generated from them keys each test by name. `String(-0)` is `"0"`, which
// collided with the real zero and silently merged the two half-rounding cases —
// the exact inputs the port is most likely to get wrong. So -0 is spelled here.
const fmt = (v: unknown): string => {
  if (typeof v === 'number' && Object.is(v, -0)) return '-0';
  return typeof v === 'string' ? JSON.stringify(v) : String(v);
};

// ===========================================================================
// 2. credit-cycles
// ===========================================================================
function unitCreditCycles(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  c.push(measure('DEDUCTION_DAY', [], () => DEDUCTION_DAY));

  for (const d of [...new Set([...MONTH_ENDS, ...BAD_DATES, '2026-10-07', '2026-10-15', '2026-10-01', '2026-10-31'])])
    c.push(measure(`deductionDate(${d})`, [d], () => deductionDate(d)));
  // DAY31 and MONTH_ENDS both hold the 31sts; the Set keeps one case per input
  // so the two families cannot emit the same call twice under one name.
  for (const d of [...new Set([...DAY31, ...MONTH_ENDS, ...BAD_DATES])])
    c.push(measure(`advanceDueDate(${d})`, [d], () => advanceDueDate(d)));
  // the one-way clamp: repeated advances from the 31th never return to it
  for (let i = 1; i <= 12; i++) {
    let cur = '2026-01-31';
    for (let k = 0; k < i; k++) cur = advanceDueDate(cur);
    c.push(measure(`advanceDueDate^${i}(2026-01-31)`, ['2026-01-31', i], () => cur));
  }
  for (const d of [...MONTH_ENDS, ...BAD_DATES])
    c.push(measure(`cycleWindowStart(${d})`, [d], () => cycleWindowStart(d)));

  for (const [b, l] of [
    [1000, 100000],
    [0, 100000],
    [-1000, 100000],
    [-5000, 100000],
    [-38420, 250000],
    [-260000, 250000],
    [-250000, 250000],
    [-100000, 0],
    [-100000, undefined],
    [-100000, NaN],
    [NaN, 100000],
    [-Infinity, 100000],
    [-0.005, 10],
    [-0.01, 10],
  ])
    c.push(
      measure(`computeMinimumPayment(${fmt(b)},${fmt(l)})`, [b, l], () =>
        computeMinimumPayment(b as number, l as number),
      ),
    );

  for (const [b, apr, d] of [
    [-38420, 24.9, 30],
    [-38420, 24.9, 0],
    [-38420, 24.9, -1],
    [38420, 24.9, 30],
    [0, 24.9, 30],
    [-1000, 0, 30],
    [-1000, NaN, 30],
    [-1000, undefined, 30],
    [NaN, 24.9, 30],
    [-0, 24.9, 30],
    [-36500, 36.5, 365],
    [-1, 1, 1],
  ] as Array<[number, number, number]>)
    c.push(
      measure(`interestForCycle(${fmt(b)},${fmt(apr)},${fmt(d)})`, [b, apr, d], () => interestForCycle(b, apr, d)),
    );

  for (const m of [0, undefined, -5, 1, 24000, 23999, 24001, NaN, Infinity])
    c.push(measure(`latePaymentFee(${fmt(m)})`, [m], () => latePaymentFee(m as number)));

  for (const [a, b] of [
    ['2026-09-15', '2026-10-07'],
    ['2026-10-07', '2026-10-07'],
    ['2026-10-07', '2026-10-08'],
    ['2026-02-01', '2026-03-01'],
    ['2028-02-01', '2028-03-01'],
    ['2026-12-31', '2027-01-01'],
    ['2026-9-5', '2026-10-05'],
    ['', '2026-10-05'],
  ])
    c.push(measure(`daysBetween(${a},${b})`, [a, b], () => daysBetween(a, b)));

  for (const card of [
    { dueDate: '2026-10-07' },
    { statementCloseDate: '2026-09-28', dueDate: '2026-10-07' },
    { statementCloseDate: '' },
    {},
    { statementCloseDate: '2026-09-28' },
  ])
    c.push(measure(`cycleAnchor(${JSON.stringify(card)})`, [card], () => cycleAnchor(card)));

  write('credit-cycles', prov, c);
}

// ===========================================================================
// 3. credit-payments
// ===========================================================================
function unitCreditPayments(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  const pay = (date: string, over: Record<string, unknown> = {}) =>
    tx({
      id: `p-${date}`,
      type: 'debt_payment',
      targetAccountId: 'cc-1',
      targetAccountType: 'card',
      amount: 5000,
      date,
      ...over,
    });

  // window is [cycleWindowStart('2026-10-07'), '2026-10-07'] = [2026-09-07, 2026-10-07]
  const DUE = '2026-10-07';
  const START = cycleWindowStart(DUE);
  for (const d of [
    '2026-09-06',
    START,
    '2026-09-20',
    '2026-10-06',
    DUE,
    '2026-10-08',
    '2026-10-14',
    '2026-10-15',
    '2026-9-20',
    '2026-11-01',
  ])
    c.push(
      measure(`paymentsInCycle([${d}])`, [[pay(d)], 'cc-1', DUE], () =>
        paymentsInCycle([pay(d) as never], 'cc-1', DUE),
      ),
    );

  c.push(measure('paymentsInCycle(empty)', [[], 'cc-1', DUE], () => paymentsInCycle([], 'cc-1', DUE)));
  c.push(
    measure('paymentsInCycle(no dueDate)', [[pay('2026-09-20')], 'cc-1', ''], () =>
      paymentsInCycle([pay('2026-09-20') as never], 'cc-1', ''),
    ),
  );
  c.push(
    measure(
      'paymentsInCycle(wrong targetAccountType)',
      [[pay('2026-09-20', { targetAccountType: 'cash' })], 'cc-1', DUE],
      () => paymentsInCycle([pay('2026-09-20', { targetAccountType: 'cash' }) as never], 'cc-1', DUE),
    ),
  );
  c.push(
    measure('paymentsInCycle(wrong cardId)', [[pay('2026-09-20', { targetAccountId: 'zz' })], 'cc-1', DUE], () =>
      paymentsInCycle([pay('2026-09-20', { targetAccountId: 'zz' }) as never], 'cc-1', DUE),
    ),
  );
  c.push(
    measure('paymentsInCycle(type=transfer)', [[pay('2026-09-20', { type: 'transfer' })], 'cc-1', DUE], () =>
      paymentsInCycle([pay('2026-09-20', { type: 'transfer' }) as never], 'cc-1', DUE),
    ),
  );
  c.push(
    measure(
      'paymentsInCycle(mixed, anchored on close)',
      [[pay('2026-09-20'), pay('2026-10-08', { id: 'p2' })], 'cc-1', DUE, '2026-09-28'],
      () => paymentsInCycle([pay('2026-09-20'), pay('2026-10-08', { id: 'p2' })] as never[], 'cc-1', DUE, '2026-09-28'),
    ),
  );
  c.push(
    measure('paymentsInCycle(string amount)', [[pay('2026-09-20', { amount: '1500.5' as never })], 'cc-1', DUE], () =>
      paymentsInCycle([pay('2026-09-20', { amount: '1500.5' }) as never], 'cc-1', DUE),
    ),
  );
  c.push(
    measure('paymentsInCycle(NaN amount)', [[pay('2026-09-20', { amount: NaN })], 'cc-1', DUE], () =>
      paymentsInCycle([pay('2026-09-20', { amount: NaN }) as never], 'cc-1', DUE),
    ),
  );

  for (const [minPay, date, kind] of [
    [1921, '2026-10-15', 'deduction'],
    [1921, '2026-10-14', 'day-before-deduction'],
    [1921, '2026-10-07', 'window-end'],
    [1921, '2026-09-20', 'window-middle'],
    [0, '2026-09-20', 'min-zero'],
    [undefined, '2026-09-20', 'min-unset'],
  ] as Array<[number | undefined, string, string]>)
    c.push(
      measure(`isMinimumSatisfied(${kind})`, [minPay, date], () =>
        isMinimumSatisfied(
          creditCard({ minPayment: minPay }) as never,
          [pay(date, { amount: 1921, id: `q-${kind}` })] as never[],
        ),
      ),
    );
  c.push(
    measure('isMinimumSatisfied(deduction amount 0)', [], () =>
      isMinimumSatisfied(
        creditCard({ minPayment: 1921 }) as never,
        [pay('2026-10-15', { amount: 0, id: 'z' })] as never[],
      ),
    ),
  );
  c.push(
    measure('isMinimumSatisfied(no dueDate)', [], () =>
      isMinimumSatisfied(creditCard({ dueDate: '' }) as never, [pay('2026-09-20')] as never[]),
    ),
  );
  c.push(
    measure('isMinimumSatisfied(overpaid in window)', [], () =>
      isMinimumSatisfied(
        creditCard({ minPayment: 1921 }) as never,
        [pay('2026-09-20', { amount: 9000, id: 'big' })] as never[],
      ),
    ),
  );

  for (const [bal, amt, hasDue] of [
    [-38420, 5000, true],
    [-38420, 38420, true],
    [-38420, 38421, true],
    [0, 0, true],
    [-100, 100, false],
    [-38420, NaN, true],
    [-38420, '5000', true],
  ] as Array<[number, number, boolean]>)
    c.push(
      measure(`maybeRollCard(${fmt(bal)}+${fmt(amt)},due=${hasDue})`, [bal, amt, hasDue], () =>
        maybeRollCard(
          creditCard({ currentBalance: bal, dueDate: hasDue ? '2026-10-07' : undefined }) as never,
          [],
          amt,
        ),
      ),
    );

  write('credit-payments', prov, c);
}

// ===========================================================================
// 4. cycle-rollover
// ===========================================================================
function unitCycleRollover(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  const pay = (date: string, amount: number, id: string) =>
    tx({ id, type: 'debt_payment', targetAccountId: 'cc-1', targetAccountType: 'card', amount, date });

  const scenarios: Array<[string, Record<string, unknown>, never[], string]> = [
    ['cycle still open — day before deduction', {}, [pay('2026-09-20', 5000, 'a')], '2026-10-14'],
    ['exactly on deduction day', {}, [pay('2026-09-20', 5000, 'a')], '2026-10-15'],
    ['day after deduction', {}, [pay('2026-09-20', 5000, 'a')], '2026-10-16'],
    ['no due date configured', { dueDate: undefined }, [], '2026-12-01'],
    ['minimum unpaid -> late fee + interest', { minPayment: 1921 }, [pay('2026-08-01', 5000, 'outside')], '2026-10-15'],
    ['minimum paid in window -> interest only', { minPayment: 1921 }, [pay('2026-09-20', 1921, 'ok')], '2026-10-15'],
    [
      'bank deduction on the 15th satisfies minimum',
      { minPayment: 1921 },
      [pay('2026-10-15', 1921, 'deduct')],
      '2026-10-15',
    ],
    ['minPayment unset -> never a late fee', { minPayment: undefined }, [], '2026-10-15'],
    ['no APR -> no interest charge', { apr: 0, minPayment: 1921 }, [], '2026-10-15'],
    ['NaN APR', { apr: NaN, minPayment: 1921 }, [], '2026-10-15'],
    ['credit balance (no debt) -> clears dates', { currentBalance: 5000, minPayment: 1921 }, [], '2026-10-15'],
    ['zero balance with a due date', { currentBalance: 0, minPayment: 1921 }, [], '2026-10-15'],
    [
      'over-limit card recomputes minimum',
      { currentBalance: -260000, limit: 250000, minPayment: 13000 },
      [],
      '2026-10-15',
    ],
    [
      'statement close date anchors the window',
      { statementCloseDate: '2026-09-28', minPayment: 1921 },
      [pay('2026-09-28', 1921, 'anchor')],
      '2026-10-15',
    ],
    ['charges settle the balance to exactly zero', { currentBalance: -100, minPayment: 50, apr: 0 }, [], '2026-10-15'],
    [
      'leap February cycle',
      { dueDate: '2028-02-07', statementCloseDate: '2028-01-28', minPayment: 1000 },
      [],
      '2028-02-15',
    ],
    ['December rollover advances across the year', { dueDate: '2026-12-07' }, [], '2026-12-15'],
    [
      'Jan-31 due date drifts after clamping',
      { dueDate: '2026-01-31', currentBalance: -5000, minPayment: 250 },
      [],
      '2026-01-15',
    ],
  ];

  for (const [name, over, txs, today] of scenarios) {
    c.push(
      measure(`runCycleRollover(${name})`, [over, today], () => {
        const card = creditCard(over) as never;
        const r = runCycleRollover(card, txs as never[], today);
        // `undefined` cannot be a JSON key, so the "still open" answer is explicit.
        return r === undefined ? { __sentinel__: 'undefined-result' } : r;
      }),
    );
  }

  // idempotency: the function is idempotent-free, and a port that calls it twice
  // double-charges. Measured, not assumed.
  const once = runCycleRollover(creditCard({}) as never, [] as never[], '2026-10-15');
  const twice = runCycleRollover(
    creditCard({ currentBalance: (once as { currentBalance: number }).currentBalance }) as never,
    [] as never[],
    '2026-10-15',
  );
  c.push(
    measure('runCycleRollover applied twice double-charges', ['same card, same cycle'], () => ({
      firstBalance: once?.currentBalance,
      secondBalance: (twice as { currentBalance: number })?.currentBalance,
    })),
  );

  write('cycle-rollover', prov, c);
}

// ===========================================================================
// 5. installments
// ===========================================================================
function unitInstallments(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  for (const [amt, ten] of [
    [50000, 6],
    [50000, 12],
    [50000, 24],
    [50000, 48],
    [50000, 18],
    [50000, 0],
    [10000, 3],
    [100 / 3, 1],
    [0, 12],
    [-50000, 12],
    [1e21, 12],
  ] as Array<[number, number]>) {
    c.push(
      measure(`calculateInstallmentFee(${fmt(amt)},${fmt(ten)})`, [amt, ten], () => calculateInstallmentFee(amt, ten)),
    );
    c.push(
      measure(`calculateMonthlyPayment(${fmt(amt)},${fmt(ten)})`, [amt, ten], () => calculateMonthlyPayment(amt, ten)),
    );
    c.push(measure(`formatFeeBreakdown(${fmt(amt)},${fmt(ten)})`, [amt, ten], () => formatFeeBreakdown(amt, ten)));
  }

  for (const [mp, ten, start, orig] of [
    [833.33, 12, '2026-01-31', 10000],
    [833.33, 12, '2026-01-31', undefined],
    [33.33, 3, '2026-01-31', 100],
    [1000, 2, '2028-01-31', undefined],
    [1000, 0, '2026-01-31', undefined],
    [1000, 1, '2026-01-31', undefined],
    [5000, 6, '2026-02-29', undefined],
    [1000, 3, '2026-11-30', undefined],
    [1000, 3, 'not-a-date', undefined],
    // originalAmount smaller than (tenure-1)*monthly => absorbed<=0, does not tile
    [1000, 4, '2026-01-15', 2500],
    [1000, 4, '2026-01-15', 5000],
  ] as Array<[number, number, string, number | undefined]>)
    c.push(
      measure(`generateInstallmentSchedule(${mp},${ten},${start},${fmt(orig)})`, [mp, ten, start, orig], () =>
        generateInstallmentSchedule('inst-1', mp, ten, start, orig),
      ),
    );

  for (const [card, amt, name] of [
    [debitCard(), 50000, 'debit'],
    [creditCard({ isCanceled: true }), 50000, 'cancelled'],
    [creditCard({ isFrozen: true }), 50000, 'frozen'],
    [creditCard(), 4999, 'below minimum'],
    [creditCard(), 5000, 'at minimum'],
    [creditCard(), 5001, 'above minimum'],
    [creditCard({ currentBalance: -300000, limit: 250000 }), 6000, 'over limit'],
    [creditCard({ currentBalance: -250000, limit: 250000 }), 6000, 'exactly at limit'],
    [creditCard({ currentBalance: 5000, limit: 10000 }), 20000, 'exceeds available'],
    [creditCard({ limit: undefined }), 6000, 'no limit set'],
    [creditCard({ currentBalance: 0, limit: 250000 }), 250000, 'full available'],
  ] as Array<[never, number, string]>)
    // The card travels in `input`, not only in the case name: the gate is a function
    // of eight fields and a name like `over limit` cannot be replayed by a port that
    // has to build the object itself. `limit: undefined` survives as an absent key,
    // which is what the web's `card.limit || 0` actually sees.
    c.push(
      measure(`isCardEligibleForInstallment(${name})`, [card, amt], () => isCardEligibleForInstallment(card, amt)),
    );

  const sched = generateInstallmentSchedule('inst-1', 1000, 3, '2026-01-15');
  for (const [mutate, name] of [
    [(p: unknown[]) => p, 'none paid'],
    [(p: unknown[]) => p.map((x, i) => ({ ...(x as object), status: i === 0 ? 'paid' : 'pending' })), 'first paid'],
    [(p: unknown[]) => p.map((x) => ({ ...(x as object), status: 'paid' })), 'all paid'],
    [(p: unknown[]) => [], 'no rows'],
    [
      (p: unknown[]) => [
        ...p,
        {
          installmentId: 'other',
          paymentNumber: 9,
          amountDue: 1,
          amountPaid: 1,
          dueDate: '2026-05-15',
          status: 'paid',
        },
      ],
      'foreign installment row included',
    ],
  ] as Array<[(p: unknown[]) => unknown[], string]>) {
    const rows = mutate(sched);
    c.push(
      measure(`getInstallmentProgress(${name})`, [{ id: 'inst-1' }, rows], () =>
        getInstallmentProgress({ id: 'inst-1' } as never, rows as never),
      ),
    );
  }
  const midList = [
    {
      installmentId: 'inst-1',
      paymentNumber: 2,
      amountDue: 1000,
      amountPaid: 1000,
      dueDate: '2026-03-15',
      status: 'paid',
    },
    {
      installmentId: 'inst-1',
      paymentNumber: 1,
      amountDue: 1000,
      amountPaid: 0,
      dueDate: '2026-02-15',
      status: 'pending',
    },
    {
      installmentId: 'inst-1',
      paymentNumber: 3,
      amountDue: 1000,
      amountPaid: 0,
      dueDate: '2026-04-15',
      status: 'pending',
    },
  ];
  c.push(
    measure('getInstallmentProgress(partially paid mid-list)', [{ id: 'inst-1' }, midList], () =>
      getInstallmentProgress({ id: 'inst-1' } as never, midList as never),
    ),
  );

  write('installments', prov, c);
}

// ===========================================================================
// 6. dates-local  (the second, deliberately different date regime)
// ===========================================================================
function unitDatesLocal(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  const at = (s: string) => new REAL_DATE(s);

  for (const s of [
    '2026-10-04T00:00:00',
    '2026-10-04T23:59:59.999',
    '2026-10-04T18:30:00Z',
    '2026-01-01T00:00:00Z',
    '2026-12-31T23:59:59Z',
    '2026-02-29T12:00:00',
  ])
    c.push(measure(`localDayKey(${s})`, [s], () => localDayKey(at(s))));
  c.push(measure('localDayKey(Invalid Date)', ['invalid'], () => localDayKey(new REAL_DATE('nope'))));
  c.push(measure('todayLocal() [pinned now]', [], () => todayLocal()));

  const now = PINNED_NOW;
  for (const iso of [
    '2026-10-01',
    '2026-10-04',
    '2026-10-31',
    '2026-09-30',
    '2026-11-01',
    '2025-10-04',
    '2027-10-04',
    '2026-10-04T18:30:00Z',
    '2026-13-45',
    '',
    'garbage',
    undefined,
  ])
    c.push(measure(`isInCurrentMonth(${fmt(iso)})`, [iso], () => isInCurrentMonth(iso as never, now)));
  c.push(
    measure('isInCurrentMonth(10 years ago, same month number)', ['2016-10-04'], () =>
      isInCurrentMonth('2016-10-04', now),
    ),
  );

  for (const iso of ['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-05', '2026-09-04', '', 'garbage', undefined])
    c.push(measure(`isAlertDayRecent(${fmt(iso)})`, [iso], () => isAlertDayRecent(iso as never, now)));

  const MONTH_ARITH = [-13, -1, 0, 1, 12, 25];
  for (const iso of ['2026-01-31', '2026-01-30', '2026-01-29', '2026-03-31', '2028-02-29', '2026-02-28', '2026-10-15'])
    for (const m of MONTH_ARITH)
      c.push(measure(`addMonthsClamped(${iso},${m})`, [iso, m], () => addMonthsClamped(iso, m)));
  for (const bad of ['', '2026-9-5', 'not-a-date'])
    c.push(measure(`addMonthsClamped(${bad},1)`, [bad, 1], () => addMonthsClamped(bad, 1)));
  // the local-vs-UTC divergence, stated explicitly for the port
  for (const s of ['2026-10-04T18:30:00Z', '2026-10-04T23:30:00Z', '2026-10-04T00:30:00Z'])
    c.push(measure(`addMonthsClamped(timestamp ${s},1)`, [s, 1], () => addMonthsClamped(s, 1)));

  c.push(
    measure('dates-local: addMonthsClamped vs advanceDueDate input tolerance', ['2026-01-31T10:00:00Z'], () => ({
      addMonthsClamped: addMonthsClamped('2026-01-31T10:00:00Z', 1),
      advanceDueDate: advanceDueDate('2026-01-31T10:00:00Z'),
    })),
  );

  write('dates-local', prov, c);
}

// ===========================================================================
// 7. net-worth
// ===========================================================================
function unitNetWorth(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  const state = (over: Record<string, unknown> = {}) => ({ currency: 'Rs.', ...over });

  c.push(measure('calculateNetWorth(empty state)', [{}], () => calculateNetWorth(state() as never)));
  c.push(measure('calculateNetWorth(all collections absent)', [{}], () => calculateNetWorth({} as never)));
  c.push(
    measure('calculateNetWorth(happy path)', [], () =>
      calculateNetWorth(
        state({
          cashAccounts: [
            { id: 'a', name: 'w', balance: 184500 },
            { id: 'b', name: 's', balance: 26000 },
          ],
          cards: [
            debitCard({ currentBalance: 74250, lockedAmount: 5000 }),
            creditCard({ currentBalance: -38420 }),
            creditCard({ id: 'cc-2', currentBalance: 12000 }),
          ],
          debts: [{ id: 'd1', remainingAmount: 100000 }],
          loansGiven: [
            { id: 'l1', remainingAmount: 40000 },
            { id: 'l2', totalAmount: 15000 },
          ],
          savingsGoals: [{ id: 'g1', current: 312000 }],
        }) as never,
      ),
    ),
  );
  for (const [over, name] of [
    [{ cards: [debitCard({ lockedAmount: '5000' })] }, 'lockedAmount as numeric string'],
    [{ cards: [debitCard({ lockedAmount: null })] }, 'lockedAmount null'],
    [{ cards: [debitCard({ lockedAmount: 'abc' })] }, 'lockedAmount NaN string'],
    [{ cards: [creditCard({ currentBalance: 0 })] }, 'credit card at exactly zero'],
    [{ cards: [creditCard({ isCanceled: true })] }, 'cancelled credit card with debt'],
    [{ cards: [debitCard({ isCanceled: true })] }, 'cancelled debit card'],
    [{ savingsGoals: [{ id: 'g', current: 0 }, { id: 'h' }] }, 'jar at 0 vs jar undefined'],
    [{ loansGiven: [{ id: 'l', remainingAmount: null, totalAmount: 500 }] }, 'loan remainingAmount null (no fallback)'],
    [{ loansGiven: [{ id: 'l', remainingAmount: 0, totalAmount: 500 }] }, 'loan remainingAmount 0'],
    [{ debts: [{ id: 'd', remainingAmount: NaN }] }, 'debt NaN'],
    [
      {
        cashAccounts: [
          { id: 'a', balance: 0.1 },
          { id: 'b', balance: 0.2 },
        ],
      },
      'float residue absorbed by sumMoney',
    ],
  ] as Array<[Record<string, unknown>, string]>)
    c.push(measure(`calculateNetWorth(${name})`, [name], () => calculateNetWorth(state(over) as never)));

  for (const [type, category, amount] of [
    ['income', undefined, 500],
    ['deposit', undefined, 500],
    ['financing', undefined, 500],
    ['expense', undefined, 500],
    ['debt_payment', undefined, 500],
    ['withdrawal', undefined, 500],
    ['credit_card_charge', undefined, 500],
    ['transfer', 'Transfer In', 500],
    ['transfer', 'Transfer Out', 500],
    ['transfer', 'transfer in', 500],
    ['transfer', undefined, 500],
    ['expense', undefined, -500],
    ['expense', undefined, 'abc'],
    ['expense', undefined, NaN],
    ['unknown-type', undefined, 500],
    ['income', undefined, -0],
  ] as Array<[string, string | undefined, number]>)
    c.push(
      measure(`ledgerBalanceEffect(${type},${fmt(category)},${fmt(amount)})`, [type, category, amount], () =>
        ledgerBalanceEffect(type as never, category, amount),
      ),
    );

  for (const [jar, wallet, amt, name] of [
    [1000, 5000, 400, 'top up'],
    [1000, 5000, -400, 'withdraw within jar'],
    [1000, 5000, -4000, 'withdraw beyond jar (clamped)'],
    [1000, 5000, 0, 'zero -> null'],
    [0, 5000, -100, 'empty jar withdraw'],
    [1000, 5000, NaN, 'NaN amount'],
    [1000, 5000, -1000, 'exact jar drain -> null?'],
  ] as Array<[number, number, number, string]>)
    c.push(measure(`applyGoalAllocation(${name})`, [jar, wallet, amt], () => applyGoalAllocation(jar, wallet, amt)));

  for (const [owed, asked, name] of [
    [10000, 4000, 'partial'],
    [10000, 10000, 'exact'],
    [10000, 15000, 'over-pay (surplus vanishes)'],
    [0, 500, 'nothing owed'],
    [-1000, 500, 'negative owed clamps to 0'],
    [1000, -500, 'negative asked clamps to 0'],
    [1000, NaN, 'NaN asked'],
    [1000, '500', 'string asked'],
  ] as Array<[number, number, string]>)
    c.push(measure(`applyRepayment(${name})`, [owed, asked], () => applyRepayment(owed, asked)));

  for (const [t, name] of [
    [tx({ type: 'expense', amount: 10 }), 'positive expense'],
    [tx({ type: 'expense', amount: 0 }), 'zero expense'],
    [tx({ type: 'expense', amount: -10 }), 'negative expense'],
    [tx({ type: 'withdrawal', amount: 10 }), 'withdrawal is not spending'],
  ] as Array<[never, string]>)
    c.push(measure(`isSpendingRow(${name})`, [t], () => isSpendingRow(t)));

  const subs = [
    { id: 's1', name: 'Netflix', category: 'Entertainment', amount: 1500, status: 'Active' },
    { id: 's2', name: 'Old Sub', category: 'Entertainment', amount: 900, status: 'Paused' },
    { id: 's3', name: 'Annual', category: 'Entertainment', amount: 12000, status: 'Active' },
  ];
  c.push(
    measure('budgetSpendingForMonth(active subs count in full regardless of date)', [], () =>
      budgetSpendingForMonth('Entertainment', [], subs as never, PINNED_NOW),
    ),
  );
  c.push(
    measure('budgetSpendingForMonth(mixed-case category, this month)', [], () =>
      budgetSpendingForMonth(
        ' entertainment ',
        [
          tx({ category: 'Entertainment', amount: 500 }),
          tx({ category: 'ENTERTAINMENT', amount: 300 }),
          tx({ category: 'Entertainment', amount: 400, date: '2026-01-01' }),
        ] as never,
        subs as never,
        PINNED_NOW,
      ),
    ),
  );
  c.push(
    measure('budgetSpendingForMonth(no match)', [], () =>
      budgetSpendingForMonth('Groceries', [tx({ category: 'Shopping' })] as never, [] as never, PINNED_NOW),
    ),
  );

  write('net-worth', prov, c);
}

// ===========================================================================
// 8. alerts
// ===========================================================================
function unitAlerts(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  c.push(measure('BUDGET_WARN_AT', [], () => BUDGET_WARN_AT));
  const now = PINNED_NOW;

  // `daysRemaining`'s second argument defaults to `Date.now()`, which is the one thing
  // about this unit that is not a pure function of its arguments. The pinned clock is
  // what makes it reproducible, and the ms value is written into `input` beside the date
  // so a replay reads the reference day off the fixture rather than off this file.
  for (const d of [
    '2026-10-04',
    '2026-10-05',
    '2026-10-06',
    '2026-10-11',
    '2026-10-12',
    '2026-10-03',
    '2026-09-04',
    '',
    '2026-13-99',
    'garbage',
  ])
    c.push(measure(`daysRemaining(${d})`, [d, now], () => daysRemaining(d, now)));
  for (const d of ['2026-10-04T18:30:00Z', '2026-10-04T00:00:00'])
    c.push(measure(`daysRemaining(timestamp ${d})`, [d, now], () => daysRemaining(d, now)));

  const state = (over: Record<string, unknown> = {}) =>
    ({
      currency: 'Rs.',
      budgets: [],
      subscriptions: [],
      debts: [],
      savingsGoals: [],
      transactions: [],
      ...over,
    }) as never;

  /** One `computeAlerts` call, recorded with the **state and reference day that produced
   *  it** rather than a scenario label. A label made the golden replayable only by
   *  transcribing this function's literals into the Dart test, which is the failure mode
   *  that got `installments.json` rebuilt: the fixture has to be the contract. */
  const alertCase = (name: string, over: Record<string, unknown> = {}) => {
    const s = state(over);
    c.push(measure(`computeAlerts(${name})`, [s, now], () => computeAlerts(s, now)));
  };

  for (const [spent, limit, name] of [
    [799, 1000, 'just under warn'],
    [800, 1000, 'exactly 0.8'],
    [999, 1000, 'just under critical'],
    [1000, 1000, 'exactly 1.0'],
    [1500, 1000, '150%'],
    [10000, 1000, '1000%'],
  ] as Array<[number, number, string]>)
    alertCase(`budget ${name}`, {
      budgets: [{ id: 'b1', category: 'Shopping', limit, spent: 0 }],
      transactions: [tx({ type: 'expense', category: 'Shopping', amount: spent, date: '2026-10-02' })],
    });
  alertCase('budget limit 0 -> skipped', {
    budgets: [{ id: 'b1', category: 'Shopping', limit: 0, spent: 500 }],
  });
  alertCase('budget negative limit', {
    budgets: [{ id: 'b1', category: 'Shopping', limit: -100, spent: 500 }],
  });

  for (const [due, status, name] of [
    ['2026-10-04', 'Active', 'due today'],
    ['2026-10-05', 'Active', 'due in 1 day'],
    ['2026-10-06', 'Active', 'due in 2 days -> none'],
    ['2026-10-03', 'Active', 'overdue -> none'],
    ['2026-10-05', 'Paused', 'paused -> none'],
    ['', 'Active', 'no dueDate -> none'],
  ] as Array<[string, string, string]>)
    alertCase(`bill ${name}`, {
      subscriptions: [
        {
          id: 's1',
          name: 'Netflix',
          amount: 1500,
          status,
          dueDate: due,
          billingCycle: 'Monthly',
          category: 'Entertainment',
        },
      ],
    });

  for (const [due, status, remaining, name] of [
    ['2026-10-04', 'Active', 5000, 'debt due today'],
    ['2026-10-05', 'Active', 5000, 'debt due tomorrow'],
    ['2026-10-05', 'Fully Repaid', 5000, 'fully repaid -> none'],
    ['2026-10-05', 'Active', 0, 'remaining 0 -> none'],
  ] as Array<[string, string, number, string]>)
    alertCase(name, {
      debts: [{ id: 'd1', debtSource: 'Bank', dueDate: due, status, remainingAmount: remaining }],
    });

  for (const [targetDate, current, target, name] of [
    ['2026-10-11', 100, 1000, '7 days left (boundary included)'],
    ['2026-10-12', 100, 1000, '8 days left -> none'],
    ['2026-10-03', 100, 1000, 'past target -> none'],
    ['2026-10-04', 100, 1000, 'today'],
    ['2026-10-05', 1000, 1000, 'goal met -> none'],
    ['2026-10-05', 100, 0, 'target 0 -> none'],
  ] as Array<[string, number, number, string]>)
    alertCase(`goal ${name}`, {
      savingsGoals: [{ id: 'g1', name: 'Japan Trip', targetDate, current, target }],
    });

  alertCase('all four types present -> emission order', {
    budgets: [{ id: 'b1', category: 'Shopping', limit: 1000, spent: 0 }],
    transactions: [tx({ type: 'expense', category: 'Shopping', amount: 1000, date: '2026-10-02' })],
    subscriptions: [
      {
        id: 's1',
        name: 'Netflix',
        amount: 1500,
        status: 'Active',
        dueDate: '2026-10-04',
        billingCycle: 'Monthly',
        category: 'Entertainment',
      },
    ],
    debts: [{ id: 'd1', debtSource: 'Bank', dueDate: '2026-10-05', status: 'Active', remainingAmount: 5000 }],
    savingsGoals: [{ id: 'g1', name: 'Japan Trip', targetDate: '2026-10-06', current: 100, target: 1000 }],
  });

  // The local shadow formatMoney puts a SPACE after the currency; money.ts does not.
  {
    const s = state({
      subscriptions: [
        {
          id: 's1',
          name: 'Netflix',
          amount: 1200,
          status: 'Active',
          dueDate: '2026-10-04',
          billingCycle: 'Monthly',
          category: 'Entertainment',
        },
      ],
    });
    c.push(
      measure('computeAlerts(currency spacing differs from lib/money formatMoney)', [s, now], () => {
        const alerts = computeAlerts(s, now);
        return { alertsDetail: alerts[0]?.detail, sharedFormatMoney: formatMoney('Rs.', 1200) };
      }),
    );
  }

  alertCase('custom currency', {
    currency: '$',
    subscriptions: [
      {
        id: 's1',
        name: 'Netflix',
        amount: 1200,
        status: 'Active',
        dueDate: '2026-10-04',
        billingCycle: 'Monthly',
        category: 'Entertainment',
      },
    ],
  });

  write('alerts', prov, c);
}

// ===========================================================================
// 9. transaction-service
// ===========================================================================
function unitTransactionService(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  const rows = [
    tx({ id: 't1', title: 'Groceries', category: 'Shopping', type: 'expense', amount: 1200, date: '2026-10-02' }),
    tx({ id: 't2', title: 'Salary', category: 'Salary', type: 'income', amount: 185000, date: '2026-10-01' }),
    tx({
      id: 't3',
      title: 'Card Bill',
      category: 'Bills',
      type: 'debt_payment',
      amount: 5000,
      date: '2026-10-03',
      targetAccountId: 'cc-1',
    }),
    tx({ id: 't4', title: 'ATM', category: 'Cash', type: 'withdrawal', amount: 20000, date: '2026-09-30' }),
    tx({
      id: 't5',
      title: 'In',
      category: 'Transfer In',
      type: 'transfer',
      amount: 700,
      date: '2026-10-04',
      targetAccountId: 'ca-2',
    }),
  ] as never[];

  for (const q of ['', 'salar', 'SALARY', '185', '1E', 'zzz', ' '])
    c.push(
      measure(`getFilteredTransactions(search=${JSON.stringify(q)})`, [q], () =>
        transactionService.getFilteredTransactions(rows, q),
      ),
    );
  c.push(
    measure('getFilteredTransactions(category exact case)', ['shopping'], () =>
      transactionService.getFilteredTransactions(rows, '', 'shopping'),
    ),
  );
  c.push(
    measure('getFilteredTransactions(category correct case)', ['Shopping'], () =>
      transactionService.getFilteredTransactions(rows, '', 'Shopping'),
    ),
  );
  c.push(
    measure('getFilteredTransactions(type=expense)', ['all', 'expense'], () =>
      transactionService.getFilteredTransactions(rows, '', 'all', 'expense'),
    ),
  );
  c.push(
    measure('getFilteredTransactions(account=targetAccountId)', ['cc-1'], () =>
      transactionService.getFilteredTransactions(rows, '', 'all', 'all', 'cc-1'),
    ),
  );
  c.push(
    measure('getFilteredTransactions(account=targetAccountId of transfer)', ['ca-2'], () =>
      transactionService.getFilteredTransactions(rows, '', 'all', 'all', 'ca-2'),
    ),
  );
  c.push(
    measure('getFilteredTransactions(row missing title -> throws)', [], () =>
      transactionService.getFilteredTransactions([tx({ title: undefined })] as never),
    ),
  );
  c.push(
    measure('getFilteredTransactions(row missing category -> throws)', [], () =>
      transactionService.getFilteredTransactions([tx({ category: undefined })] as never),
    ),
  );

  const sortRows = [
    tx({ id: 'a1', date: '2026-10-02', updated_at: '2026-10-02T10:00:00Z' }),
    tx({ id: 'a2', date: '2026-10-02', updated_at: '2026-10-02T10:00:00Z' }),
    tx({ id: 'tx-1-2', date: '2026-10-02', updated_at: '2026-10-02T10:00:00Z' }),
    tx({ id: 'a9b', date: '2026-10-02', updated_at: '2026-10-02T10:00:00Z' }),
    tx({ id: 'ab9', date: '2026-10-02', updated_at: '2026-10-02T10:00:00Z' }),
    tx({ id: 'z1', date: '2026-10-02', updated_at: 'garbage' }),
    tx({ id: 'z2', date: '2026-10-02', updated_at: undefined, createdAt: undefined, date: undefined as never }),
    tx({ id: 'b1', date: '2026-10-05' }),
  ] as never[];
  c.push(
    measure('sortTransactionsByDate(desc) 4-level tiebreak', [], () =>
      transactionService.sortTransactionsByDate(sortRows).map((t) => t.id),
    ),
  );
  c.push(
    measure('sortTransactionsByDate(asc) 4-level tiebreak', [], () =>
      transactionService.sortTransactionsByDate(sortRows, 'asc').map((t) => t.id),
    ),
  );
  c.push(measure('sortTransactionsByDate(empty)', [[]], () => transactionService.sortTransactionsByDate([])));
  c.push(
    measure('sortTransactionsByDate(prefers updated_at over date)', [], () =>
      transactionService
        .sortTransactionsByDate([
          tx({ id: 'p1', date: '2026-01-01', updated_at: '2026-12-01T00:00:00Z' }),
          tx({ id: 'p2', date: '2026-06-01' }),
        ] as never)
        .map((t) => t.id),
    ),
  );
  c.push(
    measure('sortTransactionsByDate(camelCase keys honoured)', [], () =>
      transactionService
        .sortTransactionsByDate([
          tx({ id: 'c1', date: '2026-01-01', updatedAt: '2026-12-01T00:00:00Z' }),
          tx({ id: 'c2', date: '2026-06-01' }),
        ] as never)
        .map((t) => t.id),
    ),
  );

  // getMonthlyTotals reads the wall clock; the pinned now is 2026-10-04T04:30Z.
  for (const [type, name] of [
    ['income', 'income'],
    ['deposit', 'deposit'],
    ['expense', 'expense'],
    ['credit_card_charge', 'credit_card_charge'],
    ['withdrawal', 'withdrawal'],
    ['debt_payment', 'debt_payment (excluded from both)'],
    ['transfer', 'transfer (excluded from both)'],
    ['financing', 'financing (excluded from both)'],
  ] as Array<[string, string]>)
    c.push(
      measure(`getMonthlyTotals(${name})`, [type], () =>
        transactionService.getMonthlyTotals([
          tx({ type: type as never, amount: 0.1, date: '2026-10-02' }),
          tx({ type: type as never, amount: 0.2, id: 'm2', date: '2026-10-03' }),
        ] as never),
      ),
    );
  c.push(measure('getMonthlyTotals(empty)', [[]], () => transactionService.getMonthlyTotals([])));
  c.push(
    measure('getMonthlyTotals(float residue survives (B-04))', [], () =>
      transactionService.getMonthlyTotals([
        tx({ type: 'income', amount: 0.1, date: '2026-10-02' }),
        tx({ type: 'income', amount: 0.2, id: 'f2', date: '2026-10-03' }),
        tx({ type: 'income', amount: 0.3, id: 'f3', date: '2026-10-04' }),
      ] as never),
    ),
  );
  c.push(
    measure('getMonthlyTotals(string amount concatenates)', [], () =>
      transactionService.getMonthlyTotals([tx({ type: 'income', amount: '5' as never, date: '2026-10-02' })] as never),
    ),
  );
  for (const d of ['2026-10-01', '2026-09-30', '2026-10-31', '2026-11-01', '2026-01-01', '2025-10-04', 'garbage', ''])
    c.push(
      measure(`getMonthlyTotals(date ${d || 'empty'})`, [d], () =>
        transactionService.getMonthlyTotals([tx({ type: 'income', amount: 100, date: d })] as never),
      ),
    );
  c.push(
    measure('getMonthlyTotals vs money.ts sumMoney of the same rows', [], () => {
      const list = [
        tx({ type: 'income', amount: 0.1, date: '2026-10-02' }),
        tx({ type: 'income', amount: 0.2, id: 'x2', date: '2026-10-03' }),
      ] as never[];
      return {
        service: transactionService.getMonthlyTotals(list).income,
        viaMoney: sumMoney(list.map((t) => t.amount)),
      };
    }),
  );

  write('transaction-service', prov, c);
}

// ===========================================================================
// 10. csv
// ===========================================================================
function unitCsv(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  for (const [cells, name] of [
    [['a', 'b'], 'plain'],
    [['=SUM(A1)', 'b'], 'leading ='],
    [['+x'], 'leading +'],
    [['-500'], 'leading - (a negative number is treated as a formula)'],
    [['@x'], 'leading @'],
    [['\tx'], 'leading tab'],
    [['\rx'], 'leading CR'],
    [['1+1'], 'operator in the middle is left alone'],
    [['say "hi"'], 'inner quote outside the formula branch'],
    [['=a"b'], 'inner quote INSIDE the formula branch (early return, not escaped)'],
    [['a', '', 'c'], 'empty string cell'],
    [[null, undefined], 'null and undefined'],
    [[NaN, 1e21, -0, 0.1 + 0.2], 'numbers keep JS formatting'],
    // The `String(num)` rule that a Dart port breaks by reaching for `toInt()`: an
    // integral double below 1e21 is written as its shortest digits **zero-padded**, not
    // in exponential form, and 2^53 is already past the point where an integer can be
    // distinguished from its neighbour. Measured because the first Dart version printed a
    // negative number for `1e20` (int64 wrap), which then looked like a formula cell.
    [[1e20, 9007199254740993, 2 ** 53, 1e21, 1e22], 'whole doubles either side of the exponent threshold'],
    [[], 'no cells at all'],
    [['x'.repeat(300)], 'long value'],
  ] as Array<[unknown[], string]>)
    c.push(measure(`escapeCsvRow(${name})`, [cells], () => escapeCsvRow(cells as (string | number)[])));
  write('csv', prov, c);
}

// ===========================================================================
// 11. validators
// ===========================================================================
function unitValidators(prov: ReturnType<typeof resolveProvenance>): void {
  const c: Case[] = [];
  const v = (name: string, schema: never, data: unknown) =>
    measure(`validateData(${name})`, [data], () => {
      // validateData returns { success, data } | { success, error } — there is no
      // `errors` array. `data` is captured too, because Zod defaults/strips keys
      // and the post-parse shape is what the port must reproduce.
      const r = validateData(schema, data);
      return r.success ? { ok: true, parsed: r.data } : { ok: false, error: r.error };
    });

  // The mask the app itself writes (CashCardManagement.tsx:455), so this is a real
  // valid instance. An earlier draft used the QA harness's `4520 **** **** 3776`,
  // which BankCardSchema rejects — that made every "one targeted violation" case
  // below report a second, unintended cardNumber error.
  const okCard = {
    id: 'cd-1',
    cardName: 'Everyday Debit',
    bankName: 'CB',
    cardType: 'Debit',
    currentBalance: 74250,
    cardNumber: '•••• •••• •••• 3776',
    isCanceled: false,
  };
  const okTx = {
    id: 't1',
    title: 'Groceries',
    category: 'Shopping',
    type: 'expense',
    amount: 1200,
    date: '2026-10-02',
    accountId: 'ca-1',
  };

  c.push(v('BankCard valid (bullet mask the app writes)', BankCardSchema as never, okCard));
  // Counter-intuitive but measured: the client regex ACCEPTS a full 16-digit PAN.
  // Only the DB CHECK (20260831000000_pan_masking.sql) refuses to store one.
  c.push(
    v('BankCard raw 16-digit PAN (client accepts; DB rejects)', BankCardSchema as never, {
      ...okCard,
      cardNumber: '4520123456783776',
    }),
  );
  c.push(
    v('BankCard short mask "**** 3776" (first regex alternative, accepted)', BankCardSchema as never, {
      ...okCard,
      cardNumber: '**** 3776',
    }),
  );
  // qa-shot.cjs seeds this shape, and the schema rejects it: the harness writes
  // card rows without going through validateData. Replicated as a golden, not fixed.
  c.push(
    v('BankCard qa-harness mask "4520 **** **** 3776" (rejected)', BankCardSchema as never, {
      ...okCard,
      cardNumber: '4520 **** **** 3776',
    }),
  );
  c.push(
    v('BankCard asterisk mask "**** **** **** 3776"', BankCardSchema as never, {
      ...okCard,
      cardNumber: '**** **** **** 3776',
    }),
  );
  c.push(v('BankCard 15-digit PAN', BankCardSchema as never, { ...okCard, cardNumber: '452012345678377' }));
  c.push(v('BankCard null cardNumber', BankCardSchema as never, { ...okCard, cardNumber: null }));
  c.push(v('BankCard missing id', BankCardSchema as never, { ...okCard, id: undefined }));
  // A required *enum* names its options rather than saying `received undefined`, which is
  // not what the required string two lines above does — the two messages come from
  // different checks in the same "the key was not there" situation.
  c.push(
    v('BankCard missing cardType (required enum names its options)', BankCardSchema as never, {
      ...okCard,
      cardType: undefined,
    }),
  );
  c.push(v('BankCard id empty string', BankCardSchema as never, { ...okCard, id: '' }));
  c.push(v('BankCard unknown cardType', BankCardSchema as never, { ...okCard, cardType: 'Prepaid' }));
  c.push(
    v('BankCard negative debit balance (allowed by schema)', BankCardSchema as never, {
      ...okCard,
      currentBalance: -5,
    }),
  );
  c.push(
    v('BankCard NaN currentBalance (finite() rejects)', BankCardSchema as never, { ...okCard, currentBalance: NaN }),
  );
  c.push(v('BankCard negative limit', BankCardSchema as never, { ...okCard, limit: -1 }));
  c.push(v('BankCard negative apr', BankCardSchema as never, { ...okCard, apr: -1 }));
  c.push(v('BankCard bad dueDate format', BankCardSchema as never, { ...okCard, dueDate: '04-10-2026' }));
  // The date regex is unanchored, so a timestamp passes the shape check.
  c.push(
    v('BankCard dueDate as full timestamp (unanchored regex)', BankCardSchema as never, {
      ...okCard,
      dueDate: '2026-10-07T00:00:00Z',
    }),
  );
  c.push(v('BankCard illegal HTML chars in name', BankCardSchema as never, { ...okCard, cardName: '<script>' }));
  // `.finite()` never gets to speak: Zod 4's number *type* check is `isFinite`, so an
  // Infinity is an invalid number, reported as `received number` — the odd spelling that
  // distinguishes it from NaN, which is `received NaN`. Both messages are the port's.
  c.push(
    v('BankCard Infinity currentBalance (the type check, not finite())', BankCardSchema as never, {
      ...okCard,
      currentBalance: Infinity,
    }),
  );
  // Two failures in one row pin the `'; '` join and the schema-key order of the issues.
  c.push(
    v('BankCard two failures joined in schema key order', BankCardSchema as never, {
      ...okCard,
      id: '',
      cardType: 'Prepaid',
    }),
  );
  // Defaults the port must reproduce: keys absent from the input appear in the output.
  c.push(
    v('BankCard defaults injected (isLimitLocked/isCanceled/cardTheme/isFrozen)', BankCardSchema as never, {
      id: 'cd-2',
      cardName: 'No Flags',
      bankName: 'NB',
      cardType: 'Debit',
      currentBalance: 0,
    }),
  );

  c.push(v('Transaction valid', TransactionSchema as never, okTx));
  c.push(v('Transaction amount 0', TransactionSchema as never, { ...okTx, amount: 0 }));
  c.push(v('Transaction amount negative', TransactionSchema as never, { ...okTx, amount: -100 }));
  c.push(v('Transaction numeric string amount', TransactionSchema as never, { ...okTx, amount: '1200' }));
  c.push(v('Transaction unknown category', TransactionSchema as never, { ...okTx, category: 'Kryptokurrency' }));
  c.push(v('Transaction unknown key present', TransactionSchema as never, { ...okTx, bogus: 1 }));

  c.push(v('CashAccount valid', CashAccountSchema as never, { id: 'a', name: 'Wallet', balance: 100 }));
  c.push(v('CashAccount empty name', CashAccountSchema as never, { id: 'a', name: '', balance: 100 }));
  c.push(
    v('Debt valid', DebtSchema as never, {
      id: 'd',
      debtSource: 'Bank',
      totalAmount: 1000,
      remainingAmount: 500,
      interestRate: 8,
      dueDate: '2026-10-07',
      status: 'Active',
      startDate: '2026-01-01',
    }),
  );
  const okSubscription = {
    id: 's',
    name: 'Netflix',
    amount: 1500,
    billingCycle: 'Monthly',
    category: 'Entertainment',
    status: 'Active',
    dueDate: '2026-10-04',
  };
  c.push(v('Subscription valid', SubscriptionSchema as never, okSubscription));
  // The contrast that makes landmine 11 dangerous: `TransactionSchema.category` is a free
  // `z.string()`, so `Kryptokurrency` above is ACCEPTED, while the same value on a
  // subscription is a closed-enum rejection that spells out all twelve options.
  c.push(
    v('Subscription unknown category (closed enum, unlike Transaction)', SubscriptionSchema as never, {
      id: 's',
      name: 'Netflix',
      amount: 1500,
      billingCycle: 'Monthly',
      category: 'Kryptokurrency',
      dueDate: '2026-10-04',
    }),
  );
  c.push(
    v('Subscription status defaulted', SubscriptionSchema as never, {
      id: 's',
      name: 'Netflix',
      amount: 1500,
      billingCycle: 'Monthly',
      category: 'Entertainment',
      dueDate: '2026-10-04',
    }),
  );

  c.push(
    v('LedgerRestorePayload union: v1 export branch', LedgerRestorePayloadSchema as never, {
      version: 'v1',
      exportedAt: '2026-10-04T00:00:00Z',
      state: { cashAccounts: [], cards: [], transactions: [] },
    }),
  );
  c.push(v('LedgerRestorePayload union: matches neither branch', LedgerRestorePayloadSchema as never, { nope: true }));
  // Which branch matched, and what the parse keeps, is part of the contract — the two
  // cases above only prove the union can refuse.
  c.push(
    v('LedgerRestorePayload union: bare state branch accepted', LedgerRestorePayloadSchema as never, {
      cashAccounts: [],
      cards: [],
      transactions: [],
    }),
  );
  c.push(
    v('LedgerRestorePayload union: v1 envelope branch accepted', LedgerRestorePayloadSchema as never, {
      version: 'EM_BUDGET_SECURE_EX_V1',
      data: { cashAccounts: [], cards: [], transactions: [] },
    }),
  );
  // The three critical collections are required *inside* the bare branch, and a failure
  // there is reported once, at the root, because a union does not say which branch spoke.
  c.push(
    v('LedgerRestorePayload union: bare state branch missing transactions', LedgerRestorePayloadSchema as never, {
      cashAccounts: [],
      cards: [],
    }),
  );
  c.push(
    v(
      'LedgerRestorePayload union: bare state branch with a non-array collection',
      LedgerRestorePayloadSchema as never,
      {
        cashAccounts: '[]',
        cards: [],
        transactions: [],
      },
    ),
  );
  // More than one failing field is covered above, in the BankCard block.

  // The rest of the table is the **default** message catalogue. Every case so far hits a
  // field whose schema supplies its own text, so a port could invent these four and stay
  // green against the rest of the file — `DebtSchema` and `LedgerExportV1Schema` are the
  // only schemas that leave a check messageless, and the restore flow can hand the phone
  // any shape at all.
  const okDebt = {
    id: 'd',
    debtSource: 'Bank',
    totalAmount: 1000,
    remainingAmount: 500,
    dueDate: '2026-10-07',
  };
  c.push(
    v('Debt payment fails two messageless checks (default min and regex, dotted path)', DebtSchema as never, {
      ...okDebt,
      payments: [{ id: 'p', debtId: '', amount: 1, date: 'bad', paidFromId: 'a', paidFromType: 'cash' }],
    }),
  );
  c.push(v('Debt notes over the messageless max', DebtSchema as never, { ...okDebt, notes: 'x'.repeat(501) }));
  c.push(v('Debt payments is not an array', DebtSchema as never, { ...okDebt, payments: 'x' }));
  c.push(
    v('Debt negative remainingAmount (the messageless nonnegative)', DebtSchema as never, {
      ...okDebt,
      remainingAmount: -1,
    }),
  );
  c.push(v('Debt whole payload is null (the issue is at the Root)', DebtSchema as never, null));
  c.push(
    v('Subscription name over the messageless max', SubscriptionSchema as never, {
      ...okSubscription,
      name: 'N'.repeat(61),
    }),
  );
  c.push(
    v('LedgerExportV1 wrong literal', LedgerExportV1Schema as never, {
      version: 'OTHER',
      data: { cashAccounts: [], cards: [], transactions: [] },
    }),
  );
  // Two `_missingMessage` branches that no other case reaches: a required field that is
  // **absent** answers differently from one that is present and wrong. A missing literal
  // produces the same quoted text a wrong literal does, and a missing array says
  // `received undefined` where `Debt payments is not an array` above says `received
  // string`. Without these the port could return a plausible message for a payload that
  // simply forgot the key, and nothing else in the file would notice.
  c.push(
    v('LedgerExportV1 missing version (a required literal absent)', LedgerExportV1Schema as never, {
      data: { cashAccounts: [], cards: [], transactions: [] },
    }),
  );
  c.push(
    v('BareRestore missing cashAccounts (a required array absent)', BareRestoreStateSchema as never, {
      cards: [],
      transactions: [],
    }),
  );
  // `z.array(z.unknown())` keeps the elements exactly as they came, `null` and nested
  // arrays included — the guard that stops a malformed doppelganger payload from wiping
  // state is about the three required collections being arrays, not about their contents.
  c.push(
    v('BareRestore keeps unknown element values', BareRestoreStateSchema as never, {
      cashAccounts: [1, 'a', null, { z: 1 }, [2]],
      cards: [],
      transactions: [],
      budgets: [],
    }),
  );

  write('validators', prov, c);
}

// ===========================================================================
// 12. display-interest — extracted verbatim from the tag, transpiled only
// ===========================================================================
function unitDisplayInterest(prov: ReturnType<typeof resolveProvenance>): void {
  const rel = UNIT_SOURCES['display-interest'];
  const blobText = git(['show', `${prov['display-interest'].commit}:${rel}`]);
  const start = blobText.indexOf('function calculateInterest(');
  if (start < 0) throw new Error(`extraction: calculateInterest not found in ${rel}@${TAG}`);
  const end = blobText.indexOf('\n}', start);
  if (end < 0) throw new Error(`extraction: could not find the end of calculateInterest in ${rel}`);
  const source = blobText.slice(start, end + 2);

  // The security-sensitive part of this script: a source string is compiled and
  // executed. It is confined three ways so "generated code" is never driven by
  // anything but a known-frozen blob from this repo:
  //   1. resolveProvenance already proved `source` came from the pre-flutter blob
  //      whose hash is recorded in LOGIC_SPEC (it aborts otherwise).
  //   2. the extracted text is pinned to one hash and must contain no capability
  //      the app code itself does not use.
  //   3. nothing from outside this file reaches the compiled text.
  const EXTRACT_SHA256 = sha256(source);
  if (
    !/^\bfunction calculateInterest\(/.test(source) ||
    !/return Math\.abs\(balance\) \* dailyRate \* days;/.test(source)
  ) {
    throw new Error(
      `extraction: ${rel} does not match the expected calculateInterest shape; re-check LOGIC_SPEC 12 before generating.`,
    );
  }
  if (/\b(import|require|process|globalThis|Function|eval|fetch|child_process)\b/.test(source)) {
    throw new Error('extraction: unexpected capability in the extracted source; refusing to evaluate it.');
  }

  // Types are erased for syntax only; the body is byte-identical to the tag.
  const js = transformSync(source, { loader: 'ts' }).code.trim();
  const fn = new Function(`${js}; return calculateInterest;`)() as (b: number, a: number, d: number) => number;

  const cases: Array<[number, number, number]> = [
    [-38420, 24.9, 30],
    [-38420, 24.9, 0],
    [-38420, 24.9, -1],
    [-38420, 24.9, -30],
    [38420, 24.9, 30],
    [0, 24.9, 30],
    [-0, 24.9, 30],
    [-1000, 0, 30],
    [-1000, NaN, 30],
    [-1000, undefined as never, 30],
    [NaN, 24.9, 30],
    [-36500, 36.5, 365],
  ];

  const c: Case[] = [];
  for (const [b, a, d] of cases) {
    c.push(measure(`calculateInterest(${fmt(b)},${fmt(a)},${fmt(d)}) [display]`, [b, a, d], () => fn(b, a, d)));
    c.push(
      measure(`pair: engine vs display (${fmt(b)},${fmt(a)},${fmt(d)})`, [b, a, d], () => ({
        displayUnrounded: fn(b, a, d),
        engineRounded: interestForCycle(b, a, d),
        differs: fn(b, a, d) !== interestForCycle(b, a, d),
      })),
    );
  }

  // Recorded so a reviewer can see exactly which bytes were executed.
  const extraction = {
    from: `${prov['display-interest'].commit}:${rel}`,
    charRange: [start, end + 2],
    sha256OfExtractedSource: sha256(source),
    extractedSource: source,
    note: 'module-private in a .tsx; evaluated verbatim after TS type erasure only',
  };
  writeWithExtra('display-interest', prov, c, { extraction });
}

function writeWithExtra(
  unit: string,
  prov: Record<string, { commit: string; file: string; gitBlob: string; sha256: string }>,
  cases: Case[],
  extra: Record<string, unknown>,
): void {
  assertUniqueNames(unit, cases);
  const tmp = path.join(OUT, `${unit}.json`);
  const p = prov[unit];
  const body = {
    _provenance: {
      generatedFrom: TAG,
      sourceCommit: p.commit,
      unitFile: p.file,
      gitBlob: p.gitBlob,
      sha256: p.sha256,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: Intl.NumberFormat().resolvedOptions().locale,
      node: process.version,
      pinnedNow: PINNED_UTC,
      sentinelAlphabet: SENTINELS,
      ...extra,
    },
    cases,
  };
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  console.log(`  ${unit.padEnd(20)} ${String(cases.length).padStart(4)} cases  <- ${p.file}`);
}

// ===========================================================================
// main
// ===========================================================================
/**
 * `npx tsx parity/fixtures/generate.ts --only money` regenerates one file.
 *
 * Every case is measured from the running module, so a subset run is not a partial
 * truth. Nothing in a golden is now machine-volatile: the clock inside every case is
 * `pinnedNow`, and the wall-clock stamp this file used to write into `_provenance` is
 * gone, so a full re-run on unchanged code rewrites thirteen files that `git diff`
 * reports as empty. `--only` survives for the other reason — it skips re-measuring the
 * twelve units you did not touch, which is most of the run's wall-clock time.
 *
 * The two exceptions are deliberate machine facts, not churn: `tz` and `locale` record
 * the zone and default locale the goldens were measured under, which is what makes a
 * golden attributable. A run in another zone changes those two keys and nothing else;
 * `tz-proof.ts` restores the canonical zone when it finishes.
 */
function selectedUnits(): Set<string> {
  const at = process.argv.indexOf('--only');
  if (at < 0) return new Set<string>(UNITS);
  const arg = process.argv[at + 1];
  if (!arg) throw new Error('--only needs a comma-separated unit name');
  const wanted = arg
    .split(',')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
  for (const w of wanted) {
    if (!(UNITS as readonly string[]).includes(w)) {
      throw new Error(`--only: unknown unit "${w}" (one of ${UNITS.join(', ')})`);
    }
  }
  return new Set<string>(wanted);
}

function main(): void {
  console.log(`\nPhase 1 golden generation\n  tag        ${TAG} -> ${git(['rev-list', '-n', '1', TAG])}`);
  console.log(
    `  working    ${git(['rev-parse', 'HEAD'])}${git(['status', '--porcelain']) ? '  (DIRTY)' : '  (clean)'}`,
  );
  console.log(`  timezone   ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log(`  locale     ${Intl.NumberFormat().resolvedOptions().locale}`);
  console.log(`  node       ${process.version}\n`);

  // D7 — this throws before anything is written if a sampled file drifted.
  const prov = resolveProvenance();
  console.log('  provenance OK: every sampled file matches pre-flutter\n');

  mkdirSync(OUT, { recursive: true });
  // Clear zero-byte leftovers from an interrupted run so the validator cannot
  // mistake an empty file for a generated one. Non-empty stale files are simply
  // overwritten below.
  for (const f of UNITS) {
    const stale = path.join(OUT, `${f}.json`);
    if (existsSync(stale) && readFileSync(stale, 'utf8').length === 0) rmSync(stale);
  }

  const picked = selectedUnits();
  const run = (unit: string, fn: () => void): void => {
    if (picked.has(unit)) fn();
  };
  run('money', () => unitMoney(prov));
  run('number-locale', () => unitNumberLocale(prov));
  run('credit-cycles', () => unitCreditCycles(prov));
  run('credit-payments', () => unitCreditPayments(prov));
  run('cycle-rollover', () => unitCycleRollover(prov));
  run('installments', () => unitInstallments(prov));
  run('dates-local', () => unitDatesLocal(prov));
  run('net-worth', () => unitNetWorth(prov));
  run('alerts', () => unitAlerts(prov));
  run('transaction-service', () => unitTransactionService(prov));
  run('csv', () => unitCsv(prov));
  run('validators', () => unitValidators(prov));
  run('display-interest', () => unitDisplayInterest(prov));
  if (picked.size < UNITS.length) {
    console.log(`\n  --only: ${[...picked].join(', ')} — the other ${UNITS.length - picked.size} file(s) untouched`);
  }

  console.log('\ndone.\n');
}

/**
 * CI runs `prettier --check .` over the whole repo, and Prettier disagrees with a
 * plain `JSON.stringify(_, null, 2)` on every short array — so a freshly generated
 * fixture set would fail the build for its formatting rather than its contents.
 * Formatting here is the repo's own config resolved per file, not a style invented
 * in this script.
 */
async function formatFixtures(): Promise<void> {
  const prettier = await import('prettier');
  let n = 0;
  for (const f of readdirSync(OUT).filter((x) => x.endsWith('.json'))) {
    const file = path.join(OUT, f);
    const cfg = await prettier.resolveConfig(file);
    const text = await prettier.format(readFileSync(file, 'utf8'), { ...cfg, parser: 'json', filepath: file });
    writeFileSync(file, text, 'utf8');
    n++;
  }
  console.log(`  formatted ${n} fixture files with the repo Prettier config`);
}

main();
await formatFixtures();
