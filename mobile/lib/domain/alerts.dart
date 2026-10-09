import '../data/js_semantics.dart';
import '../data/number_locale.dart';
import '../models/app_state.dart';
import '../models/entities_ledger.dart';
import 'budget_spending.dart';

/// Port of `src/lib/alerts.ts` at the `pre-flutter` tag (blob unchanged), specified by
/// `parity/LOGIC_SPEC.md` §8 and pinned by `parity/fixtures/alerts.json` (40 cases).
///
/// Three properties of this file decide what a user sees and are easy to lose in a
/// rewrite. It has its **own** `formatMoney`, a five-line shadow of the one in
/// `money.ts`, and the two differ by a space: this one writes `"Rs. 1,500"`, `money.ts`
/// writes `"Rs.1,500"`. `alerts.json` measures that difference rather than resolving it,
/// so neither string may be "unified" here. Its dates are parsed by a local `parseDay`
/// that deliberately refuses `Date.parse` for the `YYYY-MM-DD` shape, which is the
/// §6 regime, not §2's. And the clock is an argument with a default, so the engine is
/// deterministic only when the caller supplies it — the fixtures pin one instant
/// (`_provenance.pinnedNow`) and the Dart test replays that instant rather than whatever
/// "today" is on the build machine.

/// `BUDGET_WARN_AT` — exported by the web and asserted by `alerts.json`.
const double budgetWarnAt = 0.8;

/// `BUDGET_CRITICAL_AT` — module-private on the web.
const double _budgetCriticalAt = 1.0;

/// `DUE_SOON_DAYS` — one day ahead, plus the day itself.
const int _dueSoonDays = 1;

/// `Goal` alerts are open for a week (`d <= 7`), which is the only place the number 7
/// appears and is not the same window as [_dueSoonDays].
const int _goalSoonDays = 7;

/// `FinanceAlert`. `severity` is `critical | warning | info` and `type` is
/// `budget | bill | debt | goal`; both stay strings because the web's JSON is compared
/// key-for-key against the golden and an enum would have to name every value anyway.
final class FinanceAlert {
  const FinanceAlert({
    required this.id,
    required this.severity,
    required this.title,
    required this.detail,
    required this.type,
  });

  final String id;
  final String severity;
  final String title;
  final String detail;
  final String type;

  Map<String, Object?> toJson() => <String, Object?>{
    'id': id,
    'severity': severity,
    'title': title,
    'detail': detail,
    'type': type,
  };
}

/// `parseDay` — a calendar day as the milliseconds of **its local midnight**.
///
/// The comment in the web file is the reason this exists: `Date.parse('2026-10-04')` is
/// UTC midnight, which off-by-ones the day delta for any non-UTC timezone, so a `YYYY-MM
/// -DD` string is taken apart and rebuilt at local midnight instead. Anything that is not
/// that exact shape falls through to `Date.parse`, and anything unparseable becomes `-1`,
/// which [daysRemaining] reads as "no such day" and returns `Infinity` for.
///
/// The constructor form is `new Date(y, m - 1, d)`, which **normalises** out-of-range
/// components — `2026-13-99` is not an error but 2027-04-09, eighteen months and five
/// days out — and maps a two-digit year onto 1900. Dart's `DateTime` normalises the same
/// way for month and day but has no 1900 rule, so `0026-01-01` would be year 26 on the
/// phone and 1926 in the browser. That mapping is reproduced, not judged.
int _parseDay(String iso) {
  final String trimmed = iso.trim();
  final RegExpMatch? parts = _dayPattern.firstMatch(trimmed);
  if (parts != null) {
    final int rawYear = int.parse(parts.group(1)!);
    final int month = int.parse(parts.group(2)!) - 1;
    final int day = int.parse(parts.group(3)!);
    final int year = rawYear <= 99 ? 1900 + rawYear : rawYear;
    // `isNaN(ms)` cannot happen here: the regex bounds the year to four digits, and both
    // engines represent every year 0000–9999 (after the 1900 mapping, 1900–9999 plus
    // 1900–1999). So there is no NaN branch to port, only the `-1` for the fall-through.
    return DateTime(year, month + 1, day).millisecondsSinceEpoch;
  }
  final int? parsed = jsDateToEpochMs(trimmed);
  return parsed ?? -1;
}

final RegExp _dayPattern = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

/// `daysUntil`. A day that cannot be parsed is `Infinity` days away — not `null`, not
/// `-1` — which is what keeps an undated row from ever satisfying `d >= 0 && d <= 1`.
num _daysUntil(String dateStr, int todayMs) {
  final int t = _parseDay(dateStr);
  if (t < 0) return double.infinity;
  final double q = (t - todayMs) / 86400000.0;
  final int ceiled = q.ceil();
  // `Math.ceil(-0.229)` is `-0`, and the golden for a bill due *today* is the `-0`
  // sentinel rather than `0`. Dart's `ceil()` returns an `int`, which has no negative
  // zero, so the sign is re-derived and the result is a `double` in that one case.
  return ceiled == 0 && q.isNegative ? -0.0 : ceiled;
}

/// `daysRemaining` — the exported wrapper, and the only part of this file the web tests
/// call directly.
num daysRemaining(String dateStr, [int? todayMs]) =>
    _daysUntil(dateStr, todayMs ?? _nowMs());

int _nowMs() => DateTime.now().millisecondsSinceEpoch;

/// The local shadow `formatMoney`. **Space after the currency**, which `money.ts`'s does
/// not have, and no sign-stripping, which `money.ts`'s does.
///
/// [locale] is the phone's own unless a caller names one, exactly as the web passes
/// `undefined` to `toLocaleString`; a test replaying `alerts.json` names the locale the
/// golden was measured in (`DATA_SPEC.md` §11 D-12).
String _formatAlertMoney(num amount, String currency, JsNumberLocale locale) =>
    '$currency ${jsToLocaleStringFixed(amount, 0, 2, locale)}';

/// `computeAlerts` — the whole of the alert tray's content, as a pure function of state
/// and a reference day.
///
/// Emission order is **budgets, bills, debts, goals** and is golden-tested, because
/// `AlertsPanel` renders the list in that order without sorting it.
List<FinanceAlert> computeAlerts(
  AppState state, [
  int? todayMs,
  JsNumberLocale? locale,
]) {
  final int now = todayMs ?? _nowMs();
  final JsNumberLocale numberLocale = locale ?? JsNumberLocale.device();
  final List<FinanceAlert> alerts = <FinanceAlert>[];
  final String currency = jsTruthy(state.currency) ? state.currency : 'Rs.';

  // 1. Budgets. `b.spent` is ignored entirely — the envelope stores the value it was
  // created with and nothing ever writes it back, so reading it made every budget report
  // 0%. The figure is derived from the ledger here and in the two other places that show
  // it, which is why this calls the shared [budgetSpendingForMonth] rather than summing
  // inline.
  for (final Budget b in state.budgets) {
    if (b.limit <= 0) continue;
    final num spent = budgetSpendingForMonth(
      b.category,
      state.transactions,
      state.subscriptions,
      now,
    ).spent;
    final double pct = spent / b.limit;
    final String amount = _formatAlertMoney(spent, currency, numberLocale);
    final String limit = _formatAlertMoney(b.limit, currency, numberLocale);
    // `Math.round(pct · 100)` is interpolated as an integer: 99.9% prints "100", and the
    // web's template literal would print `100`, not `100.0`.
    final int percent = jsMathRound(pct * 100).toInt();
    if (pct >= _budgetCriticalAt) {
      alerts.add(
        FinanceAlert(
          id: 'budget-over-${b.id}',
          severity: 'critical',
          title: '${b.category} budget exceeded',
          detail: 'Spent $amount of $limit ($percent%).',
          type: 'budget',
        ),
      );
    } else if (pct >= budgetWarnAt) {
      alerts.add(
        FinanceAlert(
          id: 'budget-close-${b.id}',
          severity: 'warning',
          title: '${b.category} budget almost reached',
          detail: 'Spent $amount of $limit ($percent%).',
          type: 'budget',
        ),
      );
    }
  }

  // 2. Recurring bills. `status` is compared to the exact string `'Active'`, so a row
  // that says `active` is silent — the web's data model is case-sensitive here and no
  // lower-casing is added.
  for (final Subscription s in state.subscriptions) {
    if (s.status != 'Active' || s.dueDate.isEmpty) continue;
    final num d = _daysUntil(s.dueDate, now);
    if (d >= 0 && d <= _dueSoonDays) {
      final int days = d.toInt();
      alerts.add(
        FinanceAlert(
          id: 'bill-due-${s.id}',
          severity: days == 0 ? 'critical' : 'warning',
          title: days == 0
              ? '${s.name} due today'
              : '${s.name} due in $days day${days == 1 ? '' : 's'}',
          detail:
              '${_formatAlertMoney(s.amount, currency, numberLocale)} (${s.billingCycle}).',
          type: 'bill',
        ),
      );
    }
  }

  // 3. Debts. A debt with nothing left to pay is skipped by the `remainingAmount > 0`
  // test even when its due date is today.
  for (final Debt dt in state.debts) {
    if (dt.status == 'Fully Repaid' || dt.dueDate.isEmpty) continue;
    final num d = _daysUntil(dt.dueDate, now);
    if (d >= 0 && d <= _dueSoonDays && dt.remainingAmount > 0) {
      final int days = d.toInt();
      alerts.add(
        FinanceAlert(
          id: 'debt-due-${dt.id}',
          severity: days == 0 ? 'critical' : 'warning',
          title: days == 0
              ? 'Debt from ${dt.debtSource} due today'
              : 'Debt from ${dt.debtSource} due in $days day${days == 1 ? '' : 's'}',
          detail:
              '${_formatAlertMoney(dt.remainingAmount, currency, numberLocale)} remaining.',
          type: 'debt',
        ),
      );
    }
  }

  // 4. Goals behind schedule. A past target date is **not** a "closing soon" alert: the
  // web skips `d < 0` outright, so an overdue goal goes quiet instead of nagging.
  for (final SavingsGoal g in state.savingsGoals) {
    if (g.targetDate.isEmpty || g.target <= 0 || g.current >= g.target) {
      continue;
    }
    final num d = _daysUntil(g.targetDate, now);
    if (d < 0) continue;
    if (d <= _goalSoonDays) {
      final int days = d.toInt();
      alerts.add(
        FinanceAlert(
          id: 'goal-soon-${g.id}',
          severity: 'info',
          title: 'Goal "${g.name}" closes soon',
          detail:
              '${_formatAlertMoney(g.current, currency, numberLocale)} saved of '
              '${_formatAlertMoney(g.target, currency, numberLocale)} with $days day${days == 1 ? '' : 's'} left.',
          type: 'goal',
        ),
      );
    }
  }

  return alerts;
}
