import '../data/dates_local.dart';
import '../models/entities.dart';
import '../models/entities_ledger.dart';
import 'money.dart';

/// The spending half of `src/utils.ts` at the `pre-flutter` tag: `isSpendingRow` and
/// `budgetSpendingForMonth`.
///
/// `parity/LOGIC_SPEC.md` §7 measures these against `net-worth.json` (three cases), which
/// `task #62` replays; they live here rather than in the net-worth file because
/// `computeAlerts` (`alerts.dart`) calls this one and cannot be ported without it. The
/// goldens are unchanged either way — this is a file boundary, not a fixture boundary.

/// `isSpendingRow` — the one definition of "this row bought something".
///
/// A `withdrawal` is **not** budget spending, and an expense-shaped audit row carrying
/// `0` is not either. The web has five other predicates for "spending" that drifted apart
/// from this one (`LOGIC_SPEC.md` §7); only this is `budgetSpendingForMonth`'s rule.
bool isSpendingRow(Transaction t) => t.type == 'expense' && t.amount > 0;

/// One line of `budgetSpendingForMonth`'s `items` — the web's inline
/// `{ name: string; spent: number }`, kept as a type rather than a map because
/// `alerts.dart` never reads it and the Budgets tab renders it by name.
final class BudgetSpendingItem {
  const BudgetSpendingItem({required this.name, required this.spent});

  final String name;
  final num spent;

  Map<String, Object?> toJson() => <String, Object?>{
    'name': name,
    'spent': spent,
  };
}

/// `budgetSpendingForMonth` (`src/utils.ts:554-579`).
///
/// What a monthly envelope has actually been charged **this month**. Subscriptions are
/// deliberately different: an active one counts in full regardless of any date, because a
/// subscription bills once per cycle and the envelope is the cycle. That asymmetry is
/// measured (`net-worth.json`, `budgetSpendingForMonth(active subs count in full
/// regardless of date)`) and is not a bug to tidy up.
///
/// Dates go through [isInCurrentMonth], i.e. the **local-midnight** regime, so this
/// inherits `LOGIC_SPEC.md` §6's timezone exposure and is one of the two units the
/// three-zone check is about.
({num spent, List<BudgetSpendingItem> items}) budgetSpendingForMonth(
  String category,
  List<Transaction> transactions,
  List<Subscription> subscriptions, [
  int? nowMs,
]) {
  final String wanted = category.toLowerCase().trim();

  final List<Transaction> matchingTx = transactions.where((Transaction t) {
    // `!t.category` in the web is a falsy test on a string, so the empty string — the
    // ported stand-in for an absent title/category (`DATA_SPEC.md` §6) — must not match
    // an empty `wanted` the way `'' === ''` would.
    if (!isSpendingRow(t) || t.category.isEmpty) return false;
    return t.category.toLowerCase().trim() == wanted &&
        isInCurrentMonth(t.date, nowMs: nowMs);
  }).toList();

  final List<Subscription> matchingSubs = subscriptions.where((Subscription s) {
    if (s.status != 'Active' || s.category.isEmpty) return false;
    return s.category.toLowerCase().trim() == wanted;
  }).toList();

  return (
    spent: sumMoney(<num>[
      ...matchingTx.map((Transaction t) => t.amount),
      ...matchingSubs.map((Subscription s) => s.amount),
    ]),
    items: <BudgetSpendingItem>[
      ...matchingTx.map(
        (Transaction t) => BudgetSpendingItem(
          name: t.title.isEmpty ? 'Transaction spend' : t.title,
          spent: t.amount,
        ),
      ),
      ...matchingSubs.map(
        (Subscription s) => BudgetSpendingItem(
          name: '${s.name} (Subscription)',
          spent: s.amount,
        ),
      ),
    ],
  );
}
