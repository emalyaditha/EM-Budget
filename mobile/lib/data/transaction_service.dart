/// `src/services/transactionService.ts` — the read-side query helpers the Ledger
/// Registry and Reports screens use.
///
/// Ported as three pure functions over the same inputs, with the JavaScript
/// semantics made explicit rather than trusted:
/// - the amount branch of the search filter compares against
///   `Number.prototype.toString()`, not Dart's (`jsNumberToString`);
/// - the date/id tie-breaks use `localeCompare`, not `compareTo`
///   (`jsLocaleCompare`);
/// - `Array.prototype.sort` is stable in JavaScript and **not** stable in Dart
///   (`INVENTORY.md` §5.7), so the comparison is index-decorated to be provably
///   stable rather than relying on an undocumented tie order;
/// - `getMonthlyTotals` sums with plain float `+` and never touches `money.ts`
///   (`INVENTORY.md` §4, bug B-04), so it is ported as a float sum, not cents.
library;

import '../models/entities.dart';
import 'js_semantics.dart';

/// `transactionService` (`src/services/transactionService.ts:3-77`).
abstract final class TransactionService {
  /// `getFilteredTransactions` (`:4-25`). The four filters are ANDed; each one is
  /// skipped by its own sentinel, and only the search is case-folded.
  ///
  /// The amount is matched against the **un-lowered** query, as the web does:
  /// searching `"20000"` matches a `20000.0` amount, while searching `"ABC"` can
  /// never match one.
  static List<Transaction> getFilteredTransactions(
    List<Transaction> transactions, {
    String searchQuery = '',
    String categoryFilter = 'all',
    String typeFilter = 'all',
    String accountFilter = 'all',
  }) {
    final String needle = searchQuery.toLowerCase();
    return transactions
        .where((Transaction tx) {
          final bool matchesSearch =
              searchQuery.isEmpty ||
              tx.title.toLowerCase().contains(needle) ||
              tx.category.toLowerCase().contains(needle) ||
              jsNumberToString(tx.amount).contains(searchQuery);

          final bool matchesCategory =
              categoryFilter == 'all' || tx.category == categoryFilter;
          final bool matchesType = typeFilter == 'all' || tx.type == typeFilter;
          // An account filter reaches a transfer from either end, so it tests the
          // destination as well as the source.
          final bool matchesAccount =
              accountFilter == 'all' ||
              tx.accountId == accountFilter ||
              tx.targetAccountId == accountFilter;

          return matchesSearch &&
              matchesCategory &&
              matchesType &&
              matchesAccount;
        })
        .toList(growable: false);
  }

  /// `sortTransactionsByDate` (`:27-55`). Returns a new list, as the web spreads
  /// the input first.
  ///
  /// Four levels: the timestamp hunt, then the `date` string, then the numeric part
  /// of the id, then the id itself — and each level flips with the order, so `asc`
  /// is exactly the reverse comparator, not a reversed output.
  static List<Transaction> sortTransactionsByDate(
    List<Transaction> transactions, {
    String order = 'desc',
  }) {
    final bool desc = order != 'asc';
    final List<int> indexes = List<int>.generate(
      transactions.length,
      (int i) => i,
    );
    indexes.sort((int a, int b) {
      final int byKey = _compare(transactions[a], transactions[b], desc);
      // The stability the web gets from `Array.prototype.sort`, made explicit:
      // equal elements keep their input order instead of Dart's unspecified one.
      return byKey != 0 ? byKey : a.compareTo(b);
    });
    return indexes.map((int i) => transactions[i]).toList(growable: false);
  }

  static int _compare(Transaction a, Transaction b, bool desc) {
    final int timeA = _timestampOf(a);
    final int timeB = _timestampOf(b);
    if (timeA != timeB) return desc ? timeB - timeA : timeA - timeB;

    final int dateCompare = jsLocaleCompare(b.date, a.date);
    if (dateCompare != 0) return desc ? dateCompare : -dateCompare;

    final int? aNum = jsDigitParse(a.id);
    final int? bNum = jsDigitParse(b.id);
    if (aNum != null && bNum != null && aNum != bNum) {
      return desc ? bNum - aNum : aNum - bNum;
    }

    final int idCompare = jsLocaleCompare(b.id, a.id);
    return desc ? idCompare : -idCompare;
  }

  /// `getTimestamp` inside the comparator (`:29-34`). `null` for an unparseable
  /// value is JavaScript's `isNaN(time)` branch, which yields `0`.
  static int _timestampOf(Transaction tx) {
    final Object? raw = jsFirstTruthy(<Object?>[
      tx.updatedAt,
      tx.createdAt,
      tx.date,
    ]);
    if (raw == null) return 0;
    return jsDateToEpochMs(raw) ?? 0;
  }

  /// `getMonthlyTotals` (`:57-76`) — the current calendar month **on the device**,
  /// which is what the web means: `new Date('2026-10-01')` is UTC midnight while
  /// `.getMonth()` is local, so a browser west of Greenwich files a 1 October
  /// transaction in September. The phone inherits the same dependency; it is not
  /// corrected here.
  ///
  /// `netCashFlow` is `income - expense` over the two filtered float sums, so it is
  /// not the balance effect of any transaction and does not use `money.ts` (B-04).
  static MonthlyTotals getMonthlyTotals(
    List<Transaction> transactions, {
    DateTime? now,
  }) {
    final DateTime moment = now ?? DateTime.now();
    final int currentMonth = moment.month;
    final int currentYear = moment.year;

    final List<Transaction> monthly = transactions
        .where((Transaction tx) {
          final int? ms = jsDateToEpochMs(tx.date);
          if (ms == null) return false;
          // `Invalid Date` makes `getMonth()` `NaN`, which matches nothing — the web's
          // `d.getMonth() === currentMonth` is false for a bad date.
          final DateTime local = DateTime.fromMillisecondsSinceEpoch(ms);
          return local.month == currentMonth && local.year == currentYear;
        })
        .toList(growable: false);

    num income = 0;
    for (final Transaction tx in monthly) {
      if (tx.type == 'income' || tx.type == 'deposit') {
        income = income + tx.amount;
      }
    }
    num expense = 0;
    for (final Transaction tx in monthly) {
      if (tx.type == 'expense' ||
          tx.type == 'credit_card_charge' ||
          tx.type == 'withdrawal') {
        expense = expense + tx.amount;
      }
    }
    return MonthlyTotals(
      income: income,
      expense: expense,
      netCashFlow: income - expense,
    );
  }
}

/// The record `getMonthlyTotals` returns. `num`, not cents — see the note on B-04
/// above; a golden that compares this to a `money.ts` total will not agree, and
/// that is the web's behaviour, not the port's.
final class MonthlyTotals {
  const MonthlyTotals({
    required this.income,
    required this.expense,
    required this.netCashFlow,
  });

  final num income;
  final num expense;
  final num netCashFlow;

  Map<String, Object?> toJson() => <String, Object?>{
    'income': income,
    'expense': expense,
    'netCashFlow': netCashFlow,
  };

  @override
  bool operator ==(Object other) =>
      other is MonthlyTotals &&
      other.income == income &&
      other.expense == expense &&
      other.netCashFlow == netCashFlow;

  @override
  int get hashCode => Object.hash(income, expense, netCashFlow);

  @override
  String toString() =>
      'MonthlyTotals(income: $income, expense: $expense, netCashFlow: $netCashFlow)';
}
