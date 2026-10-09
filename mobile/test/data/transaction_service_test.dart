import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/transaction_service.dart';
import 'package:em_budget/models/entities.dart';
import 'package:flutter_test/flutter_test.dart';

import 'web_source.dart';

/// `src/services/transactionService.ts` replayed against the fixtures generated
/// from it (`parity/fixtures/transaction-service.json`), plus the cases the
/// fixture set cannot carry — a Dart `double` amount, and a sort tie that the
/// web's stable `Array.prototype.sort` resolves by input order.
///
/// Every replayed call is built from the case's **recorded `input` array**, not
/// from rows copied into this file. That is the point: `parity/fixtures/validate.ts`
/// check 5 rejects a fixture whose recorded input does not determine its expected
/// output, so a suite that hand-built its own arguments would be a second copy of
/// the generator and could pass without replaying anything. `filterRows()` and its
/// literals used to live here; #64 replaced them.
///
/// The last test in this file asserts that **every** case in the fixture was
/// consumed, so a case added on the web side fails the suite instead of being
/// silently ignored by the port.

void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Map<String, Object?>> casesByName =
      <String, Map<String, Object?>>{};
  final Set<String> consumed = <String>{};

  Map<String, Object?> caseOf(String name) {
    if (!casesByName.containsKey(name)) {
      throw StateError('No such fixture case: $name');
    }
    consumed.add(name);
    return casesByName[name]!;
  }

  /// The argument list the web was actually called with, in the web's own
  /// positional order. Trailing elements are absent when the generator used the
  /// function's default, which is why each replay reads them optionally.
  List<Object?> inputOf(String name) => caseOf(name)['input']! as List<Object?>;

  setUpAll(() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity/fixtures/transaction-service.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final Map<String, Object?> provenance =
        root['_provenance']! as Map<String, Object?>;
    expect(provenance['unitFile'], 'src/services/transactionService.ts');
    // The date-bucket cases below read the device clock the way the web does, so
    // they are only comparable to the recorded fixture while the runner sits in
    // the zone the fixture was captured in.
    expect(provenance['tz'], isNotNull);
    expect(provenance['generatedFrom'], 'pre-flutter');

    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (casesByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      fixtureNames.add(name);
      casesByName[name] = entry;
    }
    // The unit as `generate.ts` emits it. A case added there must be consumed
    // below, and one removed must be deleted here.
    expect(fixtureNames.length, 39);
  });

  // =========================================================================
  // The recorded input → the port's arguments.
  // =========================================================================

  /// A fixture row, with the values JSON could not carry removed so an absent
  /// field stays absent. `{"__sentinel__": "undefined"}` has no Dart equivalent in
  /// a typed model — `readString` substitutes `''` (`lib/models/json_reader.dart:24-32`)
  /// — and that substitution is itself asserted, never hidden.
  Map<String, Object?> plainRow(Object? row) => (row! as Map<String, Object?>)
      .entries
      .where((MapEntry<String, Object?> e) => !_isSentinel(e.value))
      .fold(
        <String, Object?>{},
        (Map<String, Object?> out, MapEntry<String, Object?> e) =>
            out..[e.key] = e.value,
      );

  /// The web's `Transaction` is a bag of optional properties; the model is typed,
  /// so the row is decoded rather than cast.
  List<Transaction> rowsOf(Object? recorded) => (recorded! as List<Object?>)
      .map((Object? row) => Transaction.fromJson(plainRow(row)))
      .toList(growable: false);

  /// A fixture row, decoded to the map `Transaction.toJson()` produces.
  List<Map<String, Object?>> expectedRows(String name) {
    final Object? expected = caseOf(name)['expected'];
    return (expected! as List<Object?>).map(plainRow).toList();
  }

  String? stringArg(List<Object?> args, int index) =>
      index < args.length ? args[index]! as String : null;

  /// `getFilteredTransactions(rows, q, category, type, account)` — the four
  /// optional filters fall back to the web's own defaults (`''`, `'all'`).
  List<Map<String, Object?>> replayFilter(String name) {
    final List<Object?> args = inputOf(name);
    return TransactionService.getFilteredTransactions(
      rowsOf(args[0]),
      searchQuery: stringArg(args, 1) ?? '',
      categoryFilter: stringArg(args, 2) ?? 'all',
      typeFilter: stringArg(args, 3) ?? 'all',
      accountFilter: stringArg(args, 4) ?? 'all',
    ).map((Transaction t) => t.toJson()).toList();
  }

  /// `sortTransactionsByDate(rows, order)` — the port returns ids for the golden,
  /// which records the id sequence.
  List<String> replaySort(String name) {
    final List<Object?> args = inputOf(name);
    return TransactionService.sortTransactionsByDate(
      rowsOf(args[0]),
      order: stringArg(args, 1) ?? 'desc',
    ).map((Transaction t) => t.id).toList();
  }

  List<String> idsOf(String name) =>
      ((caseOf(name)['expected'])! as List<Object?>)
          .map((Object? id) => id! as String)
          .toList();

  /// `getMonthlyTotals(rows)`. The web reads `new Date()` for the bucket; the
  /// fixture pins it, so the port is handed the same instant.
  Map<String, Object?> replayTotals(String name) =>
      TransactionService.getMonthlyTotals(
        rowsOf(inputOf(name)[0]),
        now: _pinnedNow(),
      ).toJson();

  // =========================================================================
  // getFilteredTransactions
  // =========================================================================

  group('getFilteredTransactions', () {
    for (final String query in <String>[
      '',
      'salar',
      'SALARY',
      '185',
      '1E',
      'zzz',
      ' ',
    ]) {
      final String name = 'getFilteredTransactions(search="$query")';
      test('search="$query" replays the recorded argument list', () {
        expect(replayFilter(name), equals(expectedRows(name)));
      });
    }

    test(
      'the category filter is exact-case, as the web compares raw values',
      () {
        // Both cases are in the fixture; `'shopping'` matching nothing is the defect,
        // not a simplification (`RULE 5`).
        expect(
          replayFilter('getFilteredTransactions(category exact case)'),
          isEmpty,
        );
        expect(
          replayFilter('getFilteredTransactions(category correct case)'),
          equals(
            expectedRows('getFilteredTransactions(category correct case)'),
          ),
        );
      },
    );

    test('the type filter selects on `type`', () {
      const String name = 'getFilteredTransactions(type=expense)';
      expect(replayFilter(name), equals(expectedRows(name)));
    });

    test('the account filter reaches a row from either end', () {
      for (final String name in <String>[
        'getFilteredTransactions(account=targetAccountId)',
        'getFilteredTransactions(account=targetAccountId of transfer)',
      ]) {
        expect(replayFilter(name), equals(expectedRows(name)), reason: name);
      }
    });

    test('a row with no title or category does not throw on an empty query', () {
      // The web's `matchesSearch` is `searchQuery === '' || tx.title.toLowerCase()…`,
      // so the empty query short-circuits the `||` **before** `title` is touched:
      // these two fixture cases are named "-> throws" but record a row, not an
      // error. The port has to reproduce that, not a null check.
      for (final String name in <String>[
        'getFilteredTransactions(row missing title -> throws)',
        'getFilteredTransactions(row missing category -> throws)',
      ]) {
        final String field = name.contains('title') ? 'title' : 'category';
        final Map<String, Object?> webRow =
            (caseOf(name)['expected']! as List<Object?>).single!
                as Map<String, Object?>;
        final List<Map<String, Object?>> actual = replayFilter(name);

        // Every field the web could spell out comes back identical…
        expect(actual.single['id'], 'tx-1');
        expect(
          Map<String, Object?>.of(actual.single)..remove(field),
          equals(
            Map<String, Object?>.of(expectedRows(name).single)..remove(field),
          ),
          reason: name,
        );
        // …and the one it cannot is the recorded deviation. The web still carries
        // the field as `undefined`, which the fixture keeps as a sentinel; the typed
        // model substitutes `''` (`lib/models/json_reader.dart:24-32`), so the key is
        // present with the empty string instead of absent-or-undefined.
        expect(webRow, contains(field), reason: name);
        expect(_isSentinel(webRow[field]), isTrue, reason: name);
        expect(actual.single[field], '', reason: name);
      }
    });
  });

  // =========================================================================
  // sortTransactionsByDate
  // =========================================================================

  group('sortTransactionsByDate', () {
    test('desc walks all four tie-break levels', () {
      const String name = 'sortTransactionsByDate(desc) 4-level tiebreak';
      expect(replaySort(name), equals(idsOf(name)));
    });

    test('asc negates each level rather than reversing the output', () {
      const String name = 'sortTransactionsByDate(asc) 4-level tiebreak';
      expect(replaySort(name), equals(idsOf(name)));
    });

    test('the id tie-break is localeCompare, not code-unit order', () {
      // `a9b` vs `ab9` is the only pair where the two disagree in this dataset:
      // ICU weighs the digit below the letter, and `'a'.localeCompare('B')` folds
      // case, which `compareTo` would not. Stated here as a literal so a change to
      // the golden's order is visible as a diff, not absorbed by a replay.
      expect(idsOf('sortTransactionsByDate(desc) 4-level tiebreak'), <String>[
        'b1',
        'tx-1-2',
        'ab9',
        'a9b',
        'a2',
        'a1',
        'z1',
        'z2',
      ]);
      expect(
        replaySort('sortTransactionsByDate(desc) 4-level tiebreak'),
        equals(idsOf('sortTransactionsByDate(desc) 4-level tiebreak')),
      );
    });

    test('an empty list sorts to an empty list', () {
      const String name = 'sortTransactionsByDate(empty)';
      expect(rowsOf(inputOf(name)[0]), isEmpty);
      expect(replaySort(name), isEmpty);
      expect(caseOf(name)['expected'], isEmpty);
    });

    test('the stamp hunt prefers updated_at over date', () {
      const String name =
          'sortTransactionsByDate(prefers updated_at over date)';
      // The golden's rows are the point: `p1` carries a December stamp behind a
      // January `date`, so it sorts after `p2` only if the stamp wins.
      expect(replaySort(name), equals(idsOf(name)));
      expect(rowsOf(inputOf(name)[0]).first.updatedAt, isNotNull);
    });

    test('the camelCase spelling is honoured', () {
      const String name = 'sortTransactionsByDate(camelCase keys honoured)';
      expect(replaySort(name), equals(idsOf(name)));
      // `c1` carries `updatedAt`, not `updated_at`; a reader that took only the
      // snake_case spelling would sort it by `date` and produce `['c2', 'c1']`.
      expect(rowsOf(inputOf(name)[0]).first.updatedAt, isNotNull);
    });

    test('createdAt is the third stop in the hunt', () {
      // Not in the fixture set, but the web reads
      // `updated_at || updatedAt || created_at || createdAt || date`, and the
      // relational pull writes both spellings of the stamp (`INVENTORY.md` §6),
      // so a row that carries only a creation stamp must still sort on it.
      final List<Transaction> rows = <Transaction>[
        txRow(
          id: 'early',
          date: '2026-01-01',
          createdAt: '2025-01-01T00:00:00Z',
        ),
        txRow(
          id: 'late',
          date: '2026-01-01',
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ];
      expect(
        TransactionService.sortTransactionsByDate(rows)
            .map((Transaction t) => t.id)
            .toList(),
        <String>['late', 'early'],
      );
    });

    test('rows equal on all four levels keep their input order', () {
      // `INVENTORY.md` §5.7: JavaScript's sort is stable, Dart's is not. Two rows
      // that tie every level have no defined order in Dart unless the comparator
      // decorates by index, which `sortTransactionsByDate` does.
      final List<Transaction> rows = <Transaction>[
        txRow(id: 'dup', date: '2026-10-02', amount: 1),
        txRow(id: 'dup', date: '2026-10-02', amount: 2),
        txRow(id: 'dup', date: '2026-10-02', amount: 3),
      ];
      for (final String order in <String>['desc', 'asc']) {
        final List<Transaction> sorted =
            TransactionService.sortTransactionsByDate(rows, order: order);
        expect(sorted.map((Transaction t) => t.amount).toList(), <num>[
          1,
          2,
          3,
        ], reason: order);
      }
    });

    test('the input list is not mutated', () {
      final List<Transaction> rows = rowsOf(
        inputOf('sortTransactionsByDate(desc) 4-level tiebreak')[0],
      );
      final List<String> before = rows.map((Transaction t) => t.id).toList();
      TransactionService.sortTransactionsByDate(rows);
      expect(rows.map((Transaction t) => t.id).toList(), before);
    });
  });

  // =========================================================================
  // getMonthlyTotals
  // =========================================================================

  group('getMonthlyTotals', () {
    /// The device's offset at the pinned instant, measured without going through
    /// `DateTime.fromMillisecondsSinceEpoch` — that conversion is the call under
    /// test, so the expectation must not be built with it.
    Duration offsetAtPinned() {
      final DateTime local = _pinnedNow();
      return DateTime.utc(
        local.year,
        local.month,
        local.day,
        local.hour,
        local.minute,
        local.second,
        local.millisecond,
        local.microsecond,
      ).difference(local);
    }

    /// The web's own rule: the date-only string is UTC midnight, the month is local.
    bool fallsInPinnedMonth(String dateOnly) {
      final DateTime? utcMidnight = DateTime.tryParse('${dateOnly}T00:00:00Z');
      if (utcMidnight == null) return false;
      final DateTime local = utcMidnight.add(offsetAtPinned());
      return local.month == 10 && local.year == 2026;
    }

    for (final String type in <String>[
      'income',
      'deposit',
      'expense',
      'credit_card_charge',
      'withdrawal',
    ]) {
      test('$type lands in the sum its bucket list says', () {
        final String name = 'getMonthlyTotals($type)';
        expect(replayTotals(name), equals(caseOf(name)['expected']));
      });
    }

    for (final String type in <String>[
      'debt_payment',
      'transfer',
      'financing',
    ]) {
      test('$type is in neither sum', () {
        // `financing` is not in the web's `TransactionType` union at all, which is
        // itself the point: the bucket lists are hand-maintained (§5.11) and an
        // unlisted type is silently in neither total.
        final String name = 'getMonthlyTotals($type (excluded from both))';
        expect(replayTotals(name), equals(caseOf(name)['expected']));
      });
    }

    test('an empty ledger totals zero', () {
      const String name = 'getMonthlyTotals(empty)';
      expect(rowsOf(inputOf(name)[0]), isEmpty);
      expect(replayTotals(name), equals(caseOf(name)['expected']));
    });

    test('0.1 + 0.2 + 0.3 keeps its binary residue (B-04)', () {
      const String name = 'getMonthlyTotals(float residue survives (B-04))';
      final Map<String, Object?> actual = replayTotals(name);
      expect(actual, equals(caseOf(name)['expected']));
      // The sum is not the cent sum `money.ts` would produce — `money.json`
      // records `0.3` for the same rows. B-04 stays bug-compatible.
      expect(actual['income'], isNot(0.3));
    });

    test('the service total differs from money.ts on the same rows', () {
      const String name =
          'getMonthlyTotals vs money.ts sumMoney of the same rows';
      final Map<String, Object?> expected =
          caseOf(name)['expected'] as Map<String, Object?>;
      final Map<String, Object?> actual = replayTotals(name);
      expect(actual['income'], expected['service']);
      // `viaMoney` is the `money.ts` half of the same measurement; that unit is
      // ported and golden-proven in `money.json`, not replayed here.
      expect(expected['viaMoney'], isNot(expected['service']));
    });

    test('a string amount concatenates on the web and coerces here', () {
      const String name = 'getMonthlyTotals(string amount concatenates)';
      final Map<String, Object?> expected =
          caseOf(name)['expected'] as Map<String, Object?>;
      // The recorded row really does carry `"5"` — the generator pushed a string
      // past the type, so this is the web's behaviour, not a hypothetical.
      expect(
        plainRow((inputOf(name)[0]! as List<Object?>).single)['amount'],
        '5',
      );
      expect(expected['income'], '05');
      expect(expected['netCashFlow'], 5);
      // The model reads a `num` (`readNum`, `lib/models/json_reader.dart:45`), so
      // income is the number. The net agrees; the income does not, and that is the
      // recorded "web throws / phone defaults" class in `parity/DATA_SPEC.md`.
      final Map<String, Object?> actual = replayTotals(name);
      expect(actual['netCashFlow'], expected['netCashFlow']);
      expect(actual['income'], 5);
    });

    group('the month bucket is read on the device', () {
      test('every recorded date case buckets by the web\'s own rule', () {
        // The date is read out of the fixture rather than restated, so adding a
        // date to `generate.ts` lands here without editing this list.
        final List<String> names = fixtureNames
            .where((String n) => n.startsWith('getMonthlyTotals(date '))
            .toList();
        expect(names.length, 8);
        for (final String name in names) {
          final String date = rowsOf(inputOf(name)[0]).single.date;
          final Map<String, Object?> expected =
              caseOf(name)['expected'] as Map<String, Object?>;
          final Map<String, Object?> actual = replayTotals(name);

          final num rule = fallsInPinnedMonth(date) ? 100 : 0;
          expect(
            actual,
            equals(<String, Object?>{
              'income': rule,
              'expense': 0,
              'netCashFlow': rule,
            }),
            reason: name,
          );
          if (actual['income'] != expected['income']) {
            // Only the two month edges can disagree, and only on a runner west of
            // Greenwich: UTC midnight is the previous local day there.
            // `INVENTORY.md` §5.1 records the same dependency for the web.
            expect(<String>['2026-10-01', '2026-11-01'], contains(date));
            expect(
              offsetAtPinned().isNegative,
              isTrue,
              reason: 'disagreement must be a west-of-Greenwich runner',
            );
          } else {
            expect(expected['income'], isNotNull);
          }
        }
      });

      test('an unparseable date matches nothing', () {
        // `new Date('garbage')` is `Invalid Date`; `NaN === currentMonth` is false.
        expect(
          TransactionService.getMonthlyTotals(<Transaction>[
            txRow(type: 'income', amount: 100, date: 'garbage'),
          ], now: _pinnedNow()).income,
          0,
        );
      });
    });
  });

  // =========================================================================
  // Cases the fixture set carries but this port has to express differently.
  // =========================================================================

  group('Dart-side divergences guarded explicitly', () {
    test('a double amount matches the integral search string', () {
      // JavaScript writes `20000`; Dart writes `20000.0`. Without `jsNumberToString`
      // the web's `"20000".includes` match would be missed for the state's floats
      // (`INVENTORY.md` §5.8).
      final List<Transaction> rows = <Transaction>[
        txRow(id: 'd1', amount: 20000.0, title: 'x', category: 'y'),
      ];
      expect(
        TransactionService.getFilteredTransactions(
          rows,
          searchQuery: '20000',
        ).single.id,
        'd1',
      );
      expect(
        TransactionService.getFilteredTransactions(
          rows,
          searchQuery: '20000.0',
        ),
        isEmpty,
      );
    });

    test('a large integral amount keeps the exponential spelling', () {
      final List<Transaction> rows = <Transaction>[
        txRow(id: 'e1', amount: 1e21, title: 'x', category: 'y'),
      ];
      expect(
        TransactionService.getFilteredTransactions(
          rows,
          searchQuery: '1e+21',
        ).single.id,
        'e1',
      );
    });

    test('an unparseable stamp sorts as 0, alongside a missing stamp', () {
      // `isNaN(time)` yields `0`, the same as a row with no stamp at all, so the
      // two must tie and fall through to the date/id levels.
      final List<Transaction> rows = <Transaction>[
        txRow(id: 'ok', date: '2026-10-02', updatedAt: '2026-10-02T10:00:00Z'),
        txRow(id: 'bad', date: '2026-10-02', updatedAt: 'not a date'),
        txRow(id: 'none', date: '2026-10-02'),
      ];
      expect(
        TransactionService.sortTransactionsByDate(rows)
            .map((Transaction t) => t.id)
            .toList(),
        <String>['ok', 'none', 'bad'],
      );
    });

    test('the filters are ANDed', () {
      // Same five rows as every filter case, taken from the fixture. The web has
      // one `where` with four ANDed clauses; nothing here suggests they are ORed.
      final List<Transaction> rows = rowsOf(
        inputOf('getFilteredTransactions(search="")')[0],
      );
      expect(
        TransactionService.getFilteredTransactions(
          rows,
          searchQuery: 'salar',
          typeFilter: 'expense',
        ),
        isEmpty,
      );
      expect(
        TransactionService.getFilteredTransactions(
          rows,
          searchQuery: 'salar',
          typeFilter: 'income',
          accountFilter: 'ca-1',
        ).map((Transaction t) => t.id).toList(),
        <String>['t2'],
      );
    });
  });

  test('every fixture case is accounted for', () {
    // The discipline that keeps this file honest: a case added to
    // `generate.ts` must be consumed here, or a case the port stops testing is
    // invisible. The two "-> throws" cases are replayed above as the short-circuit
    // they actually record.
    expect(consumed, equals(fixtureNames.toSet()));
  });
}

/// The base row `parity/fixtures/generate.ts:293` builds every case from.
///
/// Only the cases that are **not** in the fixture use this — a creation stamp with
/// no update stamp, an exact four-way tie, a Dart-native float. Anything the web
/// measured must come from the recorded input instead.
///
/// The web's helper spreads `over` onto a literal, so an explicit `undefined`
/// clears a field; the Dart equivalent is the `null` default of each optional
/// parameter.
Transaction txRow({
  String id = 'tx-1',
  String type = 'expense',
  String title = 'Groceries',
  num amount = 1200,
  String date = '2026-10-02',
  String category = 'Shopping',
  String? accountId = 'ca-1',
  String? targetAccountId,
  String? updatedAt,
  String? createdAt,
}) {
  return Transaction(
    id: id,
    type: type,
    title: title,
    amount: amount,
    date: date,
    category: category,
    accountId: accountId,
    targetAccountId: targetAccountId,
    updatedAt: updatedAt,
    createdAt: createdAt,
  );
}

/// The web reads `new Date()` for the month bucket, so the fixture pins it to
/// `2026-10-04T04:30:00.000Z` at `Asia/Colombo`. `.getMonth()` is **local**, so
/// the Dart port is handed the local reading of the same instant — which is why
/// the bucket tests below re-derive the rule instead of copying the answer, and
/// why the three-zone leg of CI is what makes that honest (`INVENTORY.md` §5.1).
DateTime _pinnedNow() => DateTime.parse('2026-10-04T04:30:00.000Z').toLocal();

/// A fixture value that JSON could not carry: `undefined`, `NaN`, `-0`.
bool _isSentinel(Object? value) =>
    value is Map<String, Object?> && value.containsKey('__sentinel__');
