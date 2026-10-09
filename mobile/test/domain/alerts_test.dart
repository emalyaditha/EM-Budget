import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/number_locale.dart';
import 'package:em_budget/domain/alerts.dart';
import 'package:em_budget/domain/money.dart';
import 'package:em_budget/models/app_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/lib/alerts.ts` replayed against `parity/fixtures/alerts.json` — 40 cases measured
/// from that file at the `pre-flutter` tag (`LOGIC_SPEC.md` §8).
///
/// **The fixed clock is this file's reason to exist.** `computeAlerts` and `daysRemaining`
/// both default their reference day to `Date.now()`, so without a pinned instant the
/// golden would have been measured once and could never be re-measured: a bill "due
/// today" is only due today on one date. `_provenance.pinnedNow` is that instant
/// (`2026-10-04T04:30:00.000Z`) and every case also carries it in `input`, so the
/// assertions below use the fixture's own number and the first test proves the two
/// agree. Nothing here calls `DateTime.now()`.
///
/// The second injection is the locale: the web's shadow `formatMoney` calls
/// `toLocaleString(undefined, …)`, which is the *device's* locale (D25), so replaying a
/// golden measured under `en-US` names `en-US` explicitly and the app itself never does.
void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Object?> expectedByName = <String, Object?>{};
  final Map<String, List<Object?>> inputByName = <String, List<Object?>>{};
  final Set<String> consumed = <String>{};
  late final Map<String, Object?> prov;

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

  late final JsNumberLocale goldenLocale;
  late final int pinnedNow;

  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}alerts.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    prov = root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/lib/alerts.ts') {
      throw StateError('alerts.json is not from src/lib/alerts.ts');
    }
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'alerts.json claims generatedFrom ${prov['generatedFrom']}; '
        'fixtures are measured from the pre-flutter tag only',
      );
    }
    if (prov['locale'] != 'en-US') {
      throw StateError(
        'alerts.json was generated with locale ${prov['locale']}, which this suite '
        'would have to inject instead of en-US',
      );
    }
    goldenLocale = JsNumberLocale.resolve('en-US');
    pinnedNow = DateTime.parse(prov['pinnedNow']! as String)
        .millisecondsSinceEpoch;

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
      throw StateError('alerts.json carries no cases');
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
    if (raw is List<Object?>) return raw.map(deref).toList();
    return raw;
  }

  /// The reference day a `computeAlerts`/`daysRemaining` case was measured against, read
  /// out of the case itself rather than assumed from the provenance.
  int argTodayMs(String name) {
    final List<Object?> input = inputOf(name);
    if (input.length < 2) {
      throw StateError('$name: no reference day in input');
    }
    final Object? value = input[1];
    if (value is int) return value;
    if (value is num) return value.toInt();
    throw StateError('$name: reference day is not a number ($value)');
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
        case 'NaN':
          expect(actual.isNaN, isTrue, reason: name);
        case '-0':
          // `-0` is why this branch exists: `expect(-0.0, 0)` is **green in Dart**, so a
          // port that returned a plain 0 for a bill due today would pass. A bill due
          // *today* is `Math.ceil(-0.229)` and the golden insists on the sign.
          expect(
            actual == 0 && actual is double && actual.isNegative,
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

  group('the pinned clock', () {
    test('is the reference day every case actually carries', () {
      for (final String name in <String>[
        ...named('daysRemaining('),
        ...named('computeAlerts('),
      ]) {
        if (inputOf(name).length < 2) continue;
        expect(argTodayMs(name), pinnedNow, reason: name);
      }
    });
  });

  test('BUDGET_WARN_AT', () {
    expect(expected('BUDGET_WARN_AT'), budgetWarnAt);
  });

  group('daysRemaining', () {
    test('every fixture case', () {
      for (final String name in named('daysRemaining(')) {
        final Object? raw = inputOf(name)[0];
        if (raw is! String) {
          throw StateError('$name: date is not a string ($raw)');
        }
        expectNum(name, daysRemaining(raw, argTodayMs(name)));
      }
    });
  });

  group('computeAlerts', () {
    // The one case whose expected value is not the alert list: it compares this file's
    // shadow formatter with `money.ts`'s, which is the space-difference landmine
    // (`INVENTORY.md` §5.5 — three `formatMoney`s).
    const String spacingCase =
        'computeAlerts(currency spacing differs from lib/money formatMoney)';

    test('every fixture case', () {
      for (final String name in named('computeAlerts(')) {
        if (name == spacingCase) continue;
        final Object? raw = inputOf(name)[0];
        if (raw is! Map<String, Object?>) {
          throw StateError('$name: state is not an object ($raw)');
        }
        final List<FinanceAlert> alerts = computeAlerts(
          AppState.fromJson(raw),
          argTodayMs(name),
          goldenLocale,
        );
        expect(
          alerts.map((FinanceAlert a) => a.toJson()).toList(),
          deref(expected(name)) as List<Object?>,
          reason: name,
        );
      }
    });

    test(spacingCase, () {
      final Object? raw = inputOf(spacingCase)[0];
      final List<FinanceAlert> alerts = computeAlerts(
        AppState.fromJson(raw! as Map<String, Object?>),
        argTodayMs(spacingCase),
        goldenLocale,
      );
      final Map<String, Object?> want =
          expected(spacingCase)! as Map<String, Object?>;
      expect(
        alerts.first.detail,
        want['alertsDetail'],
        reason: 'the alert tray writes "Rs. 1,200"',
      );
      expect(
        formatMoney('Rs.', 1200, const FormatMoneyOptions(), goldenLocale),
        want['sharedFormatMoney'],
        reason: 'money.ts writes "Rs.1,200" — no space, and neither is unified',
      );
    });
  });

  group('the parts of §8 that a refactor would change', () {
    test('the space in the alert tray is not the space in money.ts', () {
      final List<FinanceAlert> alerts = computeAlerts(
        AppState.fromJson(<String, Object?>{
          'currency': 'Rs.',
          'subscriptions': <Object?>[
            <String, Object?>{
              'id': 's1',
              'name': 'Netflix',
              'amount': 1500,
              'status': 'Active',
              'dueDate': '2026-10-04',
              'billingCycle': 'Monthly',
              'category': 'Entertainment',
            },
          ],
        }),
        pinnedNow,
        goldenLocale,
      );
      expect(alerts.single.detail, 'Rs. 1,500 (Monthly).');
      expect(
        formatMoney('Rs.', 1500, const FormatMoneyOptions(), goldenLocale),
        'Rs.1,500',
      );
    });

    test('an undated or unparseable due date is silent, never "overdue"', () {
      // `Infinity` fails `d >= 0 && d <= 1` rather than wrapping around, so a corrupt
      // date produces no alert at all. Treating a missing date as overdue would add a
      // nag the web never shows.
      expect(daysRemaining('garbage', pinnedNow), double.infinity);
      expect(daysRemaining('', pinnedNow), double.infinity);
      expect(
        computeAlerts(
          AppState.fromJson(<String, Object?>{
            'currency': 'Rs.',
            'subscriptions': <Object?>[
              <String, Object?>{
                'id': 's1',
                'name': 'Netflix',
                'amount': 1500,
                'status': 'Active',
                'dueDate': 'not-a-date',
                'billingCycle': 'Monthly',
                'category': 'Entertainment',
              },
            ],
          }),
          pinnedNow,
          goldenLocale,
        ),
        isEmpty,
      );
    });

    test('a goal past its target date goes quiet', () {
      // `d < 0 → continue`, so the seven-day window is one-sided. This is the branch a
      // "helpful" port would turn into an overdue alert.
      final List<FinanceAlert> alerts = computeAlerts(
        AppState.fromJson(<String, Object?>{
          'currency': 'Rs.',
          'savingsGoals': <Object?>[
            <String, Object?>{
              'id': 'g1',
              'name': 'Japan Trip',
              'targetDate': '2026-09-04',
              'current': 100,
              'target': 1000,
            },
          ],
        }),
        pinnedNow,
        goldenLocale,
      );
      expect(alerts, isEmpty);
    });

    test('budget spending is this month only, not the envelope total', () {
      // `spent` on the row is ignored and the ledger is summed for the reference
      // month, so a 2025 expense against the same category contributes nothing.
      final List<FinanceAlert> alerts = computeAlerts(
        AppState.fromJson(<String, Object?>{
          'currency': 'Rs.',
          'budgets': <Object?>[
            <String, Object?>{
              'id': 'b1',
              'category': 'Shopping',
              'limit': 1000,
              'spent': 900,
            },
          ],
          'transactions': <Object?>[
            <String, Object?>{
              'id': 'tx-old',
              'title': 'Last year',
              'category': 'Shopping',
              'type': 'expense',
              'amount': 5000,
              'date': '2025-10-02',
            },
          ],
        }),
        pinnedNow,
        goldenLocale,
      );
      expect(alerts, isEmpty);
    });

    test('a withdrawal is not spending', () {
      expect(
        computeAlerts(
          AppState.fromJson(<String, Object?>{
            'currency': 'Rs.',
            'budgets': <Object?>[
              <String, Object?>{
                'id': 'b1',
                'category': 'Shopping',
                'limit': 1000,
                'spent': 0,
              },
            ],
            'transactions': <Object?>[
              <String, Object?>{
                'id': 'tx-1',
                'title': 'ATM',
                'category': 'Shopping',
                'type': 'withdrawal',
                'amount': 900,
                'date': '2026-10-02',
              },
            ],
          }),
          pinnedNow,
          goldenLocale,
        ),
        isEmpty,
      );
    });
  });

  test('every fixture case was consumed', () {
    final List<String> unconsumed = fixtureNames
        .where((String n) => !consumed.contains(n))
        .toList();
    expect(unconsumed, isEmpty, reason: 'unported cases: $unconsumed');
    expect(consumed.length, 40, reason: 'alerts.json case count');
  });
}
