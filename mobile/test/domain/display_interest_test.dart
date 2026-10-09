import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/js_semantics.dart';
import 'package:em_budget/domain/credit_cards.dart';
import 'package:em_budget/domain/display_interest.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// B-03 replayed against `parity/fixtures/display-interest.json` — 24 cases, twelve
/// inputs each run through the **display** function and paired against the **engine**.
///
/// The golden for the display side is not hand-written and was not re-implemented: the
/// generator extracted `calculateInterest`'s five source lines from the
/// `CreditCardManagement.tsx` blob at the `pre-flutter` tag, checked them against a
/// pinned hash, and evaluated them verbatim. The guards below re-state that provenance,
/// because a fixture whose "original" is a string in the generator is only as trustworthy
/// as the string — and the whole point of B-03 is that nobody should be able to quietly
/// align the UI figure with the charged one.
///
/// `undefined` APR is the one input a Dart signature cannot carry. It collapses to `NaN`
/// here, which is provably behaviour-preserving for this unit: on the display side
/// `undefined <= 0` is `false` and `undefined / 100 / 365` is `NaN`; on the engine side
/// `!(undefined > 0)` is `true` and `!(NaN > 0)` is `true`. Both paths give both functions
/// the same answer, and a test below asserts exactly that rather than assuming it.
void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Object?> expectedByName = <String, Object?>{};
  final Map<String, List<Object?>> inputByName = <String, List<Object?>>{};
  late final Map<String, Object?> prov;

  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}display-interest.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    prov = root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/components/CreditCardManagement.tsx') {
      throw StateError(
        'display-interest.json is not from CreditCardManagement.tsx; '
        'the display figure does not live in lib/creditCards.ts',
      );
    }
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'display-interest.json claims generatedFrom ${prov['generatedFrom']}; '
        'fixtures are measured from the pre-flutter tag only',
      );
    }
    // The extracted text is the contract. If the tag's function ever changes shape, this
    // fails before any of the 24 goldens can be replayed against a different body.
    final Map<String, Object?> extraction =
        prov['extraction']! as Map<String, Object?>;
    if (extraction['extractedSource'] != _webSource) {
      throw StateError(
        'display-interest.json extracted a different body than this port mirrors:\n'
        '${extraction['extractedSource']}',
      );
    }
    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (expectedByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      if (!name.startsWith('calculateInterest(') &&
          !name.startsWith('pair: engine vs display (')) {
        throw StateError(
          'display-interest.json carries an unknown case: $name',
        );
      }
      expectedByName[name] = entry['expected'];
      inputByName[name] = entry['input']! as List<Object?>;
      fixtureNames.add(name);
    }
    if (fixtureNames.length != 24) {
      throw StateError(
        'display-interest.json carries ${fixtureNames.length} cases, not the 24 '
        '(12 inputs × display + pair) that the generator writes',
      );
    }
  }

  loadFixture();

  List<num> argsOf(String name) =>
      inputByName[name]!.take(3).map(_derefNum).toList();

  void replay(String name) {
    final List<num> args = argsOf(name);
    if (name.startsWith('pair:')) {
      final num display = displayInterest(args[0], args[1], args[2]);
      final num engine = interestForCycle(args[0], args[1], args[2]);
      expect(
        <String, Object?>{
          'displayUnrounded': display,
          'engineRounded': engine,
          'differs': jsStrictNotEqual(display, engine),
        },
        equals(_derefExpected(expectedByName[name])),
        reason: name,
      );
    } else {
      expect(
        displayInterest(args[0], args[1], args[2]),
        equals(_derefExpected(expectedByName[name])),
        reason: name,
      );
    }
  }

  group('display-interest against its golden', () {
    for (final String name in fixtureNames) {
      test(name, () => replay(name));
    }
  });

  group('the two divergences that B-03 is about', () {
    test(
      'the display figure is the engine figure before the cent rounding',
      () {
        const num balance = -38420;
        const num apr = 24.9;
        const num days = 30;
        expect(displayInterest(balance, apr, days), 786.2942465753425);
        expect(interestForCycle(balance, apr, days), 786.29);
        expect(
          jsMathRound(displayInterest(balance, apr, days) * 100) / 100,
          interestForCycle(balance, apr, days),
        );
      },
    );

    test(
      'a negative day count is a negative amount on screen and 0 in the ledger',
      () {
        expect(displayInterest(-38420, 24.9, -1), -26.209808219178083);
        expect(interestForCycle(-38420, 24.9, -1), 0);
        expect(displayInterest(-38420, 24.9, 0), 0);
        expect(interestForCycle(-38420, 24.9, 0), 0);
      },
    );

    test('the APR guards are negations of different comparisons', () {
      // `apr <= 0` vs `!(apr > 0)` — identical for every real number, opposite for NaN.
      expect(displayInterest(-1000, double.nan, 30), isNaN);
      expect(interestForCycle(-1000, double.nan, 30), 0);
      expect(displayInterest(-1000, 0, 30), 0);
      expect(interestForCycle(-1000, 0, 30), 0);
    });

    test('collapsing undefined to NaN cannot change either result', () {
      // Not an assumption — a measurement. The generator ran both inputs, and the web's
      // own answers for them are the same golden, so the Dart signature may carry `NaN`
      // where the web carried `undefined`.
      expect(
        _derefExpected(
          expectedByName['calculateInterest(-1000,undefined,30) [display]'],
        ),
        equals(
          _derefExpected(
            expectedByName['calculateInterest(-1000,NaN,30) [display]'],
          ),
        ),
      );
      expect(
        _derefExpected(
          expectedByName['pair: engine vs display (-1000,undefined,30)'],
        ),
        equals(
          _derefExpected(
            expectedByName['pair: engine vs display (-1000,NaN,30)'],
          ),
        ),
      );
    });

    test('a credit or zero balance is 0 on both sides, including -0', () {
      expect(displayInterest(38420, 24.9, 30), 0);
      expect(displayInterest(0, 24.9, 30), 0);
      expect(displayInterest(-0.0, 24.9, 30), 0);
      expect(interestForCycle(-0.0, 24.9, 30), 0);
      // `-0 >= 0` holds on both engines, so the guard fires and the sign never escapes.
      expect(jsStrictNotEqual(displayInterest(-0.0, 24.9, 30), 0), isFalse);
    });

    test('differs is JS `!==`, which Dart `!=` would get wrong for NaN', () {
      // `pair: engine vs display (NaN,24.9,30)` is the golden that proves it: both sides
      // are NaN, and the web still records `differs: true`.
      expect(jsStrictNotEqual(double.nan, double.nan), isTrue);
      // Dart's own rule is the opposite — `double.nan == double.nan` is `true`, and
      // `0.0 / 0.0 != 0.0 / 0.0` folds to `false` — which is exactly why `!==` needs
      // its own helper instead of `!=`.
      expect(jsStrictNotEqual(-0.0, 0), isFalse);
    });

    test('an exact two-decimal result is the one case where the two agree', () {
      expect(displayInterest(-36500, 36.5, 365), 13322.5);
      expect(interestForCycle(-36500, 36.5, 365), 13322.5);
    });

    test('the call site that exists today cannot reach the NaN probes', () {
      // `calculateInterest(c.currentBalance, c.apr || 0, 30)` — jsTruthy turns an unset
      // APR into 0 before the function sees it, so the UI figure is only ever the
      // rounding difference and the negative-day case. Recorded so a future port that
      // passes `card.apr` raw is recognised as a change, not a refactor.
      expect(jsTruthy(0), isFalse);
      expect(jsTruthy(null), isFalse);
      expect(displayInterest(-38420, 0, 30), 0);
    });
  });
}

/// The exact bytes the generator compiled, from `CreditCardManagement.tsx:67-71`.
const String _webSource =
    'function calculateInterest(balance: number, apr: number, '
    'days: number): number {\n'
    '  if (balance >= 0 || apr <= 0) return 0;\n'
    '  const dailyRate = apr / 100 / 365;\n'
    '  return Math.abs(balance) * dailyRate * days;\n'
    '}';

num _derefNum(Object? raw) {
  if (raw is Map<String, Object?> && raw.containsKey('__sentinel__')) {
    return switch (raw['__sentinel__']) {
      // `undefined` has no `num` representation. The test above shows the web answered
      // it exactly as it answered `NaN`, so the two share one Dart value here.
      'undefined' => double.nan,
      'NaN' => double.nan,
      '-0' => -0.0,
      'Infinity' => double.infinity,
      '-Infinity' => double.negativeInfinity,
      Object? other => throw StateError('Unknown sentinel: $other'),
    };
  }
  if (raw is num) return raw;
  throw StateError('display-interest expects numeric arguments, got $raw');
}

Object? _derefExpected(Object? raw) {
  if (raw is Map<String, Object?>) {
    if (raw.containsKey('__sentinel__')) return _derefNum(raw);
    return <String, Object?>{
      for (final MapEntry<String, Object?> e in raw.entries)
        e.key: _derefExpected(e.value),
    };
  }
  if (raw is List<Object?>) return raw.map(_derefExpected).toList();
  return raw;
}
