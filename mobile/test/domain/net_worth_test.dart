import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/js_semantics.dart';
import 'package:em_budget/domain/budget_spending.dart';
import 'package:em_budget/domain/net_worth.dart';
import 'package:em_budget/models/entities.dart';
import 'package:em_budget/models/entities_ledger.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/utils.ts`'s net-worth half — 58 cases measured at the `pre-flutter` tag against
/// `parity/fixtures/net-worth.json` (`LOGIC_SPEC.md` §7).
///
/// **Every case drives itself from the fixture's recorded argument list**, which is the
/// point of this file. Until #62 the `budgetSpendingForMonth` and
/// `calculateNetWorth(happy path)` cases recorded `[]` as their input and the scenario
/// lived only in the generator's closure, so the Dart side had to re-invent a ledger state
/// by hand: five cases whose expected answer was not determined by anything in the file,
/// exempted in `PROJECTION_DEBT` as known debt. `parity/fixtures/generate.ts` now records
/// the real arguments and `validate.ts` check 5 fails the unit if the exemption is left
/// behind, so this suite reads `input` verbatim and has no state of its own to assert with.
///
/// The unit is also where the app's **two number coercions** part company. `money.ts`
/// reads a user-typed string with `parseFloat`; `utils.ts` reads the same kind of string
/// with `Number`. `"0x10"` is `-16` to one and `-0` to the other, `"  12abc  "` is `-0`
/// where `parseFloat` would say `-12`, and `"1,250"` settles nothing as a repayment while
/// it would be a real amount in the ledger. Those are fixtures, not opinions.
void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Object?> expectedByName = <String, Object?>{};
  final Map<String, List<Object?>> inputByName = <String, List<Object?>>{};
  final Set<String> consumed = <String>{};

  Object? expected(String name) {
    if (!expectedByName.containsKey(name)) {
      throw StateError('No such fixture case: $name');
    }
    consumed.add(name);
    return expectedByName[name];
  }

  List<Object?> inputOf(String name) => inputByName[name]!;

  List<String> named(String prefix) =>
      fixtureNames.where((String n) => n.startsWith(prefix)).toList();

  /// A fixture `{"__sentinel__": …}` in **either** position. Inside a map, `undefined`
  /// drops the key rather than storing `null`: `l.remainingAmount !== undefined` is false
  /// for an explicit `undefined` exactly as it is for an absent one, and the loan fallback
  /// in `calculateNetWorth` turns on that difference. In argument position `undefined`
  /// becomes `null`, which is what the ports already take for an absent argument.
  Object? deref(Object? raw) {
    if (raw is Map<String, Object?> && raw.containsKey('__sentinel__')) {
      final String sentinel = raw['__sentinel__']! as String;
      switch (sentinel) {
        case 'undefined':
          return _absent;
        case 'NaN':
          return double.nan;
        case 'Infinity':
          return double.infinity;
        case '-Infinity':
          return double.negativeInfinity;
        case '-0':
          return -0.0;
        default:
          throw StateError('Unknown sentinel: $sentinel');
      }
    }
    if (raw is Map<String, Object?>) {
      final Map<String, Object?> out = <String, Object?>{};
      for (final MapEntry<String, Object?> e in raw.entries) {
        final Object? value = deref(e.value);
        if (value != _absent) out[e.key] = value;
      }
      return out;
    }
    if (raw is List<Object?>) {
      return raw.map((Object? v) {
        final Object? value = deref(v);
        return value == _absent ? null : value;
      }).toList();
    }
    return raw;
  }

  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}net-worth.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/utils.ts') {
      throw StateError('net-worth.json is not from src/utils.ts');
    }
    // D7: goldens may only come from the baseline tag.
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'net-worth.json claims generatedFrom ${prov['generatedFrom']}; '
        'fixtures are measured from the pre-flutter tag only',
      );
    }

    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (expectedByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      expectedByName[name] = entry['expected'];
      inputByName[name] = deref(entry['input'])! as List<Object?>;
      fixtureNames.add(name);
    }
    if (fixtureNames.isEmpty) {
      throw StateError('net-worth.json carries no cases');
    }
  }

  loadFixture();

  /// Sentinel-aware on purpose: `-0` and `0` are `==` in Dart and are **different answers**
  /// in the web (`ledgerBalanceEffect(expense, undefined, NaN)` is `-0`), so a plain
  /// `expect(actual, 0)` would pass on either.
  void expectNum(String name, num actual) {
    final Object? want = expected(name);
    if (want is Map<String, Object?> && want.containsKey('__sentinel__')) {
      final String sentinel = want['__sentinel__']! as String;
      expect(
        actual is double,
        isTrue,
        reason: '$name: $actual is not a double',
      );
      switch (sentinel) {
        case 'NaN':
          expect(actual.isNaN, isTrue, reason: name);
        case '-0':
          expect(
            actual.isNegative && actual == 0,
            isTrue,
            reason: '$name: expected negative zero, got $actual',
          );
        case 'Infinity':
          expect(actual, same(double.infinity), reason: name);
        case '-Infinity':
          expect(actual, same(double.negativeInfinity), reason: name);
        default:
          throw StateError('$name: unexpected sentinel $sentinel');
      }
      return;
    }
    expect(actual, want, reason: name);
  }

  Map<String, Object?> wantMap(String name) {
    final Object? want = expected(name);
    if (want is! Map<String, Object?>) {
      throw StateError('$name: golden is not an object: $want');
    }
    return want;
  }

  test('the fixture is src/utils.ts, and every case is replayed below', () {
    // The count is asserted before any case runs, so a regenerated fixture that grows
    // fails here with the unit's name on it rather than leaving five goldens silently
    // unreplayed at the bottom of a green suite.
    expect(fixtureNames.length, 58, reason: 'net-worth.json case count');
  });

  group('calculateNetWorth (:648-701)', () {
    for (final String name in named('calculateNetWorth(')) {
      test(name, () {
        final Map<String, Object?> breakdown = calculateNetWorth(
          inputOf(name).single! as Map<String, Object?>,
        ).toJson();
        final Map<String, Object?> want = wantMap(name);
        expect(
          breakdown.keys.toSet(),
          want.keys.toSet(),
          reason: '$name: key set vs golden $want',
        );
        for (final String key in want.keys) {
          expect(
            breakdown[key],
            want[key],
            reason: '$name.$key: ${breakdown[key]} != ${want[key]}',
          );
        }
      });
    }

    test('a jar and its wallet are the same money, moved', () {
      // Asserted on top of the goldens because the point of `savings` in the sum is the
      // one a "simplified" port drops: funding a jar must not make the household poorer.
      final NetWorthBreakdown one = calculateNetWorth(<String, Object?>{
        'cashAccounts': [
          <String, Object?>{'id': 'a', 'balance': 1000},
        ],
        'savingsGoals': [
          <String, Object?>{'id': 'g', 'current': 400},
        ],
      });
      expect(one.cash, 1000);
      expect(one.savings, 400);
      expect(one.netWorth, 1400);
    });
  });

  group('ledgerBalanceEffect (:588-605)', () {
    for (final String name in named('ledgerBalanceEffect(')) {
      test(name, () {
        final List<Object?> args = inputOf(name);
        expectNum(
          name,
          ledgerBalanceEffect(
            args[0]! as String,
            args.length > 1 ? args[1] : null,
            args.length > 2 ? args[2] : null,
          ),
        );
      });
    }

    test('an unknown type is neither a credit nor a debit', () {
      expect(ledgerBalanceEffect('refund', 'Transfer In', 500), 0);
      expect(ledgerBalanceEffect('', null, 500), 0);
    });
  });

  group('applyGoalAllocation (:616-630)', () {
    for (final String name in named('applyGoalAllocation(')) {
      test(name, () {
        final List<Object?> args = inputOf(name);
        final ({num committed, num goal, num wallet})? moved =
            applyGoalAllocation(args[0], args[1], args[2]);
        final Object? want = expected(name);
        if (want == null) {
          expect(moved, isNull, reason: '$name: expected no movement');
          return;
        }
        final Map<String, Object?> wantObj = want as Map<String, Object?>;
        expect(moved, isNotNull, reason: '$name: golden is $wantObj');
        expect(
          <String>{'committed', 'goal', 'wallet'},
          wantObj.keys.toSet(),
          reason: '$name: key set vs golden $wantObj',
        );
        expect(
          moved!.committed,
          wantObj['committed'],
          reason: '$name.committed',
        );
        expect(moved.goal, wantObj['goal'], reason: '$name.goal');
        expect(moved.wallet, wantObj['wallet'], reason: '$name.wallet');
      });
    }

    test('the two sides move equal and opposite', () {
      // The invariant the comment at `:607-614` claims: funding a jar cannot create or
      // destroy the difference, so `goal - start == -(wallet - start)` for every move the
      // function agrees to make.
      final ({num committed, num goal, num wallet})? up = applyGoalAllocation(
        1000,
        5000,
        400,
      );
      expect(up!.goal - 1000, 400);
      expect(up.wallet - 5000, -400);
    });
  });

  group('applyRepayment (:641-646)', () {
    for (final String name in named('applyRepayment(')) {
      test(name, () {
        final List<Object?> args = inputOf(name);
        final ({num applied, num remaining}) settled = applyRepayment(
          args[0],
          args[1],
        );
        final Map<String, Object?> want = wantMap(name);
        expect(
          <String>{'applied', 'remaining'},
          want.keys.toSet(),
          reason: '$name: key set vs golden $want',
        );
        expect(settled.applied, want['applied'], reason: '$name.applied');
        expect(settled.remaining, want['remaining'], reason: '$name.remaining');
      });
    }

    test('over-paying settles the debt and loses the rest, on both sides', () {
      // `applied + remaining == owed` is what keeps a later row deletion restoring
      // exactly what was settled; the surplus vanishing is the price of that.
      for (final List<num> pair in <List<num>>[
        <num>[10000, 15000],
        <num>[10000, 10000],
        <num>[-1000, 500],
      ]) {
        final ({num applied, num remaining}) r = applyRepayment(
          pair[0],
          pair[1],
        );
        expect(
          r.applied + r.remaining,
          pair[0] < 0 ? 0 : pair[0],
          reason: '${pair[0]} owed, ${pair[1]} asked',
        );
      }
    });
  });

  group('isSpendingRow (budget_spending.dart)', () {
    for (final String name in named('isSpendingRow(')) {
      test(name, () {
        final Transaction row = Transaction.fromJson(
          inputOf(name).single! as Map<String, Object?>,
        );
        expect(
          isSpendingRow(row),
          expected(name),
          reason: '$name: ${inputOf(name).single}',
        );
      });
    }
  });

  group('budgetSpendingForMonth (:554-579)', () {
    for (final String name in named('budgetSpendingForMonth(')) {
      test(name, () {
        final List<Object?> args = inputOf(name);
        final ({num spent, List<BudgetSpendingItem> items}) result =
            budgetSpendingForMonth(
              args[0]! as String,
              (args[1]! as List<Object?>)
                  .map(
                    (Object? t) =>
                        Transaction.fromJson(t! as Map<String, Object?>),
                  )
                  .toList(),
              (args[2]! as List<Object?>)
                  .map(
                    (Object? s) =>
                        Subscription.fromJson(s! as Map<String, Object?>),
                  )
                  .toList(),
              args[3]! as int,
            );
        final Map<String, Object?> want = wantMap(name);
        expect(
          <String>{'spent', 'items'},
          want.keys.toSet(),
          reason: '$name: key set vs golden $want',
        );
        expect(result.spent, want['spent'], reason: '$name.spent');

        final List<Object?> wantItems = want['items']! as List<Object?>;
        expect(
          result.items.length,
          wantItems.length,
          reason: '$name: item count',
        );
        for (int i = 0; i < wantItems.length; i++) {
          final Map<String, Object?> wantItem =
              wantItems[i]! as Map<String, Object?>;
          final BudgetSpendingItem got = result.items[i];
          expect(
            <String>{'name', 'spent'},
            wantItem.keys.toSet(),
            reason: '$name.items[$i]: key set',
          );
          expect(got.name, wantItem['name'], reason: '$name.items[$i].name');
          expect(got.spent, wantItem['spent'], reason: '$name.items[$i].spent');
        }
      });
    }

    test('the pinned instant is two days out, in every zone the CI leg runs', () {
      // Three of the four transactions in these cases are dated `2026-10-02` against a
      // pinned `2026-10-04T04:30Z`, i.e. never across a month boundary in Asia/Colombo,
      // America/New_York or Pacific/Kiritimati. That is why the spending half of this
      // file does not need the `dates_local_test.dart` zone dance: the answer it asserts
      // is the same in all three, and `2026-01-01` is not in October anywhere.
      const int pinned = 1791088200000;
      final DateTime day = DateTime.fromMillisecondsSinceEpoch(pinned);
      expect(day.month, 10);
      expect(day.year, 2026);
    });
  });

  test('every recorded case was consumed', () {
    final List<String> left = fixtureNames
        .where((String n) => !consumed.contains(n))
        .toList();
    expect(left, isEmpty, reason: 'unplayed goldens: ${left.join(', ')}');
  });

  test('the two coercions the port splits are the two the web splits', () {
    // Not a golden — a guard on this file's own claim, read from `js_semantics.dart`.
    // If `jsToNumber` were ever swapped for `jsParseFloat` the goldens above would fail,
    // but this names the difference instead of leaving it in a comment.
    expect(jsToNumber('0x10'), 16);
    expect(jsParseFloat('0x10'), 0);
    expect(jsToNumber('  12abc  ').isNaN, isTrue);
    expect(jsParseFloat('  12abc  '), 12);
    // The one the doc-comment in `js_semantics.dart` names: `1` (→ Rs 1 through
    // `toMinorUnits`) to `money.ts`, nothing at all to `utils.ts`.
    expect(jsToNumber('1,250').isNaN, isTrue);
    expect(jsParseFloat('1,250'), 1);
  });
}

/// The stand-in for a key the web would read as `undefined`, kept distinct from `null`
/// because `Number(null)` is `0` and `Number(undefined)` is `NaN`.
const Object _absent = Object();
