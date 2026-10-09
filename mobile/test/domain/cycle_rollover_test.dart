import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/number_locale.dart';
import 'package:em_budget/domain/credit_cards.dart';
import 'package:em_budget/models/entities.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/lib/creditCards.ts` — `runCycleRollover`, the one function in the file that
/// *writes* — replayed against `parity/fixtures/cycle-rollover.json` (19 cases measured
/// from that file at the `pre-flutter` tag, `LOGIC_SPEC.md` §4).
///
/// The result is compared as a **whole payload**, not field by field: the golden records
/// the four keys the web returns and the five keys of each charge, including the exact
/// `description` text. That text reaches the ledger as a persisted Charge, so a changed
/// space or a different thousands separator is a visible, stored difference, not a
/// formatting nicety.
///
/// **No clock.** `today` is the third argument, so the suite needs no pinned `Date` and
/// the fixture's `tz` is recorded rather than used — the web reaches this function from a
/// mount effect and a 60-second interval, and the *choosing* of `today` is the caller's
/// problem (`INVENTORY.md` §5.3, a behaviour decision this port does not silently make).
///
/// **Locale is pinned, per `DATA_SPEC.md` §11 D-12.** The late-fee description is
/// `minPayment.toLocaleString()` with no arguments, which on the web means the *visitor's*
/// locale; the golden was measured on an `en-US` host, so it says `minimum of 1,921`. This
/// suite injects the same `en-US` to reproduce the recorded bytes. The app itself passes no
/// locale and therefore uses the phone's, which is what D-12 rules — `en-US` here is the
/// measuring instrument, not the product setting; `number_locale_test.dart` is what proves
/// an `en-LK`/`si-LK` device formats its own cycles correctly.
void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Object?> expectedByName = <String, Object?>{};
  final Map<String, List<Object?>> inputByName = <String, List<Object?>>{};
  final Set<String> consumed = <String>{};
  late final JsNumberLocale goldenLocale;

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
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}cycle-rollover.json',
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
        'cycle-rollover.json is not from src/lib/creditCards.ts',
      );
    }
    // D7: goldens may only come from the baseline tag.
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'cycle-rollover.json claims generatedFrom ${prov['generatedFrom']}; '
        'fixtures are measured from the pre-flutter tag only',
      );
    }
    if (prov['locale'] != 'en-US') {
      throw StateError(
        'cycle-rollover.json was generated with locale ${prov['locale']}, which this '
        'suite would have to inject instead of en-US',
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
    if (fixtureNames.isEmpty) {
      throw StateError('cycle-rollover.json carries no cases');
    }
  }

  loadFixture();

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

  BankCard cardFrom(Object? raw) =>
      BankCard.fromJson(deref(raw)! as Map<String, Object?>);

  List<Transaction> txsFrom(Object? raw) => (deref(raw)! as List<Object?>)
      .cast<Map<String, Object?>>()
      .map(Transaction.fromJson)
      .toList();

  /// The card / payment set of a three-argument case, for the tests that re-run one case
  /// with a different `today`.
  BankCard cardAt(String name) => cardFrom(inputOf(name)[0]);

  List<Transaction> txsAt(String name) => txsFrom(inputOf(name)[1]);

  /// The one argument-list shape this fixture uses: `[card, transactions, today]`. For an
  /// ordinary case the recorded input **is** that triple; only the double-charge probe
  /// wraps two triples in a list, so it names which one to replay with [call].
  CycleRolloverResult? rolloverAt(String name, {int? call}) {
    final List<Object?> args = call == null
        ? inputOf(name)
        : inputOf(name)[call]! as List<Object?>;
    return runCycleRollover(
      cardFrom(args[0]),
      txsFrom(args[1]),
      args[2]! as String,
      goldenLocale,
    );
  }

  /// The port's result re-expressed with the web's own keys, so the comparison is against
  /// the recorded payload rather than against a hand-picked subset of it. A key the web
  /// does not return cannot appear here, and one it does cannot go unasserted —
  /// [expectResult] checks the golden's key set first.
  Object? resultAsJson(CycleRolloverResult? result) {
    if (result == null) return null;
    return <String, Object?>{
      'currentBalance': result.currentBalance,
      'dueDate': result.dueDate,
      'minPayment': result.minPayment,
      'charges': result.charges
          .map(
            (CycleChargeDraft c) => <String, Object?>{
              'type': c.type,
              'name': c.name,
              'amount': c.amount,
              'appliedDate': c.appliedDate,
              'description': c.description,
            },
          )
          .toList(),
    };
  }

  void expectResult(String name, CycleRolloverResult? actual) {
    final Object? want = expected(name);
    if (want is Map<String, Object?> && want.containsKey('__sentinel__')) {
      // `undefined` from the function is a distinct answer from a result object, and the
      // fixture names it rather than dropping the case: the caller only writes to the
      // ledger when this is non-null, so a port that returns an empty result instead of
      // nothing would persist a zero-charge rollover and advance the deadline.
      expect(want['__sentinel__'], 'undefined-result', reason: name);
      expect(actual, isNull, reason: name);
      return;
    }
    final Map<String, Object?> card = want! as Map<String, Object?>;
    expect(
      card.keys.toList(),
      unorderedEquals(<String>[
        'currentBalance',
        'dueDate',
        'minPayment',
        'charges',
      ]),
      reason: '$name: unexpected golden shape',
    );
    for (final Object? charge in card['charges']! as List<Object?>) {
      expect(
        (charge! as Map<String, Object?>).keys.toList(),
        unorderedEquals(<String>[
          'type',
          'name',
          'amount',
          'appliedDate',
          'description',
        ]),
        reason: name,
      );
    }
    expect(resultAsJson(actual), equals(deref(card)), reason: name);
  }

  group('runCycleRollover', () {
    test('every recorded card, payment set and day', () {
      final List<String> cases = named('runCycleRollover(');
      expect(cases, hasLength(18));
      for (final String name in cases) {
        expectResult(name, rolloverAt(name));
      }
    });

    test(
      'the cycle is closed on the 15th and the next deadline stays on the 7th',
      () {
        // The two-day asymmetry the file is named for. `2026-10-14` returns nothing,
        // `2026-10-15` closes it, and the new due date is `2026-11-07` — advancing from the
        // deduction date instead would walk every card's deadline to the 15th one cycle at
        // a time, silently, and no test that only looked at the balance would notice.
        expect(
          runCycleRollover(
            cardAt('runCycleRollover(exactly on deduction day)'),
            txsAt('runCycleRollover(exactly on deduction day)'),
            '2026-10-14',
            goldenLocale,
          ),
          isNull,
        );
        final CycleRolloverResult closed = runCycleRollover(
          cardAt('runCycleRollover(exactly on deduction day)'),
          txsAt('runCycleRollover(exactly on deduction day)'),
          '2026-10-15',
          goldenLocale,
        )!;
        expect(closed.dueDate, '2026-11-07');
        // And the charge is dated the deduction day, not the day the timer happened to fire.
        expect(closed.charges.single.appliedDate, '2026-10-15');
      },
    );

    test('a late fee is only ever a late fee *and* a number', () {
      // Two separate guards the golden pins: the fee needs an outstanding balance and an
      // unpaid minimum, and `latePaymentFee` then has to answer non-zero. A card with no
      // configured minimum never gets one, which is why `minOk` short-circuits on
      // `!minPayment` rather than treating it as "unpaid".
      final List<String> withFee = named('runCycleRollover(').where((String n) {
        final Object? e = expectedByName[n];
        // `undefined-result` cases carry no `charges` key at all, so the filter tests for
        // the key rather than asserting one.
        return e is Map<String, Object?> &&
            e['charges'] is List<Object?> &&
            (e['charges']! as List<Object?>).any(
              (Object? c) =>
                  (c! as Map<String, Object?>)['type'] == 'Late Payment Fee',
            );
      }).toList();
      expect(withFee, isNotEmpty);
      for (final String name in withFee) {
        final CycleRolloverResult r = rolloverAt(name)!;
        final Iterable<CycleChargeDraft> fees = r.charges.where(
          (CycleChargeDraft c) => c.type == 'Late Payment Fee',
        );
        expect(fees, hasLength(1), reason: name);
        expect(fees.single.amount, 1200, reason: name);
        // `Rs. 1,200 or 5% of the minimum, whichever is higher` — every card in this
        // fixture is below the 24,000 crossover, so all of them take the tariff.
        expect(fees.single.description, startsWith('Pays to '), reason: name);
      }
    });

    test('a settled card loses both cycle dates', () {
      // `dueDate`/`minPayment` are the web's explicit `undefined`, not absent keys: the
      // caller spreads the result over the card, so an absent key would *keep* the stale
      // deadline on a card that has no debt left.
      for (final String name in <String>[
        'runCycleRollover(credit balance (no debt) -> clears dates)',
        'runCycleRollover(zero balance with a due date)',
      ]) {
        final CycleRolloverResult r = rolloverAt(name)!;
        expect(r.dueDate, isNull, reason: name);
        expect(r.minPayment, isNull, reason: name);
        expect(r.charges, isEmpty, reason: name);
      }
    });
  });

  test('a second rollover of the same cycle charges it twice (measured, not assumed)', () {
    // `INVENTORY.md` §5.3's reason for the reference key the web deduplicates with. The
    // function is not idempotent and this fixture measures that rather than asserting it
    // is safe: the second call carries the first call's interest into the balance and
    // charges interest on it again. A Flutter port that re-ran this on every app open,
    // with no deduplication, would overcharge a real card.
    const String name = 'runCycleRollover applied twice double-charges';
    expect(named('runCycleRollover applied'), hasLength(1));
    final Map<String, Object?> want = expected(name)! as Map<String, Object?>;
    final CycleRolloverResult first = rolloverAt(name, call: 0)!;
    final CycleRolloverResult second = rolloverAt(name, call: 1)!;
    expect(first.currentBalance, want['firstBalance'], reason: name);
    expect(second.currentBalance, want['secondBalance'], reason: name);
    expect(
      second.currentBalance,
      isNot(first.currentBalance),
      reason: '$name: a rollover that had already run would be idempotent',
    );
  });

  test('every case recorded by generate.ts was consumed', () {
    expect(fixtureNames, hasLength(19));
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
