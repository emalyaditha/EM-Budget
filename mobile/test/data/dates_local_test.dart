import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/dates_local.dart';
import 'package:em_budget/data/js_semantics.dart';
import 'package:flutter_test/flutter_test.dart';

import 'web_source.dart';

/// The zone `parity/fixtures/dates-local.json` was measured in, per its `_provenance.tz`.
///
/// A constant, not a lookup: `Sri Lanka` has kept UTC+05:30 since 1945 and has no DST, and
/// the Dart SDK ships no tz database, so resolving an IANA name here would mean adding
/// `package:timezone` to a parity-only seam. [_assertMeasuredZone] below is what makes the
/// constant safe — the fixture has to keep saying the same thing.
const Duration kMeasuredZone = Duration(hours: 5, minutes: 30);

/// The fixture's `_provenance.tz`, which the shift is only valid for.
void _assertMeasuredZone(Object? tz) {
  if (tz != 'Asia/Colombo') {
    throw StateError(
      'dates-local.json was measured in "$tz", but this replay shifts instants to the '
      'fixed +05:30 that kMeasuredZone records. Re-measure the fixture in the zone the '
      'replay claims, or teach the replay to resolve this name.',
    );
  }
}

/// Whether JavaScript would have resolved [input] without consulting the machine.
///
/// ECMA-262 splits the date grammar in two: a date-*only* string (`2026-01-01`) is **UTC
/// midnight**, and any date-time carrying an offset or a `Z` is an absolute instant —
/// neither depends on the host. A date-time *without* an offset (`2026-10-04T00:00:00`) is
/// local, and V8's `YYYY-M-D` heuristic is local too; those resolve to the host's own wall
/// clock, and their fields are the literal wherever they run, so shifting them would move
/// the very day they exist to pin.
bool _resolvedOutOfHostZone(String input) {
  final String trimmed = input.trim();
  return RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(trimmed) ||
      RegExp(r'(?:Z|[+-]\d{2}:?\d{2})$').hasMatch(trimmed);
}

/// [ms] re-expressed so this host shows the wall clock the measurement zone showed.
///
/// The host's fields of the shifted instant are `ms + (measured − host) + host`, i.e.
/// `ms + measured` — the measurement zone's fields — which is why the shift is exact rather
/// than approximate. It is only exact while the host's offset is the same at both ends, so
/// a host whose DST boundary falls inside the fixture's window fails loudly here instead of
/// reporting a golden mismatch that is really a zone artefact.
int _shiftToMeasuredZone(int ms) {
  final Duration host = DateTime.fromMillisecondsSinceEpoch(ms).timeZoneOffset;
  final int shifted = ms + (kMeasuredZone - host).inMilliseconds;
  final Duration hostAtShifted = DateTime.fromMillisecondsSinceEpoch(shifted)
      .timeZoneOffset;
  if (hostAtShifted != host) {
    throw StateError(
      'Cannot replay $ms outside the host zone: the offset at the instant is '
      '${host.inMinutes} min but at the replayed instant it is '
      '${hostAtShifted.inMinutes} min — a DST boundary sits inside the fixture window.',
    );
  }
  return shifted;
}

/// The epoch a fixture input denotes, ready to hand to the port on *this* machine.
int replayMs(String input) {
  final int? ms = jsDateToEpochMs(input);
  if (ms == null) {
    throw StateError('Fixture input is not a date the port can read: $input');
  }
  return _resolvedOutOfHostZone(input) ? _shiftToMeasuredZone(ms) : ms;
}

/// The **local** date regime, replayed against `parity/fixtures/dates-local.json`
/// (78 cases measured from `src/utils.ts:22-83` at `Asia/Colombo`).
///
/// The replay is host-zone independent, which the previous version of this file was not.
/// `localDayKey` reads the host's zone the way the browser reads the browser's, and the
/// goldens are the *Colombo* readings of an absolute instant, so on CI's UTC runners
/// `2026-10-04T18:30:00Z` came back as `2026-10-04` instead of the recorded
/// `2026-10-05`. [replayMs] shifts each host-independent instant by the difference
/// between the measurement zone and this host, so the host displays the wall clock the
/// measurement saw and the goldens mean what they say anywhere — `Asia/Colombo`, UTC and
/// the three CI zones alike. Naive date-times are deliberately *not* shifted: the host
/// resolves them, on the web as here.
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

  /// The same instant before the zone shift — kept only so the replay can be checked
  /// against an independent reading of the measurement zone below.
  late final int rawPinnedMs;

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
    _assertMeasuredZone(prov['tz']);
    pinnedMs = replayMs(prov['pinnedNow']! as String);
    rawPinnedMs = jsDateToEpochMs(prov['pinnedNow']! as String)!;

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
        final int ms = replayMs(inputOf(name).single! as String);
        expect(
          localDayKey(DateTime.fromMillisecondsSinceEpoch(ms)),
          expected(name),
        );
      });
    }

    test(
      'the shift is the measurement zone, not a number that happens to fit',
      () {
        // A second, independent route to the same answer: read the instant off UTC and add
        // +05:30, which is what a Colombo browser displays. It agrees with the shifted-host
        // reading only if the shift is arithmetically right on this machine, so this test is
        // what stops a future edit from making the replay pass by moving both sides together.
        for (final String name in named('localDayKey(')) {
          if (name == 'localDayKey(Invalid Date)') continue;
          final String input = inputOf(name).single! as String;
          if (!_resolvedOutOfHostZone(input)) continue;
          final int raw = jsDateToEpochMs(input)!;
          expect(
            localDayKey(DateTime.fromMillisecondsSinceEpoch(replayMs(input))),
            localDayKey(
              DateTime.fromMillisecondsSinceEpoch(
                raw,
                isUtc: true,
              ).add(kMeasuredZone),
            ),
            reason: name,
          );
        }
        expect(
          localDayKey(DateTime.fromMillisecondsSinceEpoch(pinnedMs)),
          localDayKey(
            DateTime.fromMillisecondsSinceEpoch(
              rawPinnedMs,
              isUtc: true,
            ).add(kMeasuredZone),
          ),
        );
      },
    );

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
