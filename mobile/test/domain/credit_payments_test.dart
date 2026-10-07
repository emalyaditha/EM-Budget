import 'dart:convert';
import 'dart:io';

import 'package:em_budget/domain/credit_cards.dart';
import 'package:em_budget/domain/money.dart';
import 'package:em_budget/models/entities.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/lib/creditCards.ts` — the payment half of the cycle engine — replayed against
/// `parity/fixtures/credit-payments.json` (34 cases measured from that file at the
/// `pre-flutter` tag, `LOGIC_SPEC.md` §4).
///
/// The three functions here are the ones that answer "has this card's minimum been
/// met?", and all of them decide it by **comparing `YYYY-MM-DD` strings**, never by
/// parsing them. That is why `paymentsInCycle("2026-9-20")` is `0` while
/// `paymentsInCycle("2026-09-20")` is `5000`: `'2026-9-20' >= '2026-09-07'` is false
/// character by character, so an unpadded date silently falls outside every window. A
/// port that "helpfully" parses the dates would report a paid cycle as unpaid, and a late
/// fee as owed.
///
/// Like `credit_cycles_test.dart`, every group drives itself from the fixture's case names,
/// asserts the count it expects, and the last test asserts every recorded name was
/// consumed.
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

  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}credit-payments.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/lib/creditCards.ts') {
      throw StateError(
        'credit-payments.json is not from src/lib/creditCards.ts',
      );
    }
    // D7: goldens may only come from the baseline tag.
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'credit-payments.json claims generatedFrom ${prov['generatedFrom']}; '
        'fixtures are measured from the pre-flutter tag only',
      );
    }
    // Nothing these three functions return is locale-formatted — that leg belongs to
    // `cycle_rollover_test.dart`, whose late-fee description is.

    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (expectedByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      expectedByName[name] = entry['expected'];
      inputByName[name] = entry['input']! as List<Object?>;
      fixtureNames.add(name);
    }
    if (fixtureNames.isEmpty) {
      throw StateError('credit-payments.json carries no cases');
    }
  }

  loadFixture();

  /// A fixture `{"__sentinel__": …}` in **either** position, so `undefined` inputs become
  /// the port's `null` stand-in and a `NaN` becomes a real `double.nan`.
  Object? deref(Object? raw) {
    if (raw is Map<String, Object?> && raw.containsKey('__sentinel__')) {
      final String sentinel = raw['__sentinel__']! as String;
      switch (sentinel) {
        case 'undefined':
          return null;
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
      return <String, Object?>{
        for (final MapEntry<String, Object?> e in raw.entries)
          e.key: deref(e.value),
      };
    }
    if (raw is List<Object?>) {
      return raw.map(deref).toList();
    }
    return raw;
  }

  /// The recorded `BankCard` row, through the app's own entity reader — the same one a
  /// pulled `bank_cards` row goes through, so a fixture card and a real card take exactly
  /// one path.
  BankCard cardAt(String name, int index) =>
      BankCard.fromJson(deref(inputOf(name)[index])! as Map<String, Object?>);

  List<Transaction> txsAt(String name, int index) =>
      (deref(inputOf(name)[index])! as List<Object?>)
          .cast<Map<String, Object?>>()
          .map(Transaction.fromJson)
          .toList();

  String argString(String name, int index) {
    final Object? value = deref(inputOf(name)[index]);
    if (value is String) return value;
    throw StateError('$name: input[$index] is not a string ($value)');
  }

  String? argStringOpt(String name, int index) {
    final Object? value = deref(inputOf(name)[index]);
    if (value == null) return null;
    if (value is String) return value;
    throw StateError(
      '$name: input[$index] is neither a string nor undefined ($value)',
    );
  }

  /// Sentinel-aware, as `credit_cycles_test.dart` explains: `expect(-0.0, 0)` passes in
  /// Dart because `==` ignores the sign bit.
  void expectNum(String name, num actual) {
    final Object? want = expected(name);
    if (want is Map<String, Object?> && want.containsKey('__sentinel__')) {
      final String sentinel = want['__sentinel__']! as String;
      switch (sentinel) {
        case 'NaN':
          expect(actual.isNaN, isTrue, reason: name);
        case 'Infinity':
          expect(actual, same(double.infinity), reason: name);
        case '-Infinity':
          expect(actual, same(double.negativeInfinity), reason: name);
        case '-0':
          expect(
            actual.isNegative && actual == 0,
            isTrue,
            reason: '$name: expected negative zero, got $actual',
          );
        default:
          throw StateError('$name: unexpected sentinel $sentinel');
      }
      return;
    }
    expect(actual, want, reason: name);
  }

  group('paymentsInCycle', () {
    test('every recorded payment date against the [window start, due date] string range', () {
      final List<String> cases = named('paymentsInCycle(');
      expect(cases, hasLength(18));
      for (final String name in cases) {
        final List<Transaction> txs = txsAt(name, 0);
        final String cardId = argString(name, 1);
        final String dueDate = argString(name, 2);
        final String? anchor = inputOf(name).length > 3
            ? argStringOpt(name, 3)
            : null;
        expectNum(name, paymentsInCycle(txs, cardId, dueDate, anchor));
      }
    });

    test('the due date is inside the window and the day after is not', () {
      // Stated as a fact, because "inclusive of the deadline" is the part a reviewer
      // reads as an off-by-one. The web's own comment calls the due date the last day of
      // the cycle.
      final List<Transaction> one = txsAt('paymentsInCycle([2026-10-07])', 0);
      expect(paymentsInCycle(one, 'cc-1', '2026-10-07'), 5000);
      expect(paymentsInCycle(one, 'cc-1', '2026-10-06'), 0);
    });

    test('an unpadded date is outside every window, silently', () {
      // The trap this group exists to pin: `'2026-9-20'` is a valid-looking date that
      // lexicographic comparison puts *before* `'2026-09-07'`.
      final List<Transaction> one = txsAt('paymentsInCycle([2026-9-20])', 0);
      expect(paymentsInCycle(one, 'cc-1', '2026-10-07'), 0);
    });
  });

  group('isMinimumSatisfied', () {
    test('every recorded card and payment', () {
      final List<String> cases = named('isMinimumSatisfied(');
      expect(cases, hasLength(9));
      for (final String name in cases) {
        expect(
          isMinimumSatisfied(cardAt(name, 0), txsAt(name, 1)),
          expected(name),
          reason: name,
        );
      }
    });

    test('the bank deduction on the 15th counts even though it is outside the window', () {
      // `hasDeductionPayment` is the second, separate route to `true`: the automatic
      // debit lands on the deduction day, after the due date that closes the manual
      // window, so `paymentsInCycle` alone would call the card unpaid and fine it.
      final BankCard card = cardAt('isMinimumSatisfied(deduction)', 0);
      final List<Transaction> txs = txsAt('isMinimumSatisfied(deduction)', 1);
      expect(paymentsInCycle(txs, card.id, '2026-10-07'), 0);
      expect(isMinimumSatisfied(card, txs), isTrue);
    });

    test('an unset or zero minimum is never "satisfied"', () {
      // `!minPayment || minPayment <= 0` returns `false`, not `true` — "nothing is owed"
      // is not what the UI tick means here, and the golden measures both halves.
      expect(
        isMinimumSatisfied(
          cardAt('isMinimumSatisfied(min-zero)', 0),
          const <Transaction>[],
        ),
        isFalse,
      );
      expect(
        isMinimumSatisfied(
          cardAt('isMinimumSatisfied(min-unset)', 0),
          const <Transaction>[],
        ),
        isFalse,
      );
    });
  });

  group('maybeRollCard', () {
    test('every recorded payment amount', () {
      final List<String> cases = named('maybeRollCard(');
      expect(cases, hasLength(7));
      for (final String name in cases) {
        final BankCard card = cardAt(name, 0);
        final List<Transaction> txs = txsAt(name, 1);
        final Object? rawAmount = deref(inputOf(name)[2]);
        // The web types this argument `number`; `"5000"` is a contract probe, and the
        // coercion it provokes happens one level down, inside `toMinorUnits`
        // (`money.dart:37`, which takes `Object?`), not in `maybeRollCard`'s own
        // `newBalance >= 0` test. The port's [addMoney] is `num`-typed, so the same
        // coercion is applied here at the boundary rather than a second `addMoney`
        // signature being invented for a value no typed caller can produce.
        final num amount = rawAmount is String
            ? toMinorUnits(rawAmount) / 100
            : rawAmount! as num;
        final RollCardPatch patch = maybeRollCard(card, txs, amount);
        final Map<String, Object?> want =
            expected(name)! as Map<String, Object?>;
        // `{}` and `{dueDate: undefined, minPayment: undefined}` are different payloads:
        // the caller spreads the patch over the card, so the first leaves the deadline
        // alone and the second erases it. Collapsing them into `null` loses one of them,
        // so the golden's key set is asserted, not just a truthy shape.
        expect(
          patch.settles,
          want.containsKey('dueDate'),
          reason: '$name: patch shape vs golden $want',
        );
        if (patch.settles) {
          expect(
            want.keys,
            unorderedEquals(<String>['dueDate', 'minPayment']),
            reason: name,
          );
        } else {
          expect(want, isEmpty, reason: name);
        }
      }
    });

    test('a payment that reaches exactly zero clears the cycle, and a NaN never does', () {
      // `>=` on the boundary is the whole distinction, and `NaN >= 0` is `false` — so
      // garbage from a form cannot erase a real due date.
      expect(
        maybeRollCard(
          cardAt('maybeRollCard(-38420+38420,due=true)', 0),
          const <Transaction>[],
          38420,
        ).settles,
        isTrue,
      );
      expect(
        maybeRollCard(
          cardAt('maybeRollCard(-38420+5000,due=true)', 0),
          const <Transaction>[],
          5000,
        ).settles,
        isFalse,
      );
      expect(
        maybeRollCard(
          cardAt('maybeRollCard(-38420+NaN,due=true)', 0),
          const <Transaction>[],
          double.nan,
        ).settles,
        isFalse,
      );
    });

    test('a card with no due date has no cycle to roll', () {
      // `!card.dueDate` returns `{}` *before* the balance is ever read, so settling a
      // debt on an unconfigured card does not touch fields it never had.
      final BankCard card = cardAt('maybeRollCard(-100+100,due=false)', 0);
      expect(card.dueDate, isNull);
      expect(maybeRollCard(card, const <Transaction>[], 100).settles, isFalse);
    });
  });

  test('every case recorded by generate.ts was consumed', () {
    expect(fixtureNames, hasLength(34));
    final List<String> unconsumed = fixtureNames
        .where((String n) => !consumed.contains(n))
        .toList();
    expect(
      unconsumed,
      isEmpty,
      reason:
          '${unconsumed.length} case(s) are in the fixture but not replayed',
    );
  });
}
