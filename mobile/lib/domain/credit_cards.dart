import 'dart:math' as math;

import '../data/js_semantics.dart';
import '../data/number_locale.dart';
import '../models/entities.dart';
import 'money.dart';

/// Port of `src/lib/creditCards.ts` at the `pre-flutter` tag (blob unchanged),
/// specified by `parity/LOGIC_SPEC.md` §3/§4 and pinned by three fixtures:
/// `credit-cycles.json` (139 cases), `credit-payments.json` (34) and
/// `cycle-rollover.json` (19).
///
/// **This is the pure-UTC half of the app's two date regimes** (`INVENTORY.md` §5.1).
/// Every date here is a `YYYY-MM-DD` *string* compared with `<`, `>=` and `===`, and the
/// only arithmetic on it is `Date.UTC`, so no host zone, no DST and no `Date.parse` can
/// move an answer. That is the opposite of `lib/data/dates_local.dart`, where the same
/// day is a local midnight. The split is the web's, deliberately, so both halves are
/// kept — a "clean fix" that routes one through the other changes which cycle a payment
/// lands in.
///
/// Three asymmetries with the rest of the app are load-bearing and must not be unified:
///
/// * `advanceDueDate` **forgets the anniversary** (B-02, ruled *replicate*): a due date
///   that ever lands on the 31st is clamped down and never climbs back, so the 31st is a
///   one-way door. `lib/data/dates_local.dart` has a second, unrelated clamping month
///   step for the local regime.
/// * `interestForCycle` guards its APR with `!(aprPercent > 0)`, which also rejects
///   `NaN` and `undefined`, while the UI twin (`domain/display_interest.dart`) tests
///   `apr <= 0` and multiplies `NaN` through. B-03: the figure the card list shows is
///   not the figure the engine charges, and both are correct by the web's standard.
/// * the cycle closes on `DEDUCTION_DAY` (the 15th) but the next due date advances from
///   the card's own due date (the 7th). Reading the anchor as the 15th would silently
///   migrate every deadline to the 15th.
///
/// `runCycleRollover` is **not idempotent** — `cycle-rollover.json` measures that a
/// second call charges the same cycle twice. The web runs it from a mount effect and a
/// 60-second interval and deduplicates by a reference key; the phone has no equivalent
/// timer, which `INVENTORY.md` §5.3 lists as a behaviour decision, not a port detail.

/// `DEDUCTION_DAY` — `src/lib/creditCards.ts:53`. The day of the month the bank
/// deducts on. Authoritative: not the 7th, not the 8th.
const int deductionDay = 15;

/// The `{year, month, day}` triple `parseDateParts` returns for a strict
/// `YYYY-MM-DD` string. Module-private, as it is in the web file.
final class _DateParts {
  const _DateParts(this.year, this.month, this.day);
  final int year;
  final int month;
  final int day;
}

final RegExp _isoDay = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

/// `parseDateParts` — `:34-42`. Strict `YYYY-MM-DD` only: `2026-9-5` is not a date here,
/// and neither is anything `Date.parse` would accept. Month 1-12 and day 1-31 are range
/// checked, but **day 31 in a 30-day month passes** — `2026-02-31` parses and then rolls
/// over in `Date.UTC`. That is the web's behaviour, kept.
_DateParts? _parseDateParts(String dateStr) {
  final RegExpMatch? m = _isoDay.firstMatch(dateStr);
  if (m == null) return null;
  final int year = int.parse(m.group(1)!);
  final int month = int.parse(m.group(2)!);
  final int day = int.parse(m.group(3)!);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return _DateParts(year, month, day);
}

/// `formatDate` — `:44-46`. Zero-padded, and a year outside 1000-9999 is written as-is.
String _formatDate(int year, int month, int day) =>
    '$year-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';

/// `isLeapYear` — `:13-15`. The Gregorian rule, so `2100` is *not* a leap year and
/// `2000` is.
bool _isLeapYear(int year) =>
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;

/// `daysInMonth` — `:20-32`. Months outside 1-12 fall through the `default` to `31`;
/// the only caller is already range-checked, so that branch is the web's, kept verbatim.
int _daysInMonth(int year, int month) {
  switch (month) {
    case 2:
      return _isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/// `deductionDate` — `:62-66`. The 15th of the month that contains [dueDate]; a
/// malformed input is returned **unchanged**, which is what lets a half-typed due date
/// keep its own (wrong) cycle end rather than collapsing to the 15th.
String deductionDate(String dueDate) {
  final _DateParts? parts = _parseDateParts(dueDate);
  if (parts == null) return dueDate;
  return _formatDate(parts.year, parts.month, deductionDay);
}

/// `advanceDueDate` — `:75-89`. One calendar month forward, clamped to the target
/// month's length. B-02: the clamp is one-way, so `2026-01-31 → 02-28 → 03-28` and the
/// 31st is lost forever. Pure arithmetic, never `Date`/`setMonth`.
String advanceDueDate(String dueDate) {
  final _DateParts? parts = _parseDateParts(dueDate);
  if (parts == null) return dueDate;
  int targetYear = parts.year;
  int targetMonth = parts.month + 1;
  if (targetMonth > 12) {
    targetYear += 1;
    targetMonth = 1;
  }
  final int targetDay = math.min(
    parts.day,
    _daysInMonth(targetYear, targetMonth),
  );
  return _formatDate(targetYear, targetMonth, targetDay);
}

/// `cycleWindowStart` — `:95-109`. The same step backwards: the window that a due date
/// closes.
String cycleWindowStart(String dueDate) {
  final _DateParts? parts = _parseDateParts(dueDate);
  if (parts == null) return dueDate;
  int targetYear = parts.year;
  int targetMonth = parts.month - 1;
  if (targetMonth < 1) {
    targetYear -= 1;
    targetMonth = 12;
  }
  final int targetDay = math.min(
    parts.day,
    _daysInMonth(targetYear, targetMonth),
  );
  return _formatDate(targetYear, targetMonth, targetDay);
}

/// `computeMinimumPayment` — `:119-132`. The Sampath rule: 5% of the outstanding, or
/// 5% of the limit **plus the whole excess** when the card is over it, then a standing
/// floor of Rs. 250. A positive or zero balance is not a minimum, it is `0`.
///
/// Two details the fixtures exist to pin. `Math.round(x*100)/100` is a **half-up**
/// rounding (so `jsMathRound`, whose `-0` handling is measured), and the floor is applied
/// *after* rounding — a card in debt by Re. 1 still owes Rs. 250. A `NaN` balance or a
/// `NaN` limit walks out of `Math.max` as `NaN`, not as `250`.
num computeMinimumPayment(num balance, [num? limit]) {
  if (balance >= 0) return 0;
  final num abs = balance.abs();

  final num raw;
  if (jsTruthy(limit) && limit! > 0 && abs > limit) {
    raw = 0.05 * limit + (abs - limit);
  } else {
    raw = 0.05 * abs;
  }

  final num rounded = jsMathRound(raw * 100) / 100;
  // `dart:math` propagates `NaN` exactly as `Math.max` does, so a `NaN` minimum stays
  // `NaN` rather than becoming the Rs. 250 floor.
  return math.max(rounded, 250);
}

/// `cycleAnchor` — `:141-143`. The date the billing window is measured from: a
/// statement-close (cut-off) date wins, then the due date, then the empty string.
///
/// The web's parameter is a structural `{ dueDate?, statementCloseDate? }`, not a whole
/// `BankCard`, and [cycleAnchor] is called from [isMinimumSatisfied] and
/// [runCycleRollover] with two fields read off a card. Named arguments keep that shape
/// instead of inventing a card type for a function that reads two strings.
String cycleAnchor({String? dueDate, String? statementCloseDate}) {
  final Object? anchor = jsFirstTruthy(<Object?>[
    statementCloseDate,
    dueDate,
    '',
  ]);
  return anchor is String ? anchor : '';
}

/// `paymentsInCycle` — `:160-182`. Everything paid *to* this card inside
/// `[cycleWindowStart(anchor), dueDate]`, **inclusive of the due date** — the due date is
/// the last day of the cycle, so a payment on it still counts toward this cycle's
/// minimum. The window is matched on `targetAccountId`/`targetAccountType`, not on the
/// title, so renaming a card cannot orphan its own payments.
///
/// Dates are compared as strings, which is the whole point: `'2026-10-08' >= '2026-9-7'`
/// is `false` in lexicographic order and `true` if either side were parsed. A malformed
/// date silently falls outside every window.
num paymentsInCycle(
  List<Transaction> transactions,
  String cardId,
  String dueDate, [
  String? anchorDate,
]) {
  if (!jsTruthy(dueDate)) return 0;
  final Object? anchorValue = jsFirstTruthy(<Object?>[anchorDate, dueDate]);
  final String anchor = anchorValue! as String;
  final String windowStart = cycleWindowStart(anchor);

  final List<num> amounts = <num>[];
  for (final Transaction t in transactions) {
    if (t.type == 'debt_payment' &&
        t.targetAccountId == cardId &&
        t.targetAccountType == 'card' &&
        t.date.compareTo(windowStart) >= 0 &&
        t.date.compareTo(dueDate) <= 0) {
      amounts.add(t.amount);
    }
  }
  return sumMoney(amounts);
}

/// `hasDeductionPayment` — `:189-198`, module-private on the web. A `debt_payment` dated
/// *exactly* the deduction day is the bank's own automatic debit, which collects the
/// minimum outside the manual window, so it must never produce a late fee. `===` on the
/// date: a debit on the 16th is not a debit on the 15th.
bool _hasDeductionPayment(
  List<Transaction> transactions,
  String cardId,
  String cycleEnd,
) {
  for (final Transaction t in transactions) {
    if (t.type == 'debt_payment' &&
        t.targetAccountId == cardId &&
        t.targetAccountType == 'card' &&
        t.date == cycleEnd &&
        t.amount > 0) {
      return true;
    }
  }
  return false;
}

/// `isMinimumSatisfied` — `:205-211`. The "min paid" tick in the UI. Unset or
/// non-positive minimum, or no due date, is `false` rather than "nothing owed".
bool isMinimumSatisfied(BankCard card, List<Transaction> transactions) {
  final String? dueDate = card.dueDate;
  final num? minPayment = card.minPayment;
  if (!jsTruthy(dueDate) || !jsTruthy(minPayment) || minPayment! <= 0) {
    return false;
  }
  return _hasDeductionPayment(transactions, card.id, deductionDate(dueDate!)) ||
      paymentsInCycle(
            transactions,
            card.id,
            dueDate,
            cycleAnchor(
              dueDate: card.dueDate,
              statementCloseDate: card.statementCloseDate,
            ),
          ) >=
          minPayment;
}

/// `daysBetween` — `:218-225`. Whole days between two `YYYY-MM-DD` strings, start
/// inclusive and end exclusive, computed as `Date.UTC` differences so neither a host
/// zone nor a DST hour can add or drop a day. `0` when either side is malformed — the
/// same answer as "no elapsed time", which is *not* the same as "unknown".
num daysBetween(String start, String end) {
  final _DateParts? a = _parseDateParts(start);
  final _DateParts? b = _parseDateParts(end);
  if (a == null || b == null) return 0;
  // `INVENTORY.md` §5.1's trap, hit and fixed here: `Date.UTC` takes a **0-based** month
  // and `DateTime.utc` takes a 1-based one. Passing `month - 1` silently shifts every
  // answer by up to a month, which `credit-cycles.json` measures —
  // `daysBetween('2026-09-15', '2026-10-07')` is 22 days, not 23.
  final int startUtc = DateTime.utc(
    a.year,
    a.month,
    a.day,
  ).millisecondsSinceEpoch;
  final int endUtc = DateTime.utc(
    b.year,
    b.month,
    b.day,
  ).millisecondsSinceEpoch;
  return jsMathRound((endUtc - startUtc) / 86400000);
}

/// `interestForCycle` — `:233-237`. The **charged** figure: the Sampath daily-balance
/// rule rounded to two decimals, and `0` for a credit balance, an unset/zero/negative/
/// NaN APR, or no elapsed days.
///
/// Note the guard shape. `!(aprPercent > 0)` is not `aprPercent <= 0`: the negated
/// comparison makes `NaN` and `undefined` APR return `0`, while the display twin
/// (`displayInterest`, `LOGIC_SPEC.md` §12) tests `apr <= 0`, lets both through and
/// multiplies them into `NaN`. That asymmetry is the whole point of B-03 and is pinned by
/// `display-interest.json`.
///
/// The web types [aprPercent] as `number`, so `undefined` is not supposed to reach it —
/// and at the only real call site (`:354` below) `card.apr ?? 0` means it never does. But
/// `credit-cycles.json` calls it with `undefined` and `NaN` on purpose, to pin which side
/// of `!(_ > 0)` each lands on, so the port accepts `num?` rather than crashing before
/// the guard gets to answer.
num interestForCycle(num balance, num? aprPercent, num days) {
  if (balance >= 0 || !(aprPercent != null && aprPercent > 0) || days <= 0) {
    return 0;
  }
  final num raw = balance.abs() * (aprPercent / 100 / 365) * days;
  return jsMathRound(raw * 100) / 100;
}

/// `latePaymentFee` — `:243-246`. Rs. 1,200 or 5% of the minimum, whichever is higher;
/// `0` when no minimum is set. A `NaN` minimum leaves `Math.max` and returns `NaN`.
num latePaymentFee([num? minPayment]) {
  if (!jsTruthy(minPayment) || minPayment! <= 0) return 0;
  return jsMathRound(math.max(1200, 0.05 * minPayment) * 100) / 100;
}

/// The patch `maybeRollCard` returns, as the web's two possible object literals.
///
/// The distinction between "no keys" and "both keys present and `undefined`" is the
/// payload: the caller spreads it over the card, so `RollCardPatch.none()` leaves the
/// due date alone and `RollCardPatch.cleared()` erases it. `cycle-payments.json` records
/// the empty object as `{}` and the erasure as `{"dueDate": undefined, "minPayment":
/// undefined}`, so a port that collapses the two into `null` either loses the erase or
/// performs it too early.
final class RollCardPatch {
  /// `{}` — leave the cycle exactly as it is.
  const RollCardPatch.none() : settles = false;

  /// `{ dueDate: undefined, minPayment: undefined }` — the debt is gone, so the cycle
  /// dates go with it.
  const RollCardPatch.cleared() : settles = true;

  final bool settles;
}

/// `maybeRollCard` — `:260-268`. What a *recorded payment* does to the cycle: nothing,
/// unless it settles the balance to zero or above, in which case the due date and the
/// minimum are dropped. [transactions] is unused by the web (the parameter is named
/// `_transactions`); the cycle itself is settled only by [runCycleRollover].
///
/// `newBalance >= 0` on a `NaN` amount is `false`, so a garbage payment never clears a
/// real due date — `credit-payments.json` measures that.
RollCardPatch maybeRollCard(
  BankCard card,
  List<Transaction> transactions,
  num amount,
) {
  if (!jsTruthy(card.dueDate)) return const RollCardPatch.none();
  final num newBalance = addMoney(card.currentBalance, amount);
  return newBalance >= 0
      ? const RollCardPatch.cleared()
      : const RollCardPatch.none();
}

/// `CycleChargeDraft` — `:272-278`. A rollover charge ready to be persisted as a Charge
/// plus a `credit_card_charge` transaction. [description] is user-facing text built by
/// the web with a template literal, so its exact spacing and its `toLocaleString()`
/// grouping are part of the golden.
final class CycleChargeDraft {
  const CycleChargeDraft({
    required this.type,
    required this.name,
    required this.amount,
    required this.appliedDate,
    required this.description,
  });

  /// `'Interest Charge' | 'Late Payment Fee'`
  final String type;
  final String name;
  final num amount;
  final String appliedDate;
  final String description;
}

/// `CycleRolloverResult` — `:281-286`. The card after its cycle closed, plus the
/// charges the caller must persist.
///
/// When the charges settle the card outright, [dueDate] and [minPayment] are the web's
/// explicit `undefined`: the keys are present in the golden and hold the sentinel, which
/// is how a replay tells "cleared" from "not recomputed".
final class CycleRolloverResult {
  const CycleRolloverResult({
    required this.currentBalance,
    required this.dueDate,
    required this.minPayment,
    required this.charges,
  });

  final num currentBalance;
  final String? dueDate;
  final num? minPayment;
  final List<CycleChargeDraft> charges;
}

/// `runCycleRollover` — `:308-379`. Closes a card's cycle on the deduction day.
///
/// Order is the web's and every step is observable in `cycle-rollover.json`: return
/// `null` while the cycle is open (`today < cycleEnd`, a **string** comparison) or when
/// the card has no due date; measure the cycle from the anchor; charge interest only when
/// there is both an outstanding balance and interest to charge; charge the late fee only
/// when the minimum went unpaid *and* a minimum was configured (`!== undefined`, not
/// truthiness — `latePaymentFee` then decides whether the fee is real); subtract the
/// charges from the balance; and if the card is still in debt, advance the due date from
/// **the 7th**, not from the 15th, and recompute the minimum on the new balance.
///
/// [locale] formats the late-fee description the way the phone's own locale would, per
/// `DATA_SPEC.md` §11 D-12; a replay of `cycle-rollover.json` names the locale the golden
/// was measured in (`en-US`) instead of inheriting the device's.
///
/// **Not idempotent.** The web calls this from a mount effect and a 60-second interval
/// and deduplicates by a card+deduction-date reference key; calling it twice for one
/// cycle charges that cycle twice, which `cycle-rollover.json` measures rather than
/// assumes.
CycleRolloverResult? runCycleRollover(
  BankCard card,
  List<Transaction> transactions,
  String today, [
  JsNumberLocale? locale,
]) {
  final String? dueDate = card.dueDate;
  if (!jsTruthy(dueDate)) return null;
  final String cycleEnd = deductionDate(dueDate!);
  if (today.compareTo(cycleEnd) < 0) return null;

  // The cycle anchor: a card with a statement close (payment cut-off) date opens its
  // billing window one calendar month before that cut-off; without one the window is
  // anchored on the deduction date.
  final String anchorDate = cycleAnchor(
    dueDate: card.dueDate,
    statementCloseDate: card.statementCloseDate,
  );
  final String anchor = anchorDate.isNotEmpty ? anchorDate : cycleEnd;

  final num outstanding = card.currentBalance < 0
      ? card.currentBalance.abs()
      : 0;
  final num cyclePayments = paymentsInCycle(
    transactions,
    card.id,
    dueDate,
    anchor,
  );
  final num? minPayment = card.minPayment;
  final bool minOk =
      !jsTruthy(minPayment) ||
      minPayment! <= 0 ||
      cyclePayments >= minPayment ||
      _hasDeductionPayment(transactions, card.id, cycleEnd);

  final List<CycleChargeDraft> charges = <CycleChargeDraft>[];

  final num cycleDays = daysBetween(cycleWindowStart(anchor), anchor);
  final num interest = interestForCycle(
    card.currentBalance,
    card.apr ?? 0,
    cycleDays,
  );
  if (outstanding > 0 && interest > 0) {
    charges.add(
      CycleChargeDraft(
        type: 'Interest Charge',
        name: 'Revolving Interest',
        amount: asJsonSafeNumber(interest),
        appliedDate: cycleEnd,
        // The web interpolates `card.apr` **raw** (`:345`), so the text is the number the
        // card carries, and `undefined` for a card that has none — which is the web's
        // `apr?: number` absent, not a `null` it never stores. `LOGIC_SPEC.md` §4 rules
        // that text *replicate*, including its unreachable half: interest is `0` whenever
        // APR is unset, so the guard above means this branch never sees it.
        description:
            '${card.apr == null ? 'undefined' : jsNumberToString(card.apr!)}'
            '% p.a. on the carried balance for the $cycleEnd cycle',
      ),
    );
  }

  // The web also tests `minPayment !== undefined` here. It is the same fact stated
  // twice: `minOk` is `true` whenever no minimum is configured, so reaching this branch
  // with `!minOk` already proves one exists.
  if (!minOk && outstanding > 0) {
    final num fee = latePaymentFee(minPayment);
    if (fee > 0) {
      final JsNumberLocale numberLocale = locale ?? JsNumberLocale.device();
      charges.add(
        CycleChargeDraft(
          type: 'Late Payment Fee',
          name: 'Late Payment Fee',
          amount: asJsonSafeNumber(fee),
          appliedDate: cycleEnd,
          description:
              'Pays to $cycleEnd: minimum of ${jsToLocaleStringFixed(minPayment, 0, 3, numberLocale)} not paid',
        ),
      );
    }
  }

  final num chargeTotal = sumMoney(
    charges.map((CycleChargeDraft c) => c.amount).toList(),
  );
  final num newBalance = subtractMoney(card.currentBalance, chargeTotal);

  if (newBalance >= 0) {
    return CycleRolloverResult(
      currentBalance: asJsonSafeNumber(newBalance),
      dueDate: null,
      minPayment: null,
      charges: charges,
    );
  }

  return CycleRolloverResult(
    currentBalance: asJsonSafeNumber(newBalance),
    // Advance from the card's own due date (the 7th), not the deduction date (the 15th):
    // the bank rule is that the next deadline stays on the 7th, and advancing from the
    // 15th would silently migrate every card's deadline to the 15th one cycle at a time.
    dueDate: advanceDueDate(dueDate),
    minPayment: asJsonSafeNumber(computeMinimumPayment(newBalance, card.limit)),
    charges: charges,
  );
}
