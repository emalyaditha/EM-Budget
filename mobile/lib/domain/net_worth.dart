import 'dart:math' as math;

import '../data/js_semantics.dart';
import 'money.dart';

/// The net-worth half of `src/utils.ts` at the `pre-flutter` tag: `calculateNetWorth`
/// (`:648-701`), `ledgerBalanceEffect` (`:588-605`), `applyGoalAllocation` (`:616-630`)
/// and `applyRepayment` (`:641-646`), replayed against `parity/fixtures/net-worth.json`
/// (52 cases, `LOGIC_SPEC.md` §7).
///
/// `isSpendingRow` and `budgetSpendingForMonth` — the other two units in that fixture —
/// are in `budget_spending.dart`, because `alerts.dart` calls them and could not be
/// ported without them. Same file boundary note as there: the fixture is one file, the
/// port is two, and the goldens do not care.
///
/// **The input is a JSON map, not the typed state.** `calculateNetWorth(Partial<AppState>)`
/// is called with whatever the browser currently holds, and `src/types.ts` declares every
/// field it reads as required, which means the function's `|| []` and `!== undefined`
/// guards exist for *data*, not for code: rows that came out of `ledger_states.state` JSON.
/// A Dart `Map` is the only shape that keeps the two distinct — see the loan fallback
/// below — so the port sits at the JSON boundary and the app feeds it `state.toJson()`.
///
/// The arithmetic is deliberately not all `money.dart`: `src/utils.ts` mixes cents
/// (`sumMoney`, `subtractMoney`, `toMinorUnits`) with bare `-` and `Math.abs`, and bare
/// operators coerce with **`Number`** while the cents paths coerce with **`parseFloat`**.
/// Both coercions are load-bearing in this file and they disagree on `"1,250"`, so they
/// are called by their ported twins ([jsToNumber] and [_amount]) rather than merged.

/// `calculateNetWorth`'s return — `NetWorthBreakdown` (`src/types.ts`), eight numbers.
final class NetWorthBreakdown {
  const NetWorthBreakdown({
    required this.cash,
    required this.debitCards,
    required this.creditCardAssets,
    required this.creditCardLiabilities,
    required this.savings,
    required this.debts,
    required this.loansGiven,
    required this.netWorth,
  });

  final num cash;
  final num debitCards;
  final num creditCardAssets;
  final num creditCardLiabilities;
  final num savings;
  final num debts;
  final num loansGiven;
  final num netWorth;

  Map<String, Object?> toJson() => <String, Object?>{
    'cash': asJsonSafeNumber(cash),
    'debitCards': asJsonSafeNumber(debitCards),
    'creditCardAssets': asJsonSafeNumber(creditCardAssets),
    'creditCardLiabilities': asJsonSafeNumber(creditCardLiabilities),
    'savings': asJsonSafeNumber(savings),
    'debts': asJsonSafeNumber(debts),
    'loansGiven': asJsonSafeNumber(loansGiven),
    'netWorth': asJsonSafeNumber(netWorth),
  };
}

/// A ledger value as a cents path will read it, without the `× 100` and rounding that
/// [toMinorUnits] applies — so handing this to [sumMoney] is the same answer as handing
/// it the raw JSON value. Checked against all four shapes a ledger value can be: a `num`
/// passes through, a `String` takes `parseFloat` (which `toMinorUnits` would do anyway),
/// `null` lands on `0`, and anything else lands on `NaN`, which `toMinorUnits` also
/// turns into `0`.
num _amount(Object? value) => value is num
    ? value
    : (value is String
          ? jsParseFloat(value)
          : (value == null ? 0 : double.nan));

/// `state.cashAccounts || []` and its four siblings. A collection that is absent or
/// `null` reads as empty; a truthy non-list is outside the web's own type and would throw
/// inside `.filter`, which is what the cast does here.
List<Object?> _rows(Object? collection) =>
    collection == null ? const <Object?>[] : collection as List<Object?>;

Map<String, Object?> _row(Object? value) => value! as Map<String, Object?>;

/// `calculateNetWorth` (`src/utils.ts:648-701`).
NetWorthBreakdown calculateNetWorth(Map<String, Object?> state) {
  final List<Object?> cashAccounts = _rows(state['cashAccounts']);
  final List<Object?> cards = _rows(state['cards']);
  final List<Object?> debts = _rows(state['debts']);
  final List<Object?> loansGiven = _rows(state['loansGiven']);
  final List<Object?> savingsGoals = _rows(state['savingsGoals']);

  final num cash = sumMoney(
    cashAccounts.map((Object? row) => _amount(_row(row)['balance'])).toList(),
  );

  final num debitCards = sumMoney(
    cards
        .where(
          (Object? row) =>
              !jsTruthy(_row(row)['isCanceled']) &&
              _row(row)['cardType'] == 'Debit',
        )
        .map((Object? row) {
          final Map<String, Object?> card = _row(row);
          // Bare `-`, so `Number` on both sides. `Number(lockedAmount) || 0` means an
          // unparseable lock is ignored rather than poisoning the wallet: `'abc'` and
          // `null` both cost nothing, while `'5000'` costs 5,000.
          final num locked = jsToNumber(card['lockedAmount']);
          return jsToNumber(card['currentBalance']) -
              (jsTruthy(locked) ? locked : 0);
        })
        .toList(),
  );

  final List<Object?> creditCards = cards
      .where(
        (Object? row) =>
            !jsTruthy(_row(row)['isCanceled']) &&
            _row(row)['cardType'] == 'Credit',
      )
      .toList();

  final num creditCardLiabilities = sumMoney(
    creditCards
        .where((Object? row) => jsToNumber(_row(row)['currentBalance']) < 0)
        .map((Object? row) => jsToNumber(_row(row)['currentBalance']).abs())
        .toList(),
  );

  final num creditCardAssets = sumMoney(
    creditCards
        .where((Object? row) => jsToNumber(_row(row)['currentBalance']) > 0)
        .map((Object? row) => _amount(_row(row)['currentBalance']))
        .toList(),
  );

  final num debtsAmount = sumMoney(
    debts.map((Object? row) => _amount(_row(row)['remainingAmount'])).toList(),
  );

  final num loansGivenAmount = sumMoney(
    loansGiven.map((Object? row) {
      final Map<String, Object?> loan = _row(row);
      // `l.remainingAmount !== undefined ? l.remainingAmount : l.totalAmount`
      // (`src/utils.ts:673`). `null` is **not** `undefined`: a loan that stores `null`
      // contributes nothing and does not fall back to its original size — measured,
      // `net-worth.json` case `calculateNetWorth(loan remainingAmount null (no
      // fallback))`, where the loan is worth 0 against a `totalAmount` of 500. Only key
      // presence can tell the two apart, which is why this reads the JSON map rather
      // than a model that has already collapsed both to one value.
      return _amount(
        loan.containsKey('remainingAmount')
            ? loan['remainingAmount']
            : loan['totalAmount'],
      );
    }).toList(),
  );

  // A savings jar is money the owner still has — funding one moves it out of the wallet,
  // so leaving it out would report a household that got poorer by every allocation it
  // made. `g.current || 0` is `jsTruthy`, so an empty jar and a jar with no `current`
  // key are both `0` and the case name `jar at 0 vs jar undefined` exists to prove the
  // port does not distinguish them either.
  final num savings = sumMoney(
    savingsGoals.map((Object? row) {
      final Object? current = _row(row)['current'];
      return _amount(jsTruthy(current) ? current : 0);
    }).toList(),
  );

  final num netWorth = sumMoney(<num>[
    cash,
    debitCards,
    creditCardAssets,
    savings,
    loansGivenAmount,
    -creditCardLiabilities,
    -debtsAmount,
  ]);

  return NetWorthBreakdown(
    cash: cash,
    debitCards: debitCards,
    creditCardAssets: creditCardAssets,
    creditCardLiabilities: creditCardLiabilities,
    savings: savings,
    debts: debtsAmount,
    loansGiven: loansGivenAmount,
    netWorth: netWorth,
  );
}

/// `ledgerBalanceEffect` (`src/utils.ts:588-605`) — the signed effect one ledger row has
/// on the account it names.
///
/// `Math.abs(Number(amount) || 0)` is the whole function's money handling, and it is the
/// reason two of the goldens are **negative zero**: an expense whose amount will not
/// parse (`"abc"`, `NaN`) has magnitude `0`, and `-0` is what the subtraction of a zero
/// magnitude produces in V8. Dart's `==` cannot see that (`-0.0 == 0.0` is true), so the
/// fixture records `{"__sentinel__": "-0"}` and the replay asserts `isNegative`.
///
/// A transfer is the one type whose stored sign carries meaning, so its direction comes
/// from the category it was created with — an exact `'Transfer In'`, case-sensitive: the
/// lowercase `'transfer in'` golden is `-500`, i.e. the outbound leg.
num ledgerBalanceEffect(String type, Object? category, Object? amount) {
  final num coerced = jsToNumber(amount);
  final double magnitude = (jsTruthy(coerced) ? coerced : 0).toDouble().abs();
  return switch (type) {
    'income' || 'deposit' || 'financing' => magnitude,
    'expense' ||
    'debt_payment' ||
    'withdrawal' ||
    'credit_card_charge' => -magnitude,
    'transfer' => category == 'Transfer In' ? magnitude : -magnitude,
    _ => 0,
  };
}

/// `applyGoalAllocation` (`src/utils.ts:616-630`) — how moving money between a wallet and
/// a savings jar changes both sides, or `null` when nothing would move.
///
/// The clamp is `Math.max(-jarCents, requestedCents)`: a jar cannot hand back more than it
/// holds, and the clamp happens **before** the wallet is credited, not after. A `NaN`
/// amount never reaches that clamp, because `toMinorUnits` has already turned it into `0`
/// and `0` is the "nothing moves" answer — the golden `applyGoalAllocation(NaN amount)` is
/// `null`, not an object full of `NaN`.
({num committed, num goal, num wallet})? applyGoalAllocation(
  Object? goalCurrent,
  Object? walletBalance,
  Object? amount,
) {
  final num jarCents = toMinorUnits(goalCurrent);
  final num requestedCents = toMinorUnits(amount);
  final num committed = math.max(-jarCents, requestedCents) / 100;
  if (committed == 0) return null;
  return (
    committed: committed,
    goal: (jarCents + toMinorUnits(committed)) / 100,
    wallet: subtractMoney(_amount(walletBalance), committed),
  );
}

/// `applyRepayment` (`src/utils.ts:641-646`) — what a repayment actually settles.
///
/// Both sides clamp at zero and the applied amount is the smaller of the two, so the
/// surplus a user typed simply vanishes rather than being invented elsewhere;
/// `remaining` then goes through cents. `Math.min` and `Math.max` here see no `NaN` (both
/// operands were clamped through `Number(x) || 0` first), so Dart's `math.min` is exact.
({num applied, num remaining}) applyRepayment(
  Object? outstanding,
  Object? requested,
) {
  final num owedNumber = jsToNumber(outstanding);
  final num askedNumber = jsToNumber(requested);
  final num owed = math.max(0, jsTruthy(owedNumber) ? owedNumber : 0);
  final num asked = math.max(0, jsTruthy(askedNumber) ? askedNumber : 0);
  final num applied = math.min(asked, owed);
  return (applied: applied, remaining: subtractMoney(owed, applied));
}
