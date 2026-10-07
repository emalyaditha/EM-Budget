import 'dart:convert';
import 'dart:io';

import 'package:em_budget/domain/installments.dart';
import 'package:em_budget/models/entities.dart';
import 'package:em_budget/models/entities_ledger.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/lib/installments.ts` replayed against `parity/fixtures/installments.json` —
/// 61 cases measured from that file at the `pre-flutter` tag
/// (`LOGIC_SPEC.md` §5).
///
/// Like `money_test.dart`, the suite drives itself from the fixture's case names and
/// fails on any name it has not consumed, so a case added on the web cannot pass here
/// by being unnoticed.
///
/// **There is no clock in this unit**, which is the part of D30 that has to be said out
/// loud: every date a schedule produces comes from the `startDate` argument through
/// `addMonthsClamped`, so no injected "now" can change an answer — `pinnedNow` in the
/// provenance is what `alerts.json` needs, not this file.
///
/// What the unit *is* exposed to is the **local-midnight regime** behind `dayStartMs`, so
/// this suite is run under three zones (`Asia/Colombo`, `America/New_York`,
/// `Pacific/Kiritimati`) and the three runs must be identical; `mobile-verify.yml` does
/// that on Linux, because **the Dart VM on Windows ignores `TZ`** and takes the OS zone —
/// verified on this machine by printing `timeZoneOffset` under an exported `TZ`. The
/// matching web-side evidence is `parity/tz-proof.ts`, which measures the goldens under
/// all three zones in Node (where ICU *does* read `TZ`) and reports which cases move.
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
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}installments.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/lib/installments.ts') {
      throw StateError('installments.json is not from src/lib/installments.ts');
    }
    // D7: goldens may only come from the baseline tag. The provenance records the
    // commit rather than a wall clock, so this is a real assertion, not a timestamp
    // that drifts.
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'installments.json claims generatedFrom ${prov['generatedFrom']}; '
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
      throw StateError('installments.json carries no cases');
    }
  }

  loadFixture();

  /// A fixture `{"__sentinel__": …}` in **either** position. `undefined` only ever
  /// appears in an input, where the ported stand-in is `null` (`DATA_SPEC.md` §1); in an
  /// expected position it would mean the web returned a value `JSON.stringify` dropped,
  /// which no port can reproduce, so it throws rather than silently comparing to null.
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

  int argInt(String name, int index) => argNum(name, index).toInt();

  String argString(String name, int index) {
    final Object? value = deref(inputOf(name)[index]);
    if (value is String) return value;
    throw StateError('$name: input[$index] is not a string ($value)');
  }

  /// The fourth argument of `generateInstallmentSchedule`: `undefined` in the fixture is
  /// a genuine absent optional, which Dart spells `null` and the port treats as
  /// "derive the total from monthly × tenure".
  num? argOptionalNum(String name, int index) {
    if (inputOf(name).length <= index) return null;
    final Object? value = deref(inputOf(name)[index]);
    if (value == null) return null;
    if (value is num) return value;
    throw StateError('$name: input[$index] is not an optional number ($value)');
  }

  /// `isCardEligibleForInstallment`'s first argument. The golden writes the whole card
  /// object, so the fixture is self-describing: this is a plain `BankCard.fromJson`. The
  /// one field that matters for decoding is `limit`, whose `undefined` in the
  /// "no limit set" case arrives as a sentinel **map** — which `readNumOpt` reads as
  /// absent, exactly like the web reads a missing property. No special-casing needed,
  /// and none wanted: a reader that threw on it would be a divergence.
  BankCard argCard(String name, int index) {
    final Object? value = inputOf(name)[index];
    if (value is! Map<String, Object?>) {
      throw StateError('$name: input[$index] is not a card object');
    }
    return BankCard.fromJson(value);
  }

  /// `getInstallmentProgress`'s first argument. The web reads **only** `installment.id`
  /// from it (`installments.ts:99`), so the other fields are inert here and in the
  /// fixture, which writes nothing but `{ id: 'inst-1' }`. A Dart model cannot be that
  /// partial, so they are filled with values that cannot change an answer.
  CreditCardInstallment argInstallment(String name, int index) {
    final Object? value = inputOf(name)[index];
    if (value is! Map<String, Object?>) {
      throw StateError('$name: input[$index] is not an installment object');
    }
    return CreditCardInstallment(
      id: value['id']! as String,
      cardId: '',
      purchaseId: '',
      originalAmount: 0,
      tenureMonths: 0,
      processingFee: 0,
      monthlyPayment: 0,
      startDate: '',
      status: 'active',
      nextPaymentDate: '',
      paymentsMade: 0,
    );
  }

  /// The golden rows are the web's `Omit<CreditCardInstallmentPayment, 'id'>` shapes:
  /// `id` is minted by the caller that persists them, and `getInstallmentProgress` never
  /// reads it. The model requires one, so a positional stand-in is supplied — positional
  /// because it must be unique enough that a port which *did* start filtering on `id`
  /// would break rather than accidentally match.
  List<CreditCardInstallmentPayment> argPayments(String name, int index) {
    final Object? value = inputOf(name)[index];
    if (value is! List<Object?>) {
      throw StateError('$name: input[$index] is not a payments array');
    }
    final List<CreditCardInstallmentPayment> rows =
        <CreditCardInstallmentPayment>[];
    int i = 0;
    for (final Object? raw in value) {
      rows.add(
        CreditCardInstallmentPayment.fromJson(<String, Object?>{
          ...raw! as Map<String, Object?>,
          'id': 'synthetic-$i',
        }),
      );
      i++;
    }
    return rows;
  }

  void expectNum(String name, num actual) {
    final Object? want = expected(name);
    if (want is Map<String, Object?> && want.containsKey('__sentinel__')) {
      final String sentinel = want['__sentinel__']! as String;
      switch (sentinel) {
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
        case 'NaN':
          expect(actual.isNaN, isTrue, reason: name);
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
    if (want is num) {
      expect(actual, want, reason: name);
      return;
    }
    throw StateError('$name: expected a number, fixture says $want');
  }

  void expectJson(String name, Object? actual) {
    expect(actual, deref(expected(name)), reason: name);
  }

  group('calculateInstallmentFee', () {
    test('every fixture case', () {
      for (final String name in named('calculateInstallmentFee(')) {
        expectNum(
          name,
          calculateInstallmentFee(argNum(name, 0), argInt(name, 1)),
        );
      }
    });
  });

  group('calculateMonthlyPayment', () {
    test('every fixture case', () {
      for (final String name in named('calculateMonthlyPayment(')) {
        expectNum(
          name,
          calculateMonthlyPayment(argNum(name, 0), argInt(name, 1)),
        );
      }
    });
  });

  group('formatFeeBreakdown', () {
    test('every fixture case', () {
      for (final String name in named('formatFeeBreakdown(')) {
        expectJson(
          name,
          formatFeeBreakdown(argNum(name, 0), argInt(name, 1)).toJson(),
        );
      }
    });
  });

  group('generateInstallmentSchedule', () {
    // The generator called the web function with the literal `'inst-1'` and did not put
    // it in `input`, so the id is re-supplied here; the expected rows carry it and a
    // wrong constant fails on the first row.
    for (final String name in named('generateInstallmentSchedule(')) {
      test(name, () {
        expectJson(
          name,
          generateInstallmentSchedule(
            'inst-1',
            argNum(name, 0),
            argInt(name, 1),
            argString(name, 2),
            argOptionalNum(name, 3),
          ).map((InstallmentScheduleRow r) => r.toJson()).toList(),
        );
      });
    }
  });

  group('isCardEligibleForInstallment', () {
    test('every fixture case', () {
      for (final String name in named('isCardEligibleForInstallment(')) {
        expectJson(
          name,
          isCardEligibleForInstallment(
            argCard(name, 0),
            argNum(name, 1),
          ).toJson(),
        );
      }
    });
  });

  group('getInstallmentProgress', () {
    test('every fixture case', () {
      for (final String name in named('getInstallmentProgress(')) {
        expectJson(
          name,
          getInstallmentProgress(
            argInstallment(name, 0),
            argPayments(name, 1),
          ).toJson(),
        );
      }
    });
  });

  group('the parts of §5 a well-meaning refactor would "fix"', () {
    test('tenure 0 divides to Infinity instead of throwing', () {
      // `calculateMonthlyPayment(50000, 0)` is the golden
      // `{"__sentinel__":"Infinity"}`. Dart's `~/` would throw on this input, and a
      // guard returning `0` would print a monthly payment of Rs. 0 on a real screen.
      expect(calculateMonthlyPayment(50000, 0), double.infinity);
      expect(
        formatFeeBreakdown(50000, 0).toJson()['monthlyPayment'],
        double.infinity,
      );
    });

    test('a schedule whose originalAmount is smaller than the base rows does not tile', () {
      // `absorbed > 0` is strict: 4 × 1000 against a principal of 2500 leaves every row
      // at 1000 and the plan sums to 4000. Adding a clamp or an else-branch would move
      // money the web does not move.
      final List<InstallmentScheduleRow> rows = generateInstallmentSchedule(
        'inst-1',
        1000,
        4,
        '2026-01-15',
        2500,
      );
      expect(
        rows.map((InstallmentScheduleRow r) => r.amountDue).toList(),
        <num>[1000, 1000, 1000, 1000],
      );
    });

    test('an unlisted tenure is a silent 0% fee', () {
      expect(calculateInstallmentFee(50000, 18), 0);
      expect(formatFeeBreakdown(50000, 18).feePercent, 0);
      expect(formatFeeBreakdown(50000, 6).feePercent, 0);
    });

    test('a payment row from another installment is ignored entirely', () {
      // Filtering happens before counting, so a foreign `paid` row must not raise the
      // percentage — the golden `foreign installment row included` says 0/3.
      expect(
        getInstallmentProgress(
          CreditCardInstallment(
            id: 'inst-1',
            cardId: '',
            purchaseId: '',
            originalAmount: 0,
            tenureMonths: 0,
            processingFee: 0,
            monthlyPayment: 0,
            startDate: '',
            status: 'active',
            nextPaymentDate: '',
            paymentsMade: 0,
          ),
          <CreditCardInstallmentPayment>[
            CreditCardInstallmentPayment(
              id: 'a',
              installmentId: 'inst-1',
              paymentNumber: 1,
              amountDue: 1000,
              amountPaid: 0,
              dueDate: '2026-02-15',
              status: 'pending',
            ),
            CreditCardInstallmentPayment(
              id: 'b',
              installmentId: 'other',
              paymentNumber: 9,
              amountDue: 1,
              amountPaid: 1,
              dueDate: '2026-05-15',
              status: 'paid',
            ),
          ],
        ).toJson(),
        <String, Object?>{
          'paid': 0,
          'total': 1,
          'percentage': 0,
          'nextDue': '2026-02-15',
        },
      );
    });

    test(
      'the first payment is one month after the start date, never on it',
      () {
        // `i` starts at 1 in the web loop, so a plan created on the 15th is not due on the
        // 15th. Reading `i` from 0 is the obvious mistake and the goldens would not catch
        // it on their own if every case also shifted the clamp.
        final List<InstallmentScheduleRow> rows = generateInstallmentSchedule(
          'inst-1',
          1000,
          2,
          '2026-01-15',
        );
        expect(rows.first.dueDate, '2026-02-15');
        expect(rows[1].dueDate, '2026-03-15');
      },
    );
  });

  test('every fixture case was consumed', () {
    final List<String> unconsumed = fixtureNames
        .where((String n) => !consumed.contains(n))
        .toList();
    expect(unconsumed, isEmpty, reason: 'unported cases: $unconsumed');
    expect(consumed.length, 61, reason: 'installments.json case count');
  });
}
