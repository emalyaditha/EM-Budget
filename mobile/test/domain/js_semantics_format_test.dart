import 'package:em_budget/data/js_semantics.dart';
import 'package:em_budget/data/number_locale.dart';
import 'package:flutter_test/flutter_test.dart';

/// The four JavaScript number primitives `src/lib/money.ts` depends on, asserted
/// against expectations measured from Node v24 (`parity/fixtures/money.json`
/// `_provenance.node`) — the same runtime the goldens came from.
///
/// These are not the money cases; those are replayed in `money_test.dart`. This file
/// pins the *primitives*, because `money.ts` is only the visible half: the rounding
/// rule, the lenient parse and the two formatters are JavaScript built-ins, and a Dart
/// substitute that is close enough fails somewhere the fixtures do not reach.
///
/// Each function here was additionally swept against Node over a large corpus at port
/// time, and the sweep found the divergences recorded in the cases below:
/// - `toFixed`: 79,824 values (the cents grid at ±200 000, `2^-0 … 2^-63`, every
///   eighth-place tie, 20 000 random magnitudes across 21 decimal orders) — Dart agrees
///   on all of them except `-0`;
/// - `toLocaleString`: 148,243 (value, min, max) triples over the same corpus plus
///   `1e21`, `1e22`, `1e30`, `5e-325` and `2^53`, at seven digit pairs — zero divergences;
///   and, separately, 720 triples over ten locales (`en-US`, `en-IN`, `de-DE`, `fr-FR`,
///   `hi-IN`, `ar-EG`, `nl-NL`, `cs-CZ`, `bn-BD`, `my-MM`) — again zero, which is what
///   lets `number_locale_test.dart` claim the locale shapes are ported rather than
///   approximated;
/// - `parseFloat`: 4,057 strings — one divergence, a Unicode space, now in the table;
/// - `Math.round`: 38,411 numbers — zero divergences, including every `-0` case.
void main() {
  // Everything this file pins was measured under the runtime default locale, which the
  // generator recorded as en-US. The port formats in the phone's locale, so the test has
  // to name the one it is asserting; the non-en-US shapes are `number_locale_test.dart`.
  final JsNumberLocale enUs = JsNumberLocale.resolve('en-US');

  group('jsParseFloat', () {
    test('stops at the first character that is not part of the number', () {
      expect(jsParseFloat('12abc'), 12);
      expect(jsParseFloat('1/2'), 1);
      expect(jsParseFloat('1,250'), 1);
      expect(jsParseFloat('1.2.3'), 1.2);
      // Hex is not in `parseFloat`'s grammar, so it stops at the `x` and the answer is
      // zero — the case that makes `toMinorUnits("0x10")` `0`, not `1600`.
      expect(jsParseFloat('0x10'), 0);
      expect(jsParseFloat('0b11'), 0);
    });

    test('an exponent needs at least one digit', () {
      expect(jsParseFloat('1e'), 1);
      expect(jsParseFloat('1e+'), 1);
      expect(jsParseFloat('1e3'), 1000);
      expect(jsParseFloat('1.2e3'), 1200);
      expect(jsParseFloat('.5e2'), 50);
      expect(jsParseFloat('1E-3'), 0.001);
    });

    test('a trailing dot is a whole number, a leading dot needs digits', () {
      expect(jsParseFloat('5.'), 5);
      expect(jsParseFloat('.5'), 0.5);
      expect(jsParseFloat('.'), isNaN);
      expect(jsParseFloat('-.5'), -0.5);
      expect(jsParseFloat('+7.5'), 7.5);
    });

    test(
      'leading whitespace is ECMAScript WhiteSpace, not just ASCII space',
      () {
        // The sweep's only divergence: `U+2007 FIGURE SPACE` is in the Zs category that
        // `parseFloat` skips, and a hand-written ASCII class silently returns NaN.
        expect(jsParseFloat('  7.5 '), 7.5);
        expect(jsParseFloat('\t1.5\n'), 1.5);
        expect(jsParseFloat('\u00a012.5'), 12.5);
        expect(jsParseFloat('\uFEFF3'), 3);
        expect(jsParseFloat('\u20074'), 4);
      },
    );

    test('Infinity is a number, "inf" is not', () {
      expect(jsParseFloat('Infinity'), double.infinity);
      expect(jsParseFloat('-Infinity'), double.negativeInfinity);
      expect(jsParseFloat('+Infinity'), double.infinity);
      expect(jsParseFloat('inf'), isNaN);
      expect(jsParseFloat('NaN'), isNaN);
      expect(jsParseFloat(''), isNaN);
      expect(jsParseFloat('abc'), isNaN);
    });
  });

  group('jsToNumber', () {
    // `Number(v)`, measured in V8 over the same corpus as `jsParseFloat` above. The two
    // readers disagree in exactly the three places `src/utils.ts` and `src/lib/money.ts`
    // route different amounts through: radix, unparsable tail, and leading/trailing space
    // around a sign.
    test(
      'is a whole-string reader, so a tail that parseFloat would drop is NaN',
      () {
        expect(jsToNumber('5000'), 5000);
        expect(jsToNumber('00'), 0);
        expect(jsToNumber('.5'), 0.5);
        expect(jsToNumber('5.'), 5);
        expect(jsToNumber('1e308'), 1e308);
        expect(jsToNumber('1.7976931348623157e309'), double.infinity);
        for (final String s in <String>[
          'abc',
          '12abc',
          '1,250',
          '1_000',
          '123n',
          '1.2.3',
          '.e3',
          '1e+',
          '+ 5',
          'true',
          'NaN',
        ]) {
          expect(jsToNumber(s).isNaN, isTrue, reason: '"$s" is not NaN');
        }
      },
    );

    test('takes the three radix forms, but no sign in front of them', () {
      expect(jsToNumber('0x10'), 16);
      expect(jsToNumber('0b11'), 3);
      expect(jsToNumber('0o17'), 15);
      // `parseFloat` stops at the `x` and answers `0`; `Number` refuses the whole string.
      expect(jsParseFloat('0x10'), 0);
      for (final String s in <String>['0x', '-0x10', '0b2', '0o8', '0 x10']) {
        expect(jsToNumber(s).isNaN, isTrue, reason: '"$s" is not NaN');
      }
    });

    test('empty and whitespace-only are zero, an unquoted tail is not', () {
      expect(jsToNumber(''), 0);
      expect(jsToNumber('   '), 0);
      expect(jsToNumber('\t\n\u00a0'), 0);
      expect(jsToNumber('  12abc  ').isNaN, isTrue);
      // `parseFloat` reads the `12` out of the same string.
      expect(jsParseFloat('  12abc  '), 12);
    });

    test('keeps the sign of a negative-zero literal', () {
      for (final String s in <String>['-0', '-0.', '-.0', '-0e3']) {
        final double n = jsToNumber(s);
        expect(n == 0, isTrue, reason: '"$s" is $n');
        expect(n.isNegative, isTrue, reason: '"$s" lost its sign');
      }
    });

    test('Infinity needs the whole word, a non-string maps by ToPrimitive\'s cover', () {
      expect(jsToNumber('Infinity'), double.infinity);
      expect(jsToNumber('+Infinity'), double.infinity);
      expect(jsToNumber('-Infinity'), double.negativeInfinity);
      expect(jsToNumber('inf').isNaN, isTrue);
      expect(jsToNumber(null), 0);
      expect(jsToNumber(true), 1);
      expect(jsToNumber(false), 0);
      expect(jsToNumber(7.5), 7.5);
      expect(jsToNumber(7), 7);
    });
  });

  group('jsMathRound', () {
    test('breaks ties toward +Infinity, which Dart\'s .round() does not', () {
      expect(jsMathRound(2.5), 3);
      expect(jsMathRound(-2.5), -2);
      expect(jsMathRound(-12.5), -12);
      // The same inputs through Dart's own rule, so the difference is on the record
      // rather than implied: `-2.5.round()` is `-3`.
      expect((-2.5).round(), -3);
      expect((-12.5).round(), -13);
    });

    test('returns negative zero for the band -0.5 ≤ x < 0', () {
      // `toMinorUnits(-0.005)` is `Math.round(-0.5)`, and `money.json` records the
      // answer as the `-0` sentinel. `expect(x, 0)` would pass on a plain zero, so the
      // sign bit is what this test is for.
      for (final double x in <double>[-0.5, -0.4, -0.0001, -0.0]) {
        final double rounded = jsMathRound(x);
        expect(rounded == 0, isTrue, reason: '$x rounded to $rounded');
        expect(rounded.isNegative, isTrue, reason: '$x lost its sign');
      }
      expect(jsMathRound(0.4), 0);
      expect(jsMathRound(0.5), 1);
    });

    test('passes NaN and the infinities through, and is a no-op past 2^52', () {
      expect(jsMathRound(double.nan), isNaN);
      expect(jsMathRound(double.infinity), double.infinity);
      expect(jsMathRound(double.negativeInfinity), double.negativeInfinity);
      expect(jsMathRound(1e21), 1e21);
      expect(jsMathRound(-1e21), -1e21);
    });
  });

  group('jsToFixed', () {
    test('rounds on the exact binary value, so 0.015 goes down', () {
      expect(jsToFixed(0.015, 2), '0.01');
      expect(jsToFixed(1.005, 2), '1.00');
      expect(jsToFixed(0.025, 2), '0.03');
      expect(jsToFixed(1234.5, 0), '1235');
      expect(jsToFixed(2.5, 0), '3');
      expect(jsToFixed(-0.5 / 100, 2), '-0.01');
    });

    test('drops the sign of negative zero, which is what toFixed does', () {
      // `(-0 < 0)` is false, so V8 writes `"0.00"` while Dart's `toStringAsFixed`
      // reads the sign bit and writes `"-0.00"`. The sweep's only divergence, and the
      // reason `toMajorUnits(-0)` is `"0.00"` in `money.json`.
      expect(jsToFixed(-0.0, 2), '0.00');
      expect(jsToFixed(-0.001, 2), '-0.00');
      expect(jsToFixed(0.0, 2), '0.00');
    });

    test(
      'writes NaN and the infinities as the words, and 1e21 exponentially',
      () {
        expect(jsToFixed(double.nan, 2), 'NaN');
        expect(jsToFixed(double.infinity, 2), 'Infinity');
        expect(jsToFixed(double.negativeInfinity, 2), '-Infinity');
        expect(jsToFixed(1e21, 2), '1e+21');
      },
    );
  });

  group('jsToLocaleStringFixed', () {
    test('groups every three digits and expands past 1e21', () {
      expect(jsToLocaleStringFixed(1234.5, 0, 2, enUs), '1,234.5');
      expect(jsToLocaleStringFixed(125000.005, 0, 2, enUs), '125,000.01');
      expect(
        jsToLocaleStringFixed(1e21, 2, 2, enUs),
        '1,000,000,000,000,000,000,000.00',
      );
      expect(
        jsToLocaleStringFixed(1e22, 0, 2, enUs),
        '10,000,000,000,000,000,000,000',
      );
      expect(jsToLocaleStringFixed(1234567, 0, 0, enUs), '1,234,567');
    });

    test('rounds on the shortest decimal, so the same 0.015 goes up', () {
      expect(jsToLocaleStringFixed(0.015, 2, 2, enUs), '0.02');
      expect(jsToLocaleStringFixed(1.005, 2, 2, enUs), '1.01');
      expect(jsToLocaleStringFixed(8.835, 2, 2, enUs), '8.84');
      expect(jsToLocaleStringFixed(125000.0049, 2, 4, enUs), '125,000.0049');
      expect(jsToLocaleStringFixed(0.005, 2, 2, enUs), '0.01');
    });

    test('carries through an all-nines run', () {
      expect(jsToLocaleStringFixed(999.9999, 0, 2, enUs), '1,000');
      expect(jsToLocaleStringFixed(9.996, 2, 2, enUs), '10.00');
      expect(jsToLocaleStringFixed(0.999, 0, 0, enUs), '1');
      expect(jsToLocaleStringFixed(999999.5, 0, 0, enUs), '1,000,000');
    });

    test('pads to min and trims trailing zeros down to min, never below', () {
      expect(jsToLocaleStringFixed(1234.5, 0, 2, enUs), '1,234.5');
      expect(jsToLocaleStringFixed(1234.5, 2, 2, enUs), '1,234.50');
      expect(jsToLocaleStringFixed(0, 0, 2, enUs), '0');
      expect(jsToLocaleStringFixed(0, 2, 2, enUs), '0.00');
      expect(jsToLocaleStringFixed(1e-7, 2, 4, enUs), '0.00');
      expect(jsToLocaleStringFixed(0.0001, 2, 4, enUs), '0.0001');
      expect(jsToLocaleStringFixed(5e-325, 2, 2, enUs), '0.00');
    });

    test('keeps Intl\'s sign on a negative zero, unlike toFixed', () {
      // Unreachable through `formatMoney`, which takes `Math.abs` first — but this
      // function is the twin of `toLocaleString`, not of `formatMoney`, so the two
      // built-ins\' disagreement on `-0` is reproduced rather than smoothed over.
      expect(jsToLocaleStringFixed(-0.0, 2, 2, enUs), '-0.00');
      expect(jsToLocaleStringFixed(-0.0, 0, 2, enUs), '-0');
      expect(jsToLocaleStringFixed(-1234.5, 0, 2, enUs), '-1,234.5');
    });

    test('writes NaN and the infinities as the words', () {
      expect(jsToLocaleStringFixed(double.nan, 2, 2, enUs), 'NaN');
      expect(jsToLocaleStringFixed(double.infinity, 2, 2, enUs), 'Infinity');
      expect(
        jsToLocaleStringFixed(double.negativeInfinity, 2, 2, enUs),
        '-Infinity',
      );
    });
  });
}
