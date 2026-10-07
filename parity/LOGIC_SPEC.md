# LOGIC_SPEC — what the existing code does

Source of truth: **tag `pre-flutter`** (`41489c6`). Every unit below was read from that tree, and the
generator re-verifies it before emitting (see `INVENTORY.md` §13b, D7).

This spec describes **observed behaviour, including defects**. It is deliberately not a description of
correct behaviour. Where the code is wrong, the golden encodes the wrongness, per rule 5 and your rulings
on B-03/B-04 (Phase 1 gate, D8): _replicate, do not fix_.

Machine-readable contract: the `cases` column of §0 is what `parity/fixtures/validate.ts` enforces. A
fixture file with fewer cases than this table declares **fails the gate**. Counts were set from the case
families in each unit; if a family is dropped the count must be lowered here first, not silently.

Naming: `parity/fixtures/<unit>.json` for each `unit` below.

---

## 0. Units and required case counts

| #   | unit                  | source file (at `pre-flutter`)            | surface                                        | cases   |
| --- | --------------------- | ----------------------------------------- | ---------------------------------------------- | ------- |
| 1   | `money`               | `src/lib/money.ts`                        | 8 functions                                    | 44      |
| 2   | `credit-cycles`       | `src/lib/creditCards.ts`                  | date + tariff arithmetic, no card objects      | 40      |
| 3   | `credit-payments`     | `src/lib/creditCards.ts`                  | window/payment matching over transactions      | 20      |
| 4   | `cycle-rollover`      | `src/lib/creditCards.ts`                  | `runCycleRollover` end-to-end                  | 14      |
| 5   | `installments`        | `src/lib/installments.ts`                 | fee, schedule, eligibility, progress           | 30      |
| 6   | `dates-local`         | `src/utils.ts`                            | local-midnight regime: 4 exported helpers      | 28      |
| 7   | `net-worth`           | `src/utils.ts`                            | `calculateNetWorth` + 5 row-level helpers      | 22      |
| 8   | `alerts`              | `src/lib/alerts.ts`                       | `daysRemaining`, `computeAlerts`               | 18      |
| 9   | `transaction-service` | `src/services/transactionService.ts`      | filter, sort, **float** monthly totals         | 24      |
| 10  | `csv`                 | `src/lib/download.ts`                     | `escapeCsvRow` + formula-injection sanitize    | 12      |
| 11  | `validators`          | `src/validators/index.ts`                 | Zod accept/reject tables                       | 16      |
| 12  | `display-interest`    | `src/components/CreditCardManagement.tsx` | the **unrounded** UI interest, `:67-71` (B-03) | 10      |
| 13  | `number-locale`       | `src/lib/money.ts`                        | `formatMoney` under eight explicit locales     | 232     |
|     |                       |                                           | **total**                                      | **510** |

### Fixture envelope (all files)

```jsonc
{
  "_provenance": {
    "generatedFrom": "pre-flutter",
    "sourceCommit": "<sha of pre-flutter at generation time>",
    "unitFile": "src/lib/money.ts",
    "gitBlob": "<git blob id of that file>",
    "sha256": "<sha256 of file bytes>",
    "tz": "<IANA zone the generator ran in>",
    "locale": "<resolved default locale>",
    "node": "<process.version>"
  },
  "cases": [ { "name": "...", "input": ..., "expected": ... } ]
}
```

`expected` is **always** the value the original code returned. Never typed by hand. JSON cannot hold
`NaN`, `±Infinity`, `-0` or `undefined`, and a sentinel _string_ would be indistinguishable from real
string data, so each becomes a single-key object: `{"__sentinel__": "NaN"}`, `"Infinity"`, `"-Infinity"`,
`"-0"`, `"undefined"` (an `undefined` argument in the input position) and `"undefined-result"` (a call that
returned nothing). A thrown error is `{"__throws__": "Name: message"}`. The alphabet is **closed** —
`validate.ts` rejects any other sentinel, any `__sentinel__`/`__throws__` sharing an object with another
key, and any collision of case names, because a name-keyed Dart test suite silently drops the second case.

Generation produced **963** cases against these **510** minimums; the surplus is the input families above.
(`money` grew from 130 to 200 when its port was built, so that a case exists for every rounding rule the
two formatters follow. `number-locale` is the exception to the surplus: its 232 cases are exactly the
8 × 29 matrix of §13, so dropping any cell fails the gate.)

---

## 1. `money` — integer-cent core

`src/lib/money.ts`. The whole app's money identity lives here: everything is rounded to cents **on input**,
operated on as integers, and divided by 100 **on output**.

### `toMinorUnits(amount: number | string | null | undefined): number`

- `null` / `undefined` → `0`. Strings go through `parseFloat`, which is **lenient**: `"12abc"` → `1200`,
  `"  7.5 "` → `750`, `"1e3"` → `100000`, `"0x10"` → `0`.
- `NaN` → `0`. **`Infinity` is not caught** (the guard is `isNaN`, not `isFinite`) → `Math.round(Infinity)`
  → `Infinity`.
- Rounding is `Math.round`, which breaks ties **upward, i.e. toward +∞**. Dart's `.round()` breaks ties
  _away from zero_, so the two disagree on negative halves — and a half-dollar amount like `-2.5` is
  irrelevant here because `-2.5 * 100 = -250` is already an integer. The cases that actually diverge are
  **half-cents**: `toMinorUnits(-0.005)` → `Math.round(-0.5)` → **`-0`** (a real negative zero, golden-encoded
  as a sentinel) where Dart gives `(-0.5).round()` → `-1`; `toMinorUnits(-0.125)` → `Math.round(-12.5)` →
  `-12` where Dart gives `-13`. The Dart port must implement the JS rule explicitly.
- Binary float artefacts are intended to be absorbed here: `19.99 * 100 = 1998.999...` → `1999`.

### `toMajorUnits(cents: number | null | undefined): string`

- `null` / `undefined` / `NaN` → `"0.00"`. Otherwise `(cents / 100).toFixed(2)`.
- Non-integers pass through `toFixed` (so `1234.5` cents → `"12.35"`, **rounding again**). This second
  rounding is not `Math.round` and the two need not agree; the goldens pin `0.5` cents → `"0.01"`, `-0.5`
  cents → `"-0.01"`, `1234.4` → `"12.34"`, `1234.5` → `"12.35"`. A Dart port that pre-rounds with `Math.round`
  semantics and then formats can differ from the web, so port `toFixed` or reproduce these four exactly.
- `Infinity` → `"Infinity"` (not `"0.00"`). `-0` → `"0.00"` — `toFixed` drops the sign of negative zero, so
  unlike `toMinorUnits` this function cannot reveal it.

### `addMoney` / `subtractMoney` / `sumMoney` / `compareMoney` / `multiplyMoney`

- Each converts operands to cents, adds/subtracts, then `/ 100`. So `addMoney(0.1, 0.2)` is exactly `0.3`.
- **Output is a float**, so the result of one operation is safe to feed to another only because the next
  call re-rounds on input.
- `sumMoney([])` → `0`. `compareMoney` returns a **cent difference**, not `-1/0/1` — so it cannot be used
  as a Dart `Comparable` return without normalising.
- `multiplyMoney(a, f)` = `round(toMinorUnits(a) * f) / 100`. The factor is **not** rounded, so
  `multiplyMoney(10, 1/3)` → `3.33`. `f = Infinity` → `Infinity`.
- Side effects: none. Errors: never throws on the above; throws only if `amounts` is not an array.

### `formatMoney(currency, amount, options?)`

- Signature `formatMoney('Rs.', -500)` → **`"Rs.500"`** — the sign is dropped unless `signed: true`.
  Direction is carried by colour in this app, never by a glyph. Porting this to a signed format changes UI.
- With `signed: true` the result is **`"-Rs.500"`**: the minus precedes the currency symbol and there is no
  space anywhere. `intl`'s `NumberFormat` places the sign by CLDR pattern rules, which put it _after_ the
  symbol for many locales — so the Dart port must build this string itself, not format a negative number.
- `''` as the currency yields `"500"`, and `1e21` renders `"Rs.1,000,000,000,000,000,000,000"` (the grouping
  is `toLocaleString`, not `String`).
- `Math.min(minFractionDigits, maxFractionDigits)` — a min above max is silently clamped to max.
- Non-finite `amount` → treated as `0` (`Number.isFinite` guard, stricter than the other functions).
- **Grouping is locale-dependent**: it calls `toLocaleString(undefined, …)` with `undefined` locale, so the
  separator, grouping runs and digits come from the runtime default. The generator records that default in
  provenance, and the port **inherits the phone's locale the same way** — the rule is "same ambient locale",
  not "same output everywhere". `money.json` was measured under `en-US`, so the Dart suite _injects_ `en-US`
  when replaying it and no other path is pinned. §13 is the unit that covers the other locales.
- `-0` with `signed: true`: `-0 < 0` is **false**, so no minus sign is emitted.

**Case families:** null/undefined/NaN/Infinity/-0 × each function; half-way negatives; lenient string parse;
empty and single-element arrays; factor extremes; every `formatMoney` option combination; a locale-sensitive
grouping case.

---

## 2. `credit-cycles` — Sampath arithmetic

`src/lib/creditCards.ts`. **Date regime: pure arithmetic, no `Date` local timezone.** Dates are
`YYYY-MM-DD` **strings** compared with `>=`/`<=`, and only `Date.UTC` is used for day counts. Do not
"unify" this with §6 — they are deliberately different (§5 landmine 1 in `INVENTORY.md`).

- `DEDUCTION_DAY = 15` — authoritative. The **due date is the 7th**, the deduction date is the 15th of the
  month containing it. `deductionDate('2026-09-07')` and `deductionDate('2026-09-15')` both → `2026-09-15`.
- `parseDateParts` (private) accepts **exactly** `^\d{4}-\d{2}-\d{2}$` and rejects month `0/13` and day `0/32`,
  but **accepts impossible calendar days** such as `2026-02-30` (only range-checked, not validated per month).
  Every public function returns its **input unchanged** on a null parse — including `''`, `'2026-9-5'`
  (unpadded) and full timestamps.
- `advanceDueDate` / `cycleWindowStart` clamp to the target month's last day. **Clamping is one-way and
  forgets the anniversary**: `2026-01-31` → `2026-02-28` → `2026-03-28`. B-05, replicate.
- These differ from `addMonthsClamped` (§6) in input tolerance: `advanceDueDate('2026-01-31T10:00:00Z')`
  returns the timestamp **unchanged**, while `addMonthsClamped` parses it and returns a day key.
- `computeMinimumPayment(balance, limit?)`:
  - `balance >= 0` → `0`. So a credit (positive) balance yields no minimum.
  - under limit → `5% · |balance|`; over limit → `5% · limit + (|balance| − limit)`. `|balance| == limit`
    is **not** over, so it takes the 5% branch.
  - `Math.round(x·100)/100`, then **`Math.max(·, 250)` floor** — a Rs.1,000 debt still reports Rs.250.
  - `limit` falsy/`0`/negative disables the over-limit branch.
  - **`balance = NaN` → returns `NaN`**: `NaN >= 0` is false, so it proceeds, and `Math.max(NaN, 250)` is
    `NaN`. Replicate; do not clamp.
- `interestForCycle(balance, aprPercent, days)` → `0` unless `balance < 0` **and** `aprPercent > 0` **and**
  `days > 0`. Note `!(aprPercent > 0)` makes `NaN`/`undefined` return `0`. Rounds to 2 dp.
- `latePaymentFee(minPayment?)` → `0` when falsy or `<= 0`, else `max(1200, 5% · min)`, rounded.
- `daysBetween(start, end)` → whole days via `Date.UTC`, **end exclusive**; `0` if either side is unparseable.
- `cycleAnchor(card)` → `statementCloseDate || dueDate || ''` — the cut-off date wins outright.
- Side effects: none. These functions never mutate the card.

**Case families:** every month length × the 29th/30th/31st; leap (`2028-02-29`) and non-leap (`2100`,
century rule); Jan→Dec wrap; malformed and unpadded dates; `deductionDate` for days 1–31; minimum-payment
at/under/over limit, the Rs.250 floor, half-cent rounding, NaN; interest day guards at `0`/`-1`; fee
threshold where `5% · min` crosses Rs.1,200.

---

## 3. `credit-payments` — the billing window

Same file, but these take `Transaction[]`, so behaviour depends on stored shapes.

- `paymentsInCycle(transactions, cardId, dueDate, anchorDate?)`:
  - `''`/missing `dueDate` → `0`.
  - window is `[cycleWindowStart(anchor), dueDate]` compared **as strings**, inclusive at both ends. The
    due date is the last day of the cycle, so a payment on it counts.
  - Matches `type === 'debt_payment'` **and** `targetAccountId === cardId` **and**
    `targetAccountType === 'card'`. Deliberately not by title (rename-safe).
  - Sums via `sumMoney`, so an unparseable amount contributes `0` rather than poisoning the total.
  - **String comparison means an unpadded date (`'2026-9-05'`) sorts wrongly and silently drops or admits a
    payment.** Replicate; this is how the web behaves today.
  - `transactions || []` guards a null list; individual rows are not null-guarded.
- `hasDeductionPayment` (private) requires `t.date === cycleEnd` **exactly** and `t.amount > 0` — the bank's
  automatic debit on the 15th, which satisfies the minimum regardless of the manual window.
- `isMinimumSatisfied(card, transactions)`:
  - `false` when the card has no `dueDate`, or no `minPayment`, or `minPayment <= 0`.
  - otherwise true if the 15th-dated deduction exists **or** window payments `>= card.minPayment`.
  - `minPayment` is compared raw (not re-derived from `computeMinimumPayment`).
- `maybeRollCard(card, _transactions, amount)` — **`_transactions` is accepted and entirely ignored.**
  - no `dueDate` → `{}`.
  - `addMoney(card.currentBalance, amount) >= 0` → `{ dueDate: undefined, minPayment: undefined }`
    (note: real `undefined` values, not key absence, so a Dart map port must preserve "key present, value
    null"). Otherwise `{}`.
  - A fully settled card's cycle is cleared rather than advanced — advancing happens only in §4.

**Case families:** payment on window start / end / the day after / the day before; the 8th–14th gap (inside
the month but outside the window); exactly the 15th; unpadded date; wrong `targetAccountType`; wrong card id;
`transfer` type instead of `debt_payment`; zero and negative amount on the 15th; `minPayment` 0/undefined/NaN.

---

## 4. `cycle-rollover` — the one function that changes money

`runCycleRollover(card, transactions, today)` — returns `undefined` or
`{ currentBalance, dueDate?, minPayment?, charges }`.

Order of operations, as the code performs them:

1. no `card.dueDate` → `undefined`.
2. `cycleEnd = deductionDate(card.dueDate)`; **`today < cycleEnd` (string compare) → `undefined`** — the
   cycle is still open, and no charge may be recorded before the 15th.
3. `anchor = cycleAnchor(card) || cycleEnd`.
4. `outstanding = currentBalance < 0 ? |currentBalance| : 0`.
5. `minOk` = no `minPayment` **or** `minPayment <= 0` **or** window payments cover it **or** a 15th-dated
   deduction exists.
6. `cycleDays = daysBetween(cycleWindowStart(anchor), anchor)`.
7. `interest = interestForCycle(card.currentBalance, card.apr ?? 0, cycleDays)` — computed on the
   **pre-charge** balance, and charged **only if `outstanding > 0 && interest > 0`**.
   - The charge `description` interpolates `card.apr` **raw**, so with `apr` unset the text reads
     `"undefined% p.a. …"` even though the amount is `0`. Replicate.
8. late fee requires `!minOk && outstanding > 0 && minPayment !== undefined`. **An absent `minPayment` never
   earns a late fee**, even when nothing was paid. `description` uses `minPayment.toLocaleString()` with no
   locale argument → locale-dependent grouping in a stored string.
9. `chargeTotal = sumMoney(charges)`, `newBalance = subtractMoney(currentBalance, chargeTotal)`.
10. `newBalance >= 0` → `{ currentBalance: newBalance, dueDate: undefined, minPayment: undefined, charges }`.
11. else → `{ currentBalance, dueDate: advanceDueDate(card.dueDate), minPayment:
computeMinimumPayment(newBalance, card.limit), charges }`.
    - **The next due date advances from the card's own due date (the 7th), never from the 15th** — advancing
      from `cycleEnd` would silently migrate every deadline to the 15th.
    - `minPayment` is recomputed on the **post-charge** balance.

- Charges carry `appliedDate = cycleEnd` (the 15th), not `today`.
- **Callers must deduplicate by card + deduction date.** The function itself is idempotent-free: calling it
  twice doubles the interest. Any Phase 6 port inherits this, and the on-open catch-up (D3) must replay
  missed cycles exactly once.
- Side effects: none — it returns a draft; persistence is the caller's.

**Case families:** today 1 day before cycleEnd; exactly cycleEnd; day after; statementCloseDate present and
absent; carried balance with and without APR; paid-in-full mid-cycle; minimum unpaid with `minPayment` set
vs unset; over-limit card; a cycle whose charges settle the balance to exactly 0; leap-year February cycle;
a Jan→Dec boundary; zero balance with a due date (clears dates with no charges).

---

## 5. `installments` — ESP plans

`src/lib/installments.ts`. Imports `addMonthsClamped` from `utils` (§6), so **schedule dates follow the
local-midnight regime, not the UTC arithmetic of §2** — the same plan and the same card can disagree about
a month end depending on which engine produced the date. Replicate both.

- `SAMPATH_ESP_FEES = { 6: 0, 12: 7.5, 24: 15, 48: 30 }`.
- `calculateInstallmentFee(amount, tenureMonths)` — `SAMPATH_ESP_FEES[tenure] || 0`, so **any unlisted tenure
  (18, 36, 9) gets a 0% fee silently**, and a `0` fee for tenure 6 is indistinguishable from an unknown
  tenure. `round((amount · pct / 100) · 100)/100`.
- `calculateMonthlyPayment(amount, tenure)` = `round((amount/tenure)·100)/100`. **`tenure = 0` →
  `Infinity`**, no guard.
- `generateInstallmentSchedule(id, monthlyPayment, tenure, startDate, originalAmount?)`:
  - `baseCents = round(monthlyPayment · 100)`.
  - `targetTotalCents = round((originalAmount ?? monthlyPayment · tenure) · 100)`.
  - last row absorbs the remainder **only if `absorbed > 0`** — a remainder of `0` or negative leaves the
    base amount in place, so the schedule can **fail to tile the principal** when `originalAmount` is
    smaller than `(tenure−1) · monthlyPayment`.
  - `dueDate = addMonthsClamped(startDate, i)` — **`i` starts at 1**, so the first payment is one month
    after `startDate`, never on it.
  - `status: 'pending'`, `amountPaid: 0`, no `id`.
  - `tenure <= 0` → `[]`.
- `isCardEligibleForInstallment(card, purchaseAmount)` — ordered gates, first failure wins:
  not Credit → cancelled → frozen → `< 5000` → over-limit (message uses
  `(outstanding − limit).toFixed(2)`) → `available = (limit||0) + currentBalance` and `purchase > available`.
  - `outstanding` is `|currentBalance|` **only when `currentBalance < 0`**, else `0`.
  - Minimum is `5000`, and `<` is strict, so exactly 5000 passes.
- `getInstallmentProgress(installment, payments)` filters by `installment.id`, sorts by `paymentNumber`,
  `percentage = round(paid/total · 100)` and `0` when `total === 0`; `nextDue` is the first `pending`
  `dueDate` **or `null`**. A payment from another installment is ignored entirely.
- `formatFeeBreakdown(amount, tenure)` — `totalCost = amount + processingFee` is a **plain float add**
  (not `addMoney`), so it is a second B-04-style site. `feePercent` re-reads the map.

**Case families:** all four tenures plus an unlisted tenure; `tenure` 0; amounts that do not tile
(10000/12, 100/3); explicit `originalAmount` smaller and larger than the derived total; start dates on the
31st (Feb clamp), leap Feb 29; debit/cancelled/frozen cards; 5000 boundary; exactly-at-limit and over-limit;
progress with 0 payments, all paid, none paid, foreign rows mixed in.

---

## 6. `dates-local` — the second, deliberately different date regime

`src/utils.ts`. **Local-timezone, and `Date.parse` is explicitly rejected for bare days** because
`new Date('2026-10-04')` is UTC midnight, which is the previous evening for a UTC+5:30 reader.

- `localDayKey(d)` → `getFullYear()`/`getMonth()+1`/`getDate()`, zero-padded. **Months are 0-indexed in JS
  and the `+1` is load-bearing.** Invalid `Date` → `"NaN-NaN-NaN"`, and the function does not throw.
- `dayStartMs(value)` (private) — a `YYYY-MM-DD` **prefix** regex (`^(\d{4})-(\d{2})-(\d{2})`, note: no end
  anchor) is built as **local midnight**; otherwise it falls back to `Date.parse` and then
  `setHours(0,0,0,0)`. Returns `null` only when the fallback is unparseable.
  - Because the regex is unanchored at the end, `'2026-10-04T18:30:00Z'` takes the **local-midnight** path,
    silently discarding the time and its timezone.
  - Day parts are not range-validated here: `'2026-13-45'` becomes local `2027-02-14` by `Date` overflow.
- `isInCurrentMonth(iso, nowMs)` — false for falsy input or unparseable; else compares local year **and**
  month. Replaces the old `date.includes('-10-')` bug, which matched October of every year.
- `isAlertDayRecent(iso, nowMs)` — `day <= today && today - day <= 86400000`, i.e. today or yesterday.
  Future-dated → false. Uses raw ms arithmetic, so a DST day is 23 or 25 hours (Asia/Colombo has no DST,
  but the port must not silently depend on that).
- `addMonthsClamped(iso, months)` — negative months work; unparseable returns input unchanged; the clamp is
  **one-way and forgets the anniversary** (B-05).
- **Zone-stability proof — run and passed.** `npx tsx parity/fixtures/tz-proof.ts` regenerates the whole set
  in a fresh child process under `Asia/Colombo` (the committed zone), `America/New_York` (west of Greenwich)
  and `Pacific/Kiritimati` (UTC+14), then restores the canonical zone and re-validates. A shell `TZ=` prefix
  does **not** reach the child on this platform, so the tool sets `env` explicitly — an earlier proof done by
  hand reported "0 divergences" precisely because the zone never changed.
  **5 of 731 cases are zone-sensitive**, and every one of them is a landmine rather than noise. Re-run at
  the Phase 4 `money` gate: the 70 new `money` cases are all zone-stable, so the five below are unchanged.

  | Case                                  | Colombo      | New York                               |
  | ------------------------------------- | ------------ | -------------------------------------- |
  | `localDayKey('2026-10-04T18:30:00Z')` | `2026-10-05` | `2026-10-04`                           |
  | `localDayKey('2026-01-01T00:00:00Z')` | `2026-01-01` | `2025-12-31`                           |
  | `localDayKey('2026-12-31T23:59:59Z')` | `2027-01-01` | `2026-12-31`                           |
  | `getMonthlyTotals(date 2026-10-01)`   | income `100` | income `0` — it lands in **September** |
  | `getMonthlyTotals(date 2026-11-01)`   | income `0`   | income `100` — it lands in **October** |

  The other 656 are stable, which is the useful half of the answer: the UTC-arithmetic units (§2–§4) do not
  move at all, exactly as designed. The Dart test harness must pin its zone to `Asia/Colombo` or mark these
  five as zone-parameterised; it must not assume the whole suite is zone-free.

**Case families:** each helper × {bare day, timestamp with Z, timestamp with offset, malformed, empty,
out-of-range parts}; month boundaries at local 23:59 and 00:00; today/yesterday/tomorrow/31-days-ago;
`addMonthsClamped` by −13, −1, 0, 1, 12, 25 from the 29th/30th/31st and from Feb 28/29 in leap and
non-leap years.

---

## 7. `net-worth` — aggregates and row effects

`src/utils.ts`.

- `calculateNetWorth(state: Partial<AppState>)` — **every collection defaults to `[]`**, so a partial state
  is legal and yields zeros. Components: `cash`, `debitCards`, `creditCardAssets`, `creditCardLiabilities`,
  `savings`, `debts`, `loansGiven`, `netWorth`.
  - `debitCards` = `sumMoney(currentBalance − (Number(lockedAmount) || 0))` over **non-cancelled Debit**
    cards. `lockedAmount` as a numeric _string_ is honoured; `null`/`undefined`/`'abc'` → `0`.
  - Credit cards split by sign: `currentBalance < 0` → liability (absolute), `> 0` → asset.
    **`currentBalance === 0` belongs to neither**, so it appears nowhere in the breakdown.
  - `savings` = `g.current || 0` — so a jar at `0` and a jar with `undefined` are identical.
  - `loansGiven` uses `remainingAmount` **unless it is `undefined`**, falling back to `totalAmount`; an
    explicit `null` does **not** fall back and reaches `toMinorUnits(null)` → `0`.
  - `netWorth` = `cash + debitCards + creditCardAssets + savings + loansGiven − creditCardLiabilities − debts`,
    summed through `sumMoney` (one pass, cent-rounded).
  - Cancelled cards are excluded from **both** debit and credit sides.
- `ledgerBalanceEffect(type, category, amount)` — magnitude is `Math.abs(Number(amount) || 0)`, so a
  non-numeric string → `0`.
  - `+` for `income | deposit | financing`; `−` for `expense | debt_payment | withdrawal |
credit_card_charge`; `transfer` → `+` **only when `category === 'Transfer In'` exactly**, anything else
    (including `'transfer in'`, `undefined`) is the out leg. Unknown type → `0`.
- `applyGoalAllocation(goalCurrent, walletBalance, amount)` — `committed = max(−jarCents, requestedCents)/100`,
  i.e. a withdrawal cannot exceed the jar; `committed === 0` → **`null`** (nothing moved). `wallet` uses
  `subtractMoney`, so a negative `amount` (a top-up) _increases_ the wallet.
- `applyRepayment(outstanding, requested)` — both sides clamped `Math.max(0, Number(x) || 0)`;
  `applied = min(asked, owed)`; `remaining = subtractMoney(owed, applied)`. Over-paying settles at zero and
  the surplus **vanishes by design** (see the doc-comment: the old behaviour invented or destroyed it).
- `isSpendingRow(t)` = `t.type === 'expense' && t.amount > 0`. A `withdrawal` is **not** budget spending.
- `budgetSpendingForMonth(category, transactions, subscriptions, nowMs)` — category matched
  `toLowerCase().trim()` on both sides; transactions must also be `isInCurrentMonth`; **every Active
  subscription in the category counts in full regardless of date** (a monthly and an annual sub are charged
  identically). `spent` is `sumMoney` over both lists; `items` are transactions first, then subscriptions,
  with `t.title || 'Transaction spend'` and `` `${s.name} (Subscription)` ``.
- Side effects: none of these touch storage. Errors: they assume iterable collections; `transactions` is not
  null-guarded in `budgetSpendingForMonth` (only `state.transactions || []` at the caller).

**Case families:** empty state; each collection absent vs empty; a cancelled credit card with debt; `0`
balance card; locked amount as string/null/NaN; jar at 0/undefined; loan with `remainingAmount` undefined vs
null vs 0; `ledgerBalanceEffect` over every type plus an unknown one, and `'Transfer In'` vs `'transfer in'`;
goal allocation at exactly the jar balance, over it, and zero; repayment over-payment; budget with
mixed-case categories, an Active annual subscription, and an expense dated last month.

---

## 8. `alerts` — the threshold engine

`src/lib/alerts.ts`. Depends on `budgetSpendingForMonth` (§7), so it inherits the local date regime.

- `parseDay` (private) — anchored `^…$` regex (unlike §6's unanchored one), local midnight; falls back to
  `Date.parse`; **returns `-1` for unparseable**, and `daysUntil` maps `t < 0` to **`Infinity`**. So a
  malformed date is "infinitely far away" rather than an error.
- `daysRemaining(dateStr, todayMs)` = `Math.ceil((target − today)/86400000)`. `ceil` means **any intra-day
  offset counts as a whole day**, and negative deltas round toward zero — a bill due yesterday is `-1`.
- `computeAlerts(state, todayMs)`, in emission order (port must preserve it):
  1. **budget** — skipped when `b.limit <= 0`. `pct = spent / limit`. `>= 1.0` → `critical`
     `budget-over-<id>`; else `>= 0.8` → `warning` `budget-close-<id>`. `detail` embeds
     `Math.round(pct·100)`%.
  2. **bill** — only `status === 'Active'` with a `dueDate`; `0 <= d <= 1`. `d === 0` → `critical`
     `"X due today"`, `d === 1` → `warning` `"X due in 1 day"` (plural `s` only when `d > 1`).
  3. **debt** — skips `'Fully Repaid'`, needs `dueDate`, `0 <= d <= 1` **and** `remainingAmount > 0`.
     Title `Debt from <debtSource> due …`.
  4. **goal** — needs `targetDate`, `target > 0`, `current < target`, and `d >= 0 && d <= 7`; severity always
     `info`; title `Goal "<name>" closes soon`.
- `formatMoney` here is a **local shadow** with a different contract from §1's export: `` `${currency}
${…}` `` — **a space after the currency** (the shared one has none) and `maximumFractionDigits: 2` with
  **no** minimum, so `1200` renders `"Rs. 1,200"` not `"Rs.1,200.00"`. Three `formatMoney`s exist
  (§5 landmine 5); this is one of them and the Dart port must not collapse them.
- `state.currency || 'Rs.'`. `budgets`/`subscriptions`/`debts`/`savingsGoals`/`transactions` are all
  `|| []` guarded except `transactions` (passed as `state.transactions || []`).
- Threshold boundaries are float divisions: `spent/limit === 0.8` exactly is reachable, and
  `Math.round(pct·100)` at `.5` follows the JS half-up rule.

**Case families:** pct at 0.799/0.8/0.999/1.0/1.5; limit 0 and negative; `d` at −1/0/1/2/7/8 for bills,
debts and goals; cancelled/inactive subscription; debt `'Fully Repaid'` and `remainingAmount` 0; goal with
`current >= target`; malformed `dueDate` → no alert; the currency-spacing assertion; a state with all four
alert types present, to pin emission order.

---

## 9. `transaction-service` — filters, sort, and the float totals

`src/services/transactionService.ts`. **No test file exists for this module**, so these goldens are its
first coverage.

- `getFilteredTransactions(transactions, searchQuery='', categoryFilter='all', typeFilter='all',
accountFilter='all')`:
  - search matches `title` **or** `category` (both lowercased, `includes`) **or** `amount.toString().includes
(searchQuery)` — the amount is compared against the **raw, non-lowercased** query, so `"1E"` never matches
    `1.5`. `''` short-circuits to match-all.
  - **`tx.title.toLowerCase()` and `tx.category.toLowerCase()` are unguarded** — a row missing `title`
    throws `TypeError`. The golden records the throw, not a value.
  - account matches `accountId` **or** `targetAccountId`; category/type are exact `===` (case-sensitive).
  - Returns the same object references, in input order (no copy, no sort).
- `sortTransactionsByDate(transactions, order='desc')` — copies, then a 4-level comparator:
  1. `updated_at || updatedAt || created_at || createdAt || date` → `new Date(raw).getTime()`,
     **`NaN` → `0`**, falsy → `0`. So an unparseable timestamp sorts as the epoch.
  2. `(b.date || '').localeCompare(a.date || '')` — **locale collation, not code-point**, and inverted for
     `asc`.
  3. `parseInt(id.replace(/\D/g,''), 10)` — **all digits concatenated**, so `'tx-1-2'` → `12` and
     `'a9b'` vs `'ab9'` tie; used only when both sides parse.
  4. `localeCompare` on `id`.
  - The comparator is total, so JS sort stability is not load-bearing here — but a Dart port that drops any
    level changes ties. `asc` negates levels 1, 2 and 3 explicitly.
- `getMonthlyTotals(transactions)` — **B-04, replicate exactly**:
  - month/year from `new Date()` **at call time** → non-deterministic. The generator pins this by running in
    a subprocess with a faked clock, and records the effective month in provenance; a golden is only valid
    for a stated "now".
  - filter uses `new Date(tx.date)`: a bare `'YYYY-MM-01'` is parsed as **UTC midnight** and then read with
    **local** accessors, so in a zone west of Greenwich the first of a month falls into the **previous**
    month. `INVENTORY.md` §5 landmine 10.
  - `income` = `reduce(acc + tx.amount)` over `income | deposit`; `expense` = same over
    `expense | credit_card_charge | withdrawal`. **`debt_payment`, `transfer` and `financing` are excluded
    from both.**
  - `reduce` is **naive float addition, bypassing `money.ts`** — so `0.1 + 0.2`-class residue survives into
    the reported total. `netCashFlow = income - expense`, also float.
  - If `tx.amount` is a string, `0 + "5"` **concatenates** to `"05"`, and the return type silently becomes
    a string. Replicate.
  - Empty list → `{ income: 0, expense: 0, netCashFlow: 0 }`.

**Case families:** search against title/category/amount/case-mismatch/empty; a row missing `title` (throws);
category and type case sensitivity; account id vs target id; sort ties at each of the 4 levels, `asc` and
`desc`, an unparseable timestamp, digit-concatenating ids, an empty list; totals for each of the 7 types,
the month-boundary timestamps (`YYYY-MM-01`, `YYYY-MM-last`, cross-year), float residue (`0.1+0.2`), a
string amount, and the pinned-clock month.

---

## 10. `csv` — export escaping

`src/lib/download.ts`. Only `escapeCsvRow` is pure; `downloadBlob` touches `document`/`URL` and is a Phase 7
native-integration item, not a fixture target.

- `sanitizeCsvCell` (private) prefixes a **single quote** when the value starts with
  `/^[=+\-@\t\r]/` — so `-500` becomes `'-500` (a negative number is treated as a formula), and the check is
  on the **first character only**, so `"1+1"` is left alone.
- Otherwise it escapes `"` → `""`. **Order matters:** the formula branch returns early and does **not**
  double-quote-escape its interior, so `'=a"b` keeps the raw `"`.
- `escapeCsvRow(cells)` wraps every cell in `"…"` and joins with `,`. `String(value)` means `null` →
  `"null"`, `undefined` → `"undefined"`, `NaN` → `"NaN"`, and a number keeps JS formatting (`1e21` →
  `"1e+21"`).
- No newline is emitted; callers join rows themselves.

**Case families:** `=`, `+`, `-`, `@`, tab, CR starts; a `"` inside and outside the formula branch; `null`,
`undefined`, `NaN`, large/small numbers, an empty string, an empty cell list, a negative amount as text.

---

## 11. `validators` — Zod accept/reject tables

`src/validators/index.ts` (Zod 4). `validateData(schema, data)` is the fixture surface; each schema gets a
small accept/reject table rather than a prose spec, because the contract is the error list.

- `CashAccountSchema`, `BankCardSchema`, `TransactionSchema`, `DebtSchema`, `SubscriptionSchema`,
  `BareRestoreStateSchema`, `LedgerExportV1Schema`, `LedgerRestorePayloadSchema` (a **union** — which branch
  matched is part of the contract), plus the amount-positive refinements. All eight exist at the tag.
- **There is no exported `PAN_MASK_PATTERN`** — the PAN rule is an inline regex on
  `BankCardSchema.cardNumber`: `/^(\*\*\*\* \d{4}|[•*]{4} [•*]{4} [•*]{4} \d{4}|\d{16})$/`, and the field is
  `.optional()`. Three measured facts the port must keep, all in `validators.json`:
  - a **raw 16-digit PAN is accepted by the client** (B-13). Only the DB CHECK in
    `20260831000000_pan_masking.sql` refuses to store one, so validation is not the protection.
  - `**** 3776` is accepted (first alternative), as is `•••• •••• •••• 3776` — the form the app's own mask
    writer produces (`CashCardManagement.tsx:455`) — and `**** **** **** 3776`.
  - `4520 **** **** 3776`, the form the QA harness seeds, is **rejected** (B-14). It can only reach the
    database by a path that does not call `validateData`, which means stored rows exist that the schema would
    refuse on re-validation. Use the bullet-mask form for any fixture card.
- `validateData` returns `{ success: true, data }` or `{ success: false, error }` where `error` is a **joined
  string**, not an array — there is no `errors` list to port. The fixtures capture `data` as well, because
  Zod injects defaults (`isLimitLocked`, `isCanceled`, `cardTheme`, `isFrozen`, `status`) and the post-parse
  shape is part of the contract.
- Date fields use **unanchored** regexes, so a full timestamp passes `dueDate` validation; a bare-day check
  elsewhere does not accept it. Replicate the laxness.
- Category fields are **closed enums** duplicated by hand across `types.ts`, `validators`, `utils.ts`
  constants and `freeOcrParser` (§5 landmine 11) — the fixture pins the validator's copy as authoritative
  for what it accepts.
- Behaviour to pin: unknown keys (stripped or forbidden?), `null` vs missing, `''` against a min-length,
  numeric strings against `z.number()`, and whether the error message text is stable enough to port.

**Case families:** a valid instance of each schema; one targeted violation each for the PAN pattern,
amount ≤ 0, an unknown category, a missing required id, a `null` optional, and a restore payload that
matches neither union branch.

---

## 12. `display-interest` — the unrounded UI figure (B-03, ruled replicate)

`src/components/CreditCardManagement.tsx:67-71`:

```ts
function calculateInterest(balance: number, apr: number, days: number): number {
  if (balance >= 0 || apr <= 0) return 0;
  const dailyRate = apr / 100 / 365;
  return Math.abs(balance) * dailyRate * days;
}
```

It is module-private inside a `.tsx`, so it cannot be imported. **The generator extracts these exact source
lines from the `pre-flutter` blob and evaluates them verbatim** (`new Function` over the extracted text),
and records the extracted text's hash in provenance. No re-implementation, no hand-written `expected` — the
golden comes from running the original bytes.

Divergences from §2's `interestForCycle`, all of which must survive into the port:

| Input           | `interestForCycle` (engine)                                                   | `calculateInterest` (display)   |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| `days < 0`      | `0` (guard `days <= 0`)                                                       | **negative number**             |
| `days = 0`      | `0`                                                                           | `0`                             |
| `apr = NaN`     | `0` (`!(NaN > 0)`)                                                            | **`NaN`** (`NaN <= 0` is false) |
| `balance = NaN` | `0` (`NaN >= 0` false → guard on days? no: proceeds, `Math.abs(NaN)` → `NaN`) | **`NaN`**                       |
| ordinary values | rounded to 2 dp                                                               | **unrounded full precision**    |

The consequence, per your ruling, is that the card screen can show a figure the engine does not charge, and
mobile must show **the same** wrong figure. Do not "helpfully" route the display through the engine.

**Case families:** ordinary balance/apr/days; `days` −1/0/1/365; `apr` 0/NaN/undefined; `balance` 0/positive/
NaN/-0; and one **explicit pair** per row showing engine-vs-display for the same input, so a reviewer can see
the divergence rather than infer it.

---

## 13. `number-locale` — the same `formatMoney` under eight locales

`src/lib/money.ts` again, and deliberately a **separate unit** rather than more `money` cases: `money.json`
is one locale's goldens (`_provenance.locale`, `en-US`), while the locale itself is the thing under test here,
and a change to one must not silently invalidate the other.

§1 says the web passes `undefined` as the locale, so the string a user sees is a function of the browser's
language. That is the whole of the unit's contract: for a given tag, what does `formatMoney` produce?

### How the goldens are produced

`generate.ts` cannot call `formatMoney` with a locale — the web's call site has no such parameter — so §1's
body is transcribed as `formatMoneyIn(tag, currency, amount, options)`, identical except that the `undefined`
in `toLocaleString(undefined, …)` becomes `tag`. The transcription is then **measured against the original**:
`assertCopyMatchesOriginal()` runs the real `formatMoney` and `formatMoneyIn` at the runtime default locale
over 7 amounts × 4 option shapes and throws if any pair differs. The copy therefore cannot drift from
`money.ts` without the generator failing.

### The matrix

| column     | values                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 8 locales  | `en-US`, `en-IN`, `de-DE`, `fr-FR`, `hi-IN`, `ar-EG`, `cs-CZ`, `bn-BD`                                          |
| 12 amounts | `0`, `-0`, `0.015`, `1.005`, `2.5`, `-2.5`, `999.9999`, `125000.0049`, `1234567.891`, `1250000`, `1e21`, `1e-7` |
| per locale | 12 amounts × (default digits, `2dp`) = 24, plus 4 `0dp` cases and 1 empty-currency case = **29**                |
| **total**  | **8 × 29 = 232** cases, exactly the matrix — no surplus, so a dropped cell fails `validate.ts`                  |

The locales are chosen by **what knob they move**, not by population: `en-US` is the generator's own default,
so its rows are `money.json`'s `formatMoney` rows re-measured rather than a new claim;
`en-IN`/`hi-IN`/`bn-BD` group in threes then
twos (`Rs.1,25,000`, the lakh shape) and `bn-BD` adds Bengali digits; `de-DE` swaps the separators; `fr-FR`
groups with `U+202F` and `cs-CZ` with `U+00A0`, neither of which is an ASCII space; `ar-EG` writes
Arabic-Indic digits **and** prefixes a negative with `U+061C`, an invisible letter-mark that a port built from
a format string would never produce. The amounts are chosen the same way: `0` and `-0` (does the locale keep
the sign), the two tie cases (`0.015`, `1.005`), the two grouping-boundary cases (`1234567.891`, `1250000`),
the `1e21` expansion, and `1e-7`, which is `0` at every digit count the matrix uses.

### The ruling this unit exists to prove

Ruled at the Phase-4 gate: **`D-12` is not a divergence.** The phone formats money in **its own locale**, the
same ambient choice the browser makes, and `en-US` is named only where a test replays an `en-US`-measured
golden. So the port is `formatMoney(currency, amount, options, [locale])` with the locale defaulting to the
platform's (`dart:ui`'s `PlatformDispatcher.instance.locale`, not `intl`'s process-global default, which stays
`en_US` unless an app sets it and would pin one locale under another name), and
`test/domain/money_test.dart` passes `JsNumberLocale.resolve('en-US')` in explicitly.

Two implementation facts, both measured rather than assumed:

- `intl`'s `NumberFormat` may supply the **metadata** — separators, grouping runs, zero digit, sign affixes —
  because its CLDR data agrees with V8 on every knob above. It may **not** supply the **digits**: over 720
  `(value, min, max)` triples it diverged from V8 on 60 of them, all at `1.005` (its rounding is not Intl's
  half-expand-on-shortest-decimal) and `1e22` (int64 saturation). `js_semantics.dart` therefore does the
  rounding and grouping itself, and was swept against the same 720 V8 measurements across ten locales with
  **zero divergences**.
- A tag with no CLDR data at all must not throw. V8 answers `zzy-ZZ` with its runtime default; the port
  resolves it to the `en-US` shape and keeps the caller's tag. A locale the phone reports is input the app
  cannot validate, and the display path is not allowed to be the thing that stops a balance rendering.

**Case families:** every locale × default/`2dp`/`0dp` digits; `-0`; the empty currency; the two rounding-tie
cents; the lakh and non-ASCII-space groupers; Arabic-Indic and Bengali digit runs; the `1e21` expansion; a
negative in a locale whose sign is an invisible mark.

---

## 14. What Phase 1 does _not_ cover yet

| Deferred                                                                       | Why                                                                                                                                                                                      | Where it lands          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `App.tsx` handler math (interest application, deductions, repayments, restore) | Not importable — it lives inside React component bodies. Same extraction technique as §12 applies, but the handlers depend on `setState` closure. Requires the Phase 4 scaffold to host. | Phase 4, gated          |
| `src/supabase.ts` sync engine (1172 LOC)                                       | Needs a Supabase-shaped mock; the contract (tombstones, dirty flag, never-push-before-pull) is specified in `INVENTORY.md` §6 but not yet golden-ised.                                   | Phase 3/4               |
| `freeOcrParser.ts`                                                             | Ruled D4 — mobile calls `/api/ocr/free-scan` instead. Becomes a **server contract** fixture, not a Dart port target.                                                                     | Phase 4 (contract only) |
| `lib/api.ts` `retryWithBackoff`/`fetchWithTimeout`                             | Time-based, non-deterministic without a fake clock; no money semantics.                                                                                                                  | Phase 3                 |
| Durability helpers (`markStateDirty`, tombstones, `saveStateToStorage`)        | `localStorage`-bound; the Dart equivalent is drift, so the _contract_ is what needs pinning.                                                                                             | Phase 3                 |

These are listed rather than silently omitted — the playbook requires unknowns to be marked, not guessed.
