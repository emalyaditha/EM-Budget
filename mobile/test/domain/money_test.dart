import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/number_locale.dart';
import 'package:em_budget/domain/money.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/lib/money.ts` replayed against `parity/fixtures/money.json` — 200 cases
/// measured from that file at the `pre-flutter` tag.
///
/// The suite drives itself from the fixture's own case names (`LOGIC_SPEC.md` §0's
/// name-keyed contract) rather than a list transcribed here, so a case added on the web
/// shows up as an unconsumed name and fails, instead of quietly remaining unported. The
/// last test asserts every recorded name was consumed.
///
/// Where a case cannot be expressed in the ported types the reason is stated at the
/// dispatch, not swallowed: `excludedCases` below is the whole list, and it is empty.
void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Object?> expectedByName = <String, Object?>{};
  final Map<String, List<Object?>> inputByName = <String, List<Object?>>{};
  final Set<String> consumed = <String>{};

  /// Cases the fixture carries that the port has no surface for. Empty on purpose:
  /// `money.ts` is total — every input class is a number, a string, `null` or a
  /// sentinel, and all four are ported.
  const Map<String, String> excludedCases = <String, String>{};

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

  /// The locale `money.json` was measured under, asserted to be `en-US` below and then
  /// injected into every `formatMoney` call.
  ///
  /// This is the whole of the pin: the app formats in the phone's own locale
  /// (`DATA_SPEC.md` §11 D-12), and only a test that has to reproduce a golden names the
  /// locale the golden was taken in. Without the injection these assertions would pass
  /// or fail on the machine that runs them.
  late final JsNumberLocale goldenLocale;

  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}money.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/lib/money.ts') {
      throw StateError('money.json is not from src/lib/money.ts');
    }
    // Every `formatMoney` case in the file is an `en-US` string. A fixture regenerated
    // under another browser locale would silently mean something else, so the locale is
    // read off the provenance and injected rather than assumed.
    if (prov['locale'] != 'en-US') {
      throw StateError(
        'money.json was generated with locale ${prov['locale']}, which this suite '
        'would have to inject instead of en-US',
      );
    }
    goldenLocale = JsNumberLocale.resolve('en-US');

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
    if (fixtureNames.isEmpty) throw StateError('money.json carries no cases');
  }

  loadFixture();

  /// A fixture `{"__sentinel__": …}` in an **input** position: `undefined` is the one
  /// sentinel with a Dart stand-in (`null`, the convention `DATA_SPEC.md` §1 fixes for
  /// absent-versus-null), and `NaN`/`±Infinity`/`-0` are real doubles here.
  Object? inputValue(Object? raw) {
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
          throw StateError('Unknown input sentinel: $sentinel');
      }
    }
    return raw;
  }

  num argNum(String name, int index) {
    final Object? value = inputValue(inputOf(name)[index]);
    if (value is num) return value;
    throw StateError(
      '$name: input[$index] is not a number (${value.runtimeType})',
    );
  }

  Object? argAny(String name, int index) => inputValue(inputOf(name)[index]);

  FormatMoneyOptions argOptions(String name) {
    final Object? raw = inputOf(name).length > 2 ? inputOf(name)[2] : null;
    if (raw == null) return const FormatMoneyOptions();
    final Map<String, Object?> options = raw as Map<String, Object?>;
    return FormatMoneyOptions(
      minFractionDigits: (options['minFractionDigits'] as num?)?.toInt() ?? 0,
      maxFractionDigits: (options['maxFractionDigits'] as num?)?.toInt() ?? 2,
      signed: options['signed'] as bool? ?? false,
    );
  }

  /// An **expected** value asserted against a `num` result, sentinel-aware.
  ///
  /// `-0` is the case that makes this necessary: `expect(-0.0, 0)` passes in Dart
  /// because `==` ignores the sign bit, so a port that lost negative zero would still
  /// be green. The fixture encodes it as a sentinel precisely so the test can demand
  /// the sign.
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
        case 'Infinity':
          expect(
            actual == double.infinity,
            isTrue,
            reason: '$name: expected +Infinity, got $actual',
          );
        case '-Infinity':
          expect(
            actual == double.negativeInfinity,
            isTrue,
            reason: '$name: expected -Infinity, got $actual',
          );
        case '-0':
          expect(
            actual == 0 && (actual as double).isNegative,
            isTrue,
            reason: '$name: expected negative zero, got $actual',
          );
        default:
          throw StateError('$name: unknown expected sentinel $sentinel');
      }
      return;
    }
    expect(actual, want, reason: name);
  }

  group('toMinorUnits', () {
    test('every fixture case', () {
      for (final String name in named('toMinorUnits(')) {
        if (excludedCases.containsKey(name)) continue;
        expectNum(name, toMinorUnits(argAny(name, 0)));
      }
    });
  });

  group('toMajorUnits', () {
    test('every fixture case', () {
      for (final String name in named('toMajorUnits(')) {
        final Object? raw = argAny(name, 0);
        if (raw == null) {
          expect(
            toMajorUnits(null),
            expected(name) as String,
            reason: '$name (null/undefined)',
          );
          consumed.add(name);
          continue;
        }
        if (raw is num) {
          expect(toMajorUnits(raw), expected(name) as String, reason: name);
          consumed.add(name);
          continue;
        }
        throw StateError('$name: cents is neither a number nor absent');
      }
    });

    test('the NaN guard is isNaN, not isFinite', () {
      // `toMajorUnits(NaN)` is `"0.00"` but `toMajorUnits(Infinity)` is `"Infinity"` —
      // the two fall out of one `isNaN` test, and a `isFinite` "improvement" would
      // change what the app prints for a corrupted amount.
      expect(toMajorUnits(double.nan), '0.00');
      expect(toMajorUnits(double.infinity), 'Infinity');
      expect(toMajorUnits(double.negativeInfinity), '-Infinity');
    });
  });

  group('add / subtract / compare', () {
    test('every fixture case', () {
      for (final String name in named('addMoney(')) {
        expectNum(name, addMoney(argNum(name, 0), argNum(name, 1)));
      }
      for (final String name in named('subtractMoney(')) {
        expectNum(name, subtractMoney(argNum(name, 0), argNum(name, 1)));
      }
      for (final String name in named('compareMoney(')) {
        expectNum(name, compareMoney(argNum(name, 0), argNum(name, 1)));
      }
    });
  });

  group('sumMoney', () {
    test('every fixture case', () {
      for (final String name in named('sumMoney(')) {
        final List<Object?> amounts = inputOf(name)[0]! as List<Object?>;
        expectNum(
          name,
          sumMoney(amounts.map((Object? v) => inputValue(v)! as num).toList()),
        );
      }
    });
  });

  group('multiplyMoney', () {
    test('every fixture case', () {
      for (final String name in named('multiplyMoney(')) {
        expectNum(name, multiplyMoney(argNum(name, 0), argNum(name, 1)));
      }
    });
  });

  group('formatMoney', () {
    test('every fixture case', () {
      for (final String name in named("formatMoney(")) {
        final Object? currency = inputOf(name)[0];
        final num amount = inputValue(inputOf(name)[1])! as num;
        expect(
          formatMoney(
            currency! as String,
            amount,
            argOptions(name),
            goldenLocale,
          ),
          expected(name) as String,
          reason: name,
        );
      }
    });

    test('the sign belongs to colour, not to a glyph', () {
      // The default drops it entirely; `signed` puts it before the currency symbol,
      // never before the digits (`LOGIC_SPEC.md` §1).
      expect(
        formatMoney('Rs.', -500, const FormatMoneyOptions(), goldenLocale),
        'Rs.500',
      );
      expect(
        formatMoney(
          'Rs.',
          -500,
          const FormatMoneyOptions(signed: true),
          goldenLocale,
        ),
        '-Rs.500',
      );
      expect(
        formatMoney(
          'Rs.',
          -500,
          const FormatMoneyOptions(minFractionDigits: 2, maxFractionDigits: 2),
          goldenLocale,
        ),
        'Rs.500.00',
      );
    });
  });

  group('the two formatters round differently, and both are pinned', () {
    test('0.015 is 0.01 through toFixed and 0.02 through toLocaleString', () {
      // `toMajorUnits` uses `toFixed`, which rounds on the exact binary value;
      // `formatMoney` uses `toLocaleString`, which rounds on the shortest decimal.
      // One Dart function covering both would move a paisa on screen.
      expect(toMajorUnits(1.5), '0.01');
      expect(
        formatMoney('Rs.', 0.015, const FormatMoneyOptions(), goldenLocale),
        'Rs.0.02',
      );
      expect(toMajorUnits(1250001.5), '12500.01');
      expect(
        formatMoney('Rs.', 12500.015, const FormatMoneyOptions(), goldenLocale),
        'Rs.12,500.02',
      );
      expect(toMajorUnits(100.5), '1.00');
      expect(
        formatMoney('Rs.', 1.005, const FormatMoneyOptions(), goldenLocale),
        'Rs.1.01',
      );
    });

    test(
      'money results that can reach state spell themselves like JSON would',
      () {
        // `addMoney(1, 2)` is the web's `3`, which `JSON.stringify` writes as `3` and
        // Dart would write as `3.0` if the port left it a double (`DATA_SPEC.md` §3).
        expect(addMoney(1, 2), isA<int>());
        expect(sumMoney(<num>[1, 2, 3]), isA<int>());
        expect(multiplyMoney(20, 0.5), isA<int>());
        // …and a whole number too large for a double to represent exactly stays a double.
        expect(toMinorUnits(1e21), isA<double>());
        expect(asJsonSafeNumber(1e23), isA<double>());
      },
    );
  });

  test('every case in money.json was consumed', () {
    final List<String> missed = fixtureNames
        .where(
          (String n) => !consumed.contains(n) && !excludedCases.containsKey(n),
        )
        .toList();
    expect(
      missed,
      isEmpty,
      reason: 'money.json cases the port did not run: ${missed.join(', ')}',
    );
    expect(
      consumed.length + excludedCases.length,
      fixtureNames.length,
      reason: 'the suite ran more cases than the fixture holds',
    );
  });
}
