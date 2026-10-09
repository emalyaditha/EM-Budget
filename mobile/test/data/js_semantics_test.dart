import 'package:em_budget/data/js_semantics.dart';
import 'package:flutter_test/flutter_test.dart';

/// The JS value semantics the sync path decides on. Each case is a place where a
/// natural Dart expression would have chosen differently.
void main() {
  group('jsTruthy — the web\'s `||`', () {
    test('falsy exactly as JavaScript defines it', () {
      expect(jsTruthy(null), isFalse);
      expect(jsTruthy(false), isFalse);
      expect(jsTruthy(0), isFalse);
      expect(jsTruthy(0.0), isFalse);
      expect(jsTruthy(-0.0), isFalse, reason: '-0 === 0 in JavaScript');
      expect(jsTruthy(double.nan), isFalse);
      expect(jsTruthy(''), isFalse);
    });

    test('truthy where Dart would be tempted to disagree', () {
      expect(
        jsTruthy(const <Object?>[]),
        isTrue,
        reason: 'an empty array is truthy',
      );
      expect(
        jsTruthy(const <String, Object?>{}),
        isTrue,
        reason: 'an empty object is truthy',
      );
      expect(
        jsTruthy('0'),
        isTrue,
        reason: 'a non-empty string, whatever it says',
      );
      expect(jsTruthy(double.infinity), isTrue);
      expect(jsTruthy(-1), isTrue);
    });
  });

  group('jsFirstTruthy — `a || b || c || d`', () {
    test('skips every falsy candidate and returns the first truthy one', () {
      expect(
        jsFirstTruthy(<Object?>[
          null,
          '',
          0,
          double.nan,
          '2026-10-02T00:00:00.000Z',
          'later',
        ]),
        '2026-10-02T00:00:00.000Z',
      );
    });

    test('all falsy yields null, which the caller must fall back from', () {
      expect(jsFirstTruthy(<Object?>[null, '', 0, false]), isNull);
    });

    test(
      'a zero-valued number does not stop the chain (`:902` timestamp hunt)',
      () {
        expect(
          jsFirstTruthy(<Object?>[0, '2026-01-01T00:00:00.000Z']),
          '2026-01-01T00:00:00.000Z',
        );
      },
    );
  });

  group('jsDateToEpochMs — the two date regimes (INVENTORY.md §5.1)', () {
    test('a date-only string is UTC midnight, not local midnight', () {
      expect(
        jsDateToEpochMs('2026-10-02'),
        DateTime.utc(2026, 10, 2).millisecondsSinceEpoch,
        reason: 'DateTime.parse would have read it as local; that shifts every ledger date',
      );
    });

    test('a date-time without an offset stays local on both engines', () {
      expect(
        jsDateToEpochMs('2026-10-02T10:00:00'),
        DateTime.parse('2026-10-02T10:00:00').toUtc().millisecondsSinceEpoch,
      );
    });

    test('an explicit offset is honoured', () {
      expect(
        jsDateToEpochMs('2026-10-02T10:00:00Z'),
        DateTime.utc(2026, 10, 2, 10).millisecondsSinceEpoch,
      );
      expect(
        jsDateToEpochMs('2026-10-02T10:00:00+05:30'),
        DateTime.utc(2026, 10, 2, 4, 30).millisecondsSinceEpoch,
      );
    });

    test(
      'a number is an epoch and is truncated, not rounded (`ToInteger`)',
      () {
        expect(jsDateToEpochMs(1759392000000), 1759392000000);
        expect(jsDateToEpochMs(1500.7), 1500);
        expect(jsDateToEpochMs(-1500.7), -1500);
      },
    );

    test('what JavaScript cannot parse has no epoch', () {
      expect(jsDateToEpochMs('15/10/2026'), isNull);
      expect(jsDateToEpochMs(''), isNull);
      expect(jsDateToEpochMs(double.nan), isNull);
      expect(jsDateToEpochMs(double.infinity), isNull);
      expect(jsDateToEpochMs(const <Object?>[]), isNull);
      expect(jsDateToEpochMs('2026-13-45'), isNull);
      // Dart normalises an impossible day into a later date; V8 gives an Invalid
      // Date. A silent roll-over would move a ledger date, so it is rejected.
      expect(jsDateToEpochMs('2026-02-30'), isNull);
      expect(jsDateToEpochMs('2025-02-29'), isNull);
      expect(
        jsDateToEpochMs('2024-02-29'),
        DateTime.utc(2024, 2, 29).millisecondsSinceEpoch,
        reason: '2024 is a leap year',
      );
    });
  });

  group('jsDateToIso — `new Date(x).toISOString()`', () {
    test('always three fractional digits and a literal Z', () {
      expect(jsDateToIso('2026-10-02'), '2026-10-02T00:00:00.000Z');
      expect(jsDateToIso(0), '1970-01-01T00:00:00.000Z');
      expect(
        jsDateToIso('2026-10-02T04:30:00.100Z'),
        '2026-10-02T04:30:00.100Z',
        reason: 'Dart would print .1, not .100',
      );
    });

    test(
      'an unparseable value yields null so the caller can pass the raw string',
      () {
        expect(jsDateToIso('not a date'), isNull);
      },
    );
  });

  group('nowIso', () {
    test('formats the pinned clock exactly as the web\'s fallback would', () {
      expect(
        nowIso(DateTime.parse('2026-10-04T04:30:00.000Z')),
        '2026-10-04T04:30:00.000Z',
      );
    });

    test('converts a local instant to UTC first', () {
      final DateTime local = DateTime.now();
      expect(nowIso(local).endsWith('Z'), isTrue);
      expect(
        jsDateToEpochMs(nowIso(local)),
        local.toUtc().millisecondsSinceEpoch,
      );
    });
  });

  group('jsNumberToString — `String(num)`', () {
    test('an integral double loses the `.0` Dart would write', () {
      expect(jsNumberToString(20000.0), '20000');
      expect(jsNumberToString(-1.0), '-1');
      expect(jsNumberToString(0.0), '0');
      expect(jsNumberToString(-0.0), '0', reason: 'String(-0) is "0"');
    });

    test('a whole double above 2^63 still expands, never wraps', () {
      // `toInt()` on a value with no 64-bit representation silently wrapped negative,
      // and the CSV export then quoted the result as a formula cell.
      expect(jsNumberToString(1e20), '100000000000000000000');
      expect(jsNumberToString(-1e20), '-100000000000000000000');
      expect(
        jsNumberToString(9007199254740993.0),
        '9007199254740992',
        reason: 'the double rounds to 2^53+0; JS prints the double, not the literal',
      );
    });

    test('1e21 and above go exponential on both sides', () {
      expect(jsNumberToString(1e21), '1e+21');
      expect(jsNumberToString(-1e21), '-1e+21');
      expect(jsNumberToString(1.5e22), '1.5e+22');
    });

    test('a non-integral double keeps the shortest round-trip digits', () {
      expect(jsNumberToString(0.5), '0.5');
      expect(jsNumberToString(0.1 + 0.2), '0.30000000000000004');
      expect(jsNumberToString(1e-7), '1e-7');
      expect(jsNumberToString(1e-6), '0.000001');
    });

    test('non-finite values are the three JS words', () {
      expect(jsNumberToString(double.nan), 'NaN');
      expect(jsNumberToString(double.infinity), 'Infinity');
      expect(jsNumberToString(double.negativeInfinity), '-Infinity');
    });

    test('an `int` is passed straight through', () {
      expect(jsNumberToString(1234567890123456789), '1234567890123456789');
    });
  });

  group('jsToString — `String(value)` for a CSV cell', () {
    test('null is the word, numbers go through the number rule', () {
      expect(jsToString(null), 'null');
      expect(jsToString('a'), 'a');
      expect(jsToString(100.0), '100');
      expect(jsToString(true), 'true');
      expect(jsToString(false), 'false');
    });
  });
}
