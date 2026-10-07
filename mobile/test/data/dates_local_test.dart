import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/dates_local.dart';
import 'package:em_budget/data/js_semantics.dart';
import 'package:flutter_test/flutter_test.dart';

import 'web_source.dart';

/// The **local** date regime, replayed against `parity/fixtures/dates-local.json`
/// (78 cases measured from `src/utils.ts:22-83` at `Asia/Colombo`).
///
/// Each group drives itself from the fixture's own case names rather than a list
/// transcribed here, because a transcribed list silently shrinks: if `generate.ts`
/// drops a start day, a hand-written loop keeps passing against a smaller matrix. The
/// last test then asserts that every recorded name was consumed, so a unit *added* on
/// the web shows up as a failure in this file instead of as an untested port.
void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Object?> expectedByName = <String, Object?>{};
  final Map<String, List<Object?>> inputByName = <String, List<Object?>>{};
  final Set<String> consumed = <String>{};

  late final int pinnedMs;

  Object? expected(String name) {
    if (!expectedByName.containsKey(name)) {
      throw StateError('No such fixture case: $name');
    }
    consumed.add(name);
    return expectedByName[name];
  }

  List<Object?> inputOf(String name) => inputByName[name]!;

  /// Every recorded case whose name starts with [prefix], in fixture order.
  List<String> named(String prefix) =>
      fixtureNames.where((String n) => n.startsWith(prefix)).toList();

  /// `undefined` in the fixture, `null` in Dart — the convention the whole data layer
  /// uses (`parity/DATA_SPEC.md`).
  String? argString(Object? value) => value is String ? value : null;

  /// Read before any `group()` is declared, because the groups below iterate over
  /// [fixtureNames] at *collection* time. A `setUpAll` would run after the body of
  /// `main()`, and every loop would silently build zero tests — the exact failure mode
  /// this file exists to prevent. Shape violations throw rather than `expect`, for the
  /// same reason: there is no test binding yet.
  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity/fixtures/dates-local.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> prov =
        root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/utils.ts') {
      throw StateError('dates-local.json is not from src/utils.ts');
    }
    pinnedMs = jsDateToEpochMs(prov['pinnedNow'])!;

    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (expectedByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      fixtureNames.add(name);
      expectedByName[name] = entry['expected'];
      inputByName[name] = entry['input']! as List<Object?>;
    }
    // A shrink is as much a failure as a growth: this suite is written against the
    // whole recorded matrix, not against whatever happens to be present.
    if (fixtureNames.length != 78) {
      throw StateError(
        'Expected 78 dates-local cases, found ${fixtureNames.length}',
      );
    }
    // The prefixes below are the whole of it; a case under no prefix is a case nobody
    // dispatches, and would otherwise be dropped without a trace.
    final int dispatched =
        named('localDayKey(').length +
        named('todayLocal').length +
        named('isInCurrentMonth(').length +
        named('isAlertDayRecent(').length +
        named('addMonthsClamped(').length +
        1; // the cross-regime comparison, dispatched by its full name
    if (dispatched != fixtureNames.length) {
      throw StateError(
        '$dispatched of ${fixtureNames.length} dates-local cases are dispatched',
      );
    }
  }

  loadFixture();

  group('localDayKey — the local day, never the UTC day (:22-24)', () {
    for (final String name in named('localDayKey(')) {
      if (name == 'localDayKey(Invalid Date)') {
        test(name, () {
          // `new Date('invalid')` is an Invalid Date, and the web's template literal
          // publishes `NaN-NaN-NaN`. Dart has no such value: `jsDateToEpochMs` returns
          // `null` and every caller must choose a fallback. That choice is the ported
          // behaviour, so it is asserted here rather than glossed over.
          expect(jsDateToEpochMs('invalid'), isNull);
          expect(dayStartMs('invalid'), isNull);
          expect(expected(name), 'NaN-NaN-NaN');
        });
        continue;
      }
      test(name, () {
        final int ms = jsDateToEpochMs(inputOf(name).single)!;
        expect(
          localDayKey(DateTime.fromMillisecondsSinceEpoch(ms)),
          expected(name),
        );
      });
    }

    test('todayLocal() at the pinned clock', () {
      expect(
        todayLocal(nowMs: pinnedMs),
        expected('todayLocal() [pinned now]'),
      );
    });
  });

  group('isInCurrentMonth (:51-58)', () {
    for (final String name in named('isInCurrentMonth(')) {
      test(name, () {
        expect(
          isInCurrentMonth(argString(inputOf(name).single), nowMs: pinnedMs),
          expected(name),
        );
      });
    }
  });

  group('isAlertDayRecent (:61-67)', () {
    for (final String name in named('isAlertDayRecent(')) {
      test(name, () {
        expect(
          isAlertDayRecent(argString(inputOf(name).single), nowMs: pinnedMs),
          expected(name),
        );
      });
    }
  });

  group(
    'addMonthsClamped — B-02, clamped one way and ported broken (:76-83)',
    () {
      // The whole matrix the web measured: every start day that can overflow — plus the
      // input-tolerance probes — against -13, -1, 0, 1, 12 and 25 months.
      // `2026-01-31 + 1` is `2026-02-28`, and `2028-02-29 + 12` is `2029-02-28`: the
      // anniversary is gone for good.
      for (final String name in named('addMonthsClamped(')) {
        test(name, () {
          final List<Object?> args = inputOf(name);
          expect(
            addMonthsClamped(args[0]! as String, (args[1]! as num).toInt()),
            expected(name),
          );
        });
      }

      test('the two date regimes disagree on what a date even is', () {
        const String name =
            'dates-local: addMonthsClamped vs advanceDueDate input tolerance';
        final Map<String, Object?> both =
            expected(name)! as Map<String, Object?>;
        final String iso = inputOf(name).single! as String;
        expect(addMonthsClamped(iso, 1), both['addMonthsClamped']);
        // The other half is `advanceDueDate` (`src/lib/creditCards.ts:75-89`), which
        // belongs to the money engine and to the *UTC string* regime. It is recorded
        // here for the divergence, not replayed: its `parseDateParts` regex is
        // anchored (`$/`), so a timestamp is not a due date at all and the function
        // echoes the input, while `dayStartMs`'s unanchored prefix regex reads the
        // same string and re-anchors it to a local day. One value, two answers, both
        // correct for their own unit — `INVENTORY.md` §5.1.
        expect(both['advanceDueDate'], iso);
      });

      test('whitespace does not defeat the prefix match', () {
        // `dayStartMs` trims before matching, and the web's `addMonthsClamped` returns
        // the *untrimmed* original only when nothing matched at all.
        expect(dayStartMs(' 2026-10-04 '), isNotNull);
        expect(addMonthsClamped(' 2026-10-04 ', 1), '2026-11-04');
      });
    },
  );

  test('every fixture case is accounted for', () {
    expect(consumed, equals(fixtureNames.toSet()));
  });
}
