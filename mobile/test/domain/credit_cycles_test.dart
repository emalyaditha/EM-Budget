import 'dart:convert';
import 'dart:io';

import 'package:em_budget/domain/credit_cards.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/lib/creditCards.ts` — the pure-UTC half of the cycle engine — replayed against
/// `parity/fixtures/credit-cycles.json` (139 cases measured from that file at the
/// `pre-flutter` tag, `LOGIC_SPEC.md` §3/§4).
///
/// Like `installments_test.dart`, every group drives itself from the fixture's own case
/// names and each group asserts the count it expects, so a case added on the web fails
/// here instead of passing unobserved; the last test asserts that every recorded name
/// was consumed.
///
/// **This suite has no clock and no zone.** That is the point of the file it replays:
/// `creditCards.ts` never constructs a `Date` from a string and never reads a local
/// midnight. `deductionDate`, `advanceDueDate` and `cycleWindowStart` are arithmetic on
/// the digits of a `YYYY-MM-DD` string, and `daysBetween` is a difference of `Date.UTC`
/// values. So the three-zone legs of `mobile-verify.yml` are *not* what proves this unit
/// zone-independent — this suite is: it asserts the same answers here, on a `+05:30`
/// workstation, that CI asserts on a UTC runner, and `deductionDate("2026-10-04T18:30:00Z")`
/// is one of the recorded cases precisely because a parser that consulted the host would
/// answer with a different day at that instant. The local-midnight twin is
/// `test/data/dates_local_test.dart`; the split between them is `INVENTORY.md` §5.1 and
/// neither half may be "unified" into the other.
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
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}credit-cycles.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/lib/creditCards.ts') {
      throw StateError('credit-cycles.json is not from src/lib/creditCards.ts');
    }
    // D7: goldens may only come from the baseline tag.
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'credit-cycles.json claims generatedFrom ${prov['generatedFrom']}; '
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
      inputByName[name] = entry['input']! as List<Object?>;
      fixtureNames.add(name);
    }
    if (fixtureNames.isEmpty) {
      throw StateError('credit-cycles.json carries no cases');
    }
  }

  loadFixture();

  /// A fixture `{"__sentinel__": …}` in **either** position. `undefined` only ever
  /// appears in an input, where the port's stand-in is `null` (`DATA_SPEC.md` §1); a
  /// `undefined-result` in an expected position is asserted explicitly by the rollover
  /// suite, not silently compared to `null`.
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

  num argNum(String name, int index) {
    final Object? value = deref(inputOf(name)[index]);
    if (value is num) return value;
    throw StateError('$name: input[$index] is not a number ($value)');
  }

  /// `computeMinimumPayment`'s and `latePaymentFee`'s optional argument: `undefined`
  /// must reach the port as `null`, not as `0`, because `!minPayment` is the branch.
  num? argNumOpt(String name, int index) {
    final Object? value = deref(inputOf(name)[index]);
    if (value == null) return null;
    if (value is num) return value;
    throw StateError(
      '$name: input[$index] is neither a number nor undefined ($value)',
    );
  }

  String argString(String name, int index) {
    final Object? value = deref(inputOf(name)[index]);
    if (value is String) return value;
    throw StateError('$name: input[$index] is not a string ($value)');
  }

  /// An **expected** value asserted against a `num` result, sentinel-aware — the same
  /// rule `money_test.dart` uses: `expect(-0.0, 0)` passes in Dart because `==` ignores
  /// the sign bit, so the sentinel is the only way to demand it.
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

  group('DEDUCTION_DAY', () {
    test('is the 15th, and only the 15th', () {
      final List<String> cases = named('DEDUCTION_DAY');
      expect(cases, hasLength(1));
      for (final String name in cases) {
        expect(deductionDay, expected(name), reason: name);
      }
    });
  });

  group('deductionDate', () {
    test('every recorded input, including the ones it refuses to parse', () {
      final List<String> cases = named('deductionDate(');
      expect(cases, hasLength(27));
      for (final String name in cases) {
        expect(deductionDate(argString(name, 0)), expected(name), reason: name);
      }
    });

    test(
      'a malformed date is returned unchanged, not defaulted to the 15th',
      () {
        // The same answer through two different guards, so a port that "helpfully"
        // falls back to `DEDUCTION_DAY` of today fails here rather than at a user.
        expect(deductionDate(''), '');
        expect(deductionDate('not-a-date'), 'not-a-date');
        expect(deductionDate('2026-9-5'), '2026-9-5');
      },
    );

    test(
      'day 31 in a 30-day month is not malformed, so it does become the 15th',
      () {
        // The counterpart to the assertion above, and the easier half to get wrong:
        // `parseDateParts` range-checks the day against **31**, never against the month,
        // so `2026-02-31` parses, and a parsed date always yields the deduction day.
        expect(deductionDate('2026-02-31'), '2026-02-15');
      },
    );
  });

  group('advanceDueDate', () {
    test('every recorded input', () {
      final List<String> cases = named('advanceDueDate(');
      expect(cases, hasLength(28));
      for (final String name in cases) {
        expect(
          advanceDueDate(argString(name, 0)),
          expected(name),
          reason: name,
        );
      }
    });

    test('repeated advances never bring back the 31st (B-02, replicated)', () {
      final List<String> cases = named('advanceDueDate^');
      expect(cases, hasLength(12));
      for (final String name in cases) {
        final String start = argString(name, 0);
        final int times = argNum(name, 1).toInt();
        String cur = start;
        for (int k = 0; k < times; k++) {
          cur = advanceDueDate(cur);
        }
        expect(cur, expected(name), reason: name);
      }
      // Stated as a fact too, because it is the bug a reviewer will want to "fix":
      // the clamp is one-way, so a Jan-31 due date is on the 28th by February and
      // stays there for the rest of the year.
      expect(advanceDueDate(advanceDueDate('2026-01-31')), '2026-03-28');
    });
  });

  group('cycleWindowStart', () {
    test('every recorded input', () {
      final List<String> cases = named('cycleWindowStart(');
      expect(cases, hasLength(23));
      for (final String name in cases) {
        expect(
          cycleWindowStart(argString(name, 0)),
          expected(name),
          reason: name,
        );
      }
    });

    test('is not the inverse of advanceDueDate across a clamp', () {
      // `cycleWindowStart(advanceDueDate(x)) == x` is the assumption that would make
      // the clamp harmless. It holds for the 7th and fails for the 31st.
      expect(cycleWindowStart(advanceDueDate('2026-10-07')), '2026-10-07');
      expect(cycleWindowStart(advanceDueDate('2026-01-31')), '2026-01-28');
    });
  });

  group('computeMinimumPayment', () {
    test('every recorded balance and limit', () {
      final List<String> cases = named('computeMinimumPayment(');
      expect(cases, hasLength(14));
      for (final String name in cases) {
        expectNum(
          name,
          computeMinimumPayment(argNum(name, 0), argNumOpt(name, 1)),
        );
      }
    });

    test('the Rs. 250 floor is applied after rounding, and only to a debt', () {
      // Asserted on top of the goldens because the floor is the part a port is most
      // likely to fold into the 5% branch: a Re. 1 debt still owes 250.
      expect(computeMinimumPayment(-1, 250000), 250);
      expect(computeMinimumPayment(0, 250000), 0);
      expect(computeMinimumPayment(500, 250000), 0);
    });

    test('an over-limit card pays 5% of the limit plus the whole excess', () {
      // 5% of 250,000 **plus the entire 10,000 over**, so Rs. 22,500 — not 5% of the
      // outstanding, which would be 13,000. The excess is not spread over a year.
      expect(computeMinimumPayment(-260000, 250000), 22500);
    });
  });

  group('interestForCycle', () {
    test('every recorded triple', () {
      final List<String> cases = named('interestForCycle(');
      expect(cases, hasLength(12));
      for (final String name in cases) {
        expectNum(
          name,
          interestForCycle(
            argNum(name, 0),
            argNumOpt(name, 1),
            argNum(name, 2),
          ),
        );
      }
    });

    test('the guard is !(apr > 0), so a NaN APR charges nothing', () {
      // B-03's engine half. `display_interest_test.dart` asserts the opposite answer
      // for the same numbers, and both are correct: one is what is charged, the other
      // is what is shown.
      expect(interestForCycle(-1000, double.nan, 30), 0);
      expect(interestForCycle(-1000, 0, 30), 0);
      expect(interestForCycle(-1000, null, 30), 0);
      expect(interestForCycle(-1000, 24.9, 0), 0);
      expect(interestForCycle(-1000, 24.9, -30), 0);
      expect(interestForCycle(1000, 24.9, 30), 0);
    });
  });

  group('latePaymentFee', () {
    test('every recorded minimum', () {
      final List<String> cases = named('latePaymentFee(');
      expect(cases, hasLength(9));
      for (final String name in cases) {
        expectNum(name, latePaymentFee(argNumOpt(name, 0)));
      }
    });

    test(
      'is the Rs. 1,200 tariff or 5% of the minimum, whichever is higher',
      () {
        expect(latePaymentFee(24000), 1200);
        expect(latePaymentFee(24001), 1200.05);
        expect(latePaymentFee(), 0);
      },
    );
  });

  group('daysBetween', () {
    test('every recorded pair', () {
      final List<String> cases = named('daysBetween(');
      expect(cases, hasLength(8));
      for (final String name in cases) {
        expectNum(name, daysBetween(argString(name, 0), argString(name, 1)));
      }
    });

    test('a malformed side is 0 days, which is not "unknown"', () {
      // The consequence that matters: `interestForCycle` guards `days <= 0`, so a
      // half-typed date silently charges no interest for a whole cycle.
      expect(daysBetween('', '2026-10-05'), 0);
      expect(daysBetween('2026-9-5', '2026-10-05'), 0);
      expect(interestForCycle(-38420, 24.9, daysBetween('', '2026-10-05')), 0);
    });
  });

  group('cycleAnchor', () {
    test('every recorded card', () {
      final List<String> cases = named('cycleAnchor(');
      expect(cases, hasLength(5));
      for (final String name in cases) {
        final Map<String, Object?> card =
            deref(inputOf(name)[0])! as Map<String, Object?>;
        expect(
          cycleAnchor(
            dueDate: card['dueDate'] as String?,
            statementCloseDate: card['statementCloseDate'] as String?,
          ),
          expected(name),
          reason: name,
        );
      }
    });

    test('an empty cut-off date falls through to the due date, not to ""', () {
      // `a || b || ''` — falsy-but-present is the whole distinction, and a port that
      // writes `?? ` instead reads `''` here and anchors the cycle on nothing.
      expect(
        cycleAnchor(dueDate: '2026-10-07', statementCloseDate: ''),
        '2026-10-07',
      );
      expect(cycleAnchor(), '');
    });
  });

  test('every case recorded by generate.ts was consumed', () {
    expect(fixtureNames, hasLength(139));
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
