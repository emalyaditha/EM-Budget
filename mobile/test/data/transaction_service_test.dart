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
/// The last test in this file asserts that **every** case in the fixture was
/// consumed, so a case added on the web side fails the suite instead of being
/// silently ignored by the port.

/// The base row `parity/fixtures/generate.ts:293` builds every case from.
///
/// The web's helper spreads `over` onto a literal, so an explicit `undefined`
/// clears a field; the Dart equivalent is the `null` default of each optional
/// parameter, and the two required-but-absent cases are built directly.
/// The fixture case for a type that reaches neither sum. `financing` is not in the
/// web's `TransactionType` union at all, which is itself the point: the bucket
/// lists are hand-maintained (`INVENTORY.md` §5.11).
const Map<String, String> excludedCaseNames = <String, String>{
  'debt_payment': 'getMonthlyTotals(debt_payment (excluded from both))',
  'transfer': 'getMonthlyTotals(transfer (excluded from both))',
  'financing': 'getMonthlyTotals(financing (excluded from both))',
};

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

    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (casesByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      fixtureNames.add(name);
      casesByName[name] = entry;
    }
  });

  /// `parity/fixtures/generate.ts:1314-1336` — the five rows the filter uses.
  List<Transaction> filterRows() => <Transaction>[
    txRow(
      id: 't1',
      title: 'Groceries',
      category: 'Shopping',
      type: 'expense',
      amount: 1200,
      date: '2026-10-02',
    ),
    txRow(
      id: 't2',
      title: 'Salary',
      category: 'Salary',
      type: 'income',
      amount: 185000,
      date: '2026-10-01',
    ),
    txRow(
      id: 't3',
      title: 'Card Bill',
      category: 'Bills',
      type: 'debt_payment',
      amount: 5000,
      date: '2026-10-03',
      targetAccountId: 'cc-1',
    ),
    txRow(
      id: 't4',
      title: 'ATM',
      category: 'Cash',
      type: 'withdrawal',
      amount: 20000,
      date: '2026-09-30',
    ),
    txRow(
      id: 't5',
      title: 'In',
      category: 'Transfer In',
      type: 'transfer',
      amount: 700,
      date: '2026-10-04',
      targetAccountId: 'ca-2',
    ),
  ];

  /// A fixture row, decoded to the map `Transaction.toJson()` produces.
  ///
  /// `{"__sentinel__": "undefined"}` has no Dart equivalent in a typed model —
  /// `readString` substitutes `''` (`lib/models/json_reader.dart:24-32`) — so the
  /// key is dropped here and the two cases that use it are asserted separately.
  List<Map<String, Object?>> expectedRows(String name) {
    final Object? expected = caseOf(name)['expected'];
    return (expected! as List<Object?>).map((Object? row) {
      final Map<String, Object?> raw = row! as Map<String, Object?>;
      return raw.entries
          .where((MapEntry<String, Object?> e) => !_isSentinel(e.value))
          .fold(
            <String, Object?>{},
            (Map<String, Object?> out, MapEntry<String, Object?> e) =>
                out..[e.key] = e.value,
          );
    }).toList();
  }

  // =========================================================================
  // getFilteredTransactions
  // =========================================================================

  group('getFilteredTransactions', () {
    test('search="" returns every row, in order', () {
      expect(
        TransactionService.getFilteredTransactions(filterRows())
            .map((Transaction t) => t.toJson())
            .toList(),
        equals(expectedRows('getFilteredTransactions(search="")')),
      );
    });

    test('search="salar" matches the lowered title', () {
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          searchQuery: 'salar',
        ).map((Transaction t) => t.toJson()).toList(),
        equals(expectedRows('getFilteredTransactions(search="salar")')),
      );
    });

    test('search="SALARY" matches the lowered title and category', () {
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          searchQuery: 'SALARY',
        ).map((Transaction t) => t.toJson()).toList(),
        equals(expectedRows('getFilteredTransactions(search="SALARY")')),
      );
    });

    test('search="185" matches the amount as a string', () {
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          searchQuery: '185',
        ).map((Transaction t) => t.toJson()).toList(),
        equals(expectedRows('getFilteredTransactions(search="185")')),
      );
    });

    test('search="1E" matches nothing — the amount test is case-sensitive', () {
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          searchQuery: '1E',
        ),
        isEmpty,
      );
      expect(
        caseOf('getFilteredTransactions(search="1E")')['expected'],
        isEmpty,
      );
    });

    test('search="zzz" matches nothing', () {
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          searchQuery: 'zzz',
        ),
        isEmpty,
      );
      expect(
        caseOf('getFilteredTransactions(search="zzz")')['expected'],
        isEmpty,
      );
    });

    test('search=" " matches any row with a space in title or category', () {
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          searchQuery: ' ',
        ).map((Transaction t) => t.toJson()).toList(),
        equals(expectedRows('getFilteredTransactions(search=" ")')),
      );
    });

    test(
      'the category filter is exact-case, as the web compares raw values',
      () {
        expect(
          TransactionService.getFilteredTransactions(
            filterRows(),
            categoryFilter: 'shopping',
          ),
          isEmpty,
        );
        expect(
          caseOf('getFilteredTransactions(category exact case)')['expected'],
          isEmpty,
        );
        expect(
          TransactionService.getFilteredTransactions(
            filterRows(),
            categoryFilter: 'Shopping',
          ).map((Transaction t) => t.toJson()).toList(),
          equals(
            expectedRows('getFilteredTransactions(category correct case)'),
          ),
        );
      },
    );

    test('the type filter selects on `type`', () {
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          typeFilter: 'expense',
        ).map((Transaction t) => t.toJson()).toList(),
        equals(expectedRows('getFilteredTransactions(type=expense)')),
      );
    });

    test('the account filter reaches a row from either end', () {
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          accountFilter: 'cc-1',
        ).map((Transaction t) => t.toJson()).toList(),
        equals(
          expectedRows('getFilteredTransactions(account=targetAccountId)'),
        ),
      );
      expect(
        TransactionService.getFilteredTransactions(
          filterRows(),
          accountFilter: 'ca-2',
        ).map((Transaction t) => t.toJson()).toList(),
        equals(
          expectedRows(
            'getFilteredTransactions(account=targetAccountId of transfer)',
          ),
        ),
      );
    });

    test('a row with no title or category does not throw on an empty query', () {
      // The web's `matchesSearch` is `searchQuery === '' || tx.title.toLowerCase()…`,
      // so the empty query short-circuits the `||` **before** `title` is touched:
      // these two fixture cases are named "-> throws" but record a row, not an
      // error. The port has to reproduce that, not a null check.
      expect(
        TransactionService.getFilteredTransactions(<Transaction>[
          txRow(title: ''),
        ]).single.id,
        'tx-1',
      );
      expect(
        TransactionService.getFilteredTransactions(<Transaction>[
          txRow(category: ''),
        ]).single.id,
        'tx-1',
      );
      final Map<String, Object?> titleCase = caseOf(
        'getFilteredTransactions(row missing title -> throws)',
      );
      final Map<String, Object?> categoryCase = caseOf(
        'getFilteredTransactions(row missing category -> throws)',
      );
      for (final Map<String, Object?> entry in <Map<String, Object?>>[
        titleCase,
        categoryCase,
      ]) {
        final Map<String, Object?> row =
            (entry['expected']! as List<Object?>).single!
                as Map<String, Object?>;
        expect(row['id'], 'tx-1');
      }
      // The web's row carries the missing field as `undefined`; the typed model
      // carries `''`. That substitution is the recorded deviation, not a pass.
      expect(
        (titleCase['expected']! as List<Object?>)[0]! as Map<String, Object?>,
        contains('title'),
      );
    });
  });

  // =========================================================================
  // sortTransactionsByDate
  // =========================================================================

  group('sortTransactionsByDate', () {
    /// `parity/fixtures/generate.ts:1380-1389`. `z2` carries `undefined` for all
    /// three stamp fields and for `date`; in the model an empty `date` is the same
    /// value to the comparator, because `''` is falsy in the web's `||` hunt too.
    List<Transaction> sortRows() => <Transaction>[
      txRow(id: 'a1', date: '2026-10-02', updatedAt: '2026-10-02T10:00:00Z'),
      txRow(id: 'a2', date: '2026-10-02', updatedAt: '2026-10-02T10:00:00Z'),
      txRow(
        id: 'tx-1-2',
        date: '2026-10-02',
        updatedAt: '2026-10-02T10:00:00Z',
      ),
      txRow(id: 'a9b', date: '2026-10-02', updatedAt: '2026-10-02T10:00:00Z'),
      txRow(id: 'ab9', date: '2026-10-02', updatedAt: '2026-10-02T10:00:00Z'),
      txRow(id: 'z1', date: '2026-10-02', updatedAt: 'garbage'),
      txRow(id: 'z2', date: ''),
      txRow(id: 'b1', date: '2026-10-05'),
    ];

    List<String> idsOf(String name) =>
        ((caseOf(name)['expected'])! as List<Object?>)
            .map((Object? id) => id! as String)
            .toList();

    test('desc walks all four tie-break levels', () {
      expect(
        TransactionService.sortTransactionsByDate(sortRows())
            .map((Transaction t) => t.id)
            .toList(),
        equals(idsOf('sortTransactionsByDate(desc) 4-level tiebreak')),
      );
    });

    test('asc negates each level rather than reversing the output', () {
      expect(
        TransactionService.sortTransactionsByDate(
          sortRows(),
          order: 'asc',
        ).map((Transaction t) => t.id).toList(),
        equals(idsOf('sortTransactionsByDate(asc) 4-level tiebreak')),
      );
    });

    test('the id tie-break is localeCompare, not code-unit order', () {
      // `a9b` vs `ab9` is the only pair where the two disagree in this dataset:
      // ICU weighs the digit below the letter, and `'a'.localeCompare('B')` folds
      // case, which `compareTo` would not.
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
    });

    test('an empty list sorts to an empty list', () {
      expect(
        TransactionService.sortTransactionsByDate(<Transaction>[]),
        isEmpty,
      );
      expect(caseOf('sortTransactionsByDate(empty)')['expected'], isEmpty);
    });

    test('the stamp hunt prefers updated_at over date', () {
      expect(
        TransactionService.sortTransactionsByDate(<Transaction>[
          txRow(
            id: 'p1',
            date: '2026-01-01',
            updatedAt: '2026-12-01T00:00:00Z',
          ),
          txRow(id: 'p2', date: '2026-06-01'),
        ]).map((Transaction t) => t.id).toList(),
        equals(idsOf('sortTransactionsByDate(prefers updated_at over date)')),
      );
    });

    test('the camelCase spelling is honoured', () {
      expect(
        TransactionService.sortTransactionsByDate(<Transaction>[
          txRow(
            id: 'c1',
            date: '2026-01-01',
            updatedAt: '2026-12-01T00:00:00Z',
          ),
          txRow(id: 'c2', date: '2026-06-01'),
        ]).map((Transaction t) => t.id).toList(),
        equals(idsOf('sortTransactionsByDate(camelCase keys honoured)')),
      );
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
      final List<Transaction> rows = sortRows();
      final List<String> before = rows.map((Transaction t) => t.id).toList();
      TransactionService.sortTransactionsByDate(rows);
      expect(rows.map((Transaction t) => t.id).toList(), before);
    });
  });

  // =========================================================================
  // getMonthlyTotals
  // =========================================================================

  group('getMonthlyTotals', () {
    /// The web reads `new Date()` for the bucket, so the fixture pins it to
    /// `2026-10-04T04:30:00.000Z` at `Asia/Colombo`. `.getMonth()` is **local**, so
    /// the Dart port is handed the local reading of the same instant.
    DateTime pinnedNow() =>
        DateTime.parse('2026-10-04T04:30:00.000Z').toLocal();

    /// The device's offset at the pinned instant, measured without going through
    /// `DateTime.fromMillisecondsSinceEpoch` — that conversion is the call under
    /// test, so the expectation must not be built with it.
    Duration offsetAtPinned() {
      final DateTime local = pinnedNow();
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

    Map<String, Object?> totalsOf(
      String type, {
      num amount = 0.1,
      String? secondType,
      num secondAmount = 0.2,
    }) {
      final List<Transaction> rows = <Transaction>[
        txRow(type: type, amount: amount, date: '2026-10-02'),
        if (secondType != null)
          txRow(
            id: 'm2',
            type: secondType,
            amount: secondAmount,
            date: '2026-10-03',
          ),
      ];
      return TransactionService.getMonthlyTotals(
        rows,
        now: pinnedNow(),
      ).toJson();
    }

    for (final String type in <String>['income', 'deposit']) {
      test('$type counts as income and the two rows sum to float residue', () {
        expect(
          totalsOf(type, secondType: type),
          equals(caseOf('getMonthlyTotals($type)')['expected']),
        );
      });
    }

    for (final String type in <String>[
      'expense',
      'credit_card_charge',
      'withdrawal',
    ]) {
      test('$type counts as expense', () {
        expect(
          totalsOf(type, secondType: type),
          equals(caseOf('getMonthlyTotals($type)')['expected']),
        );
      });
    }

    for (final String type in <String>[
      'debt_payment',
      'transfer',
      'financing',
    ]) {
      test('$type is in neither sum', () {
        expect(
          totalsOf(type, secondType: type),
          equals(caseOf(excludedCaseNames[type]!)['expected']),
        );
      });
    }

    test('an empty ledger totals zero', () {
      expect(
        TransactionService.getMonthlyTotals(
          <Transaction>[],
          now: pinnedNow(),
        ).toJson(),
        equals(caseOf('getMonthlyTotals(empty)')['expected']),
      );
    });

    test('0.1 + 0.2 + 0.3 keeps its binary residue (B-04)', () {
      final Map<String, Object?> actual = TransactionService.getMonthlyTotals(
        <Transaction>[
          txRow(type: 'income', amount: 0.1, date: '2026-10-02'),
          txRow(id: 'f2', type: 'income', amount: 0.2, date: '2026-10-03'),
          txRow(id: 'f3', type: 'income', amount: 0.3, date: '2026-10-04'),
        ],
        now: pinnedNow(),
      ).toJson();
      expect(
        actual,
        equals(
          caseOf('getMonthlyTotals(float residue survives (B-04))')['expected'],
        ),
      );
      // The sum is not the cent sum `money.ts` would produce — `money.json`
      // records `0.3` for the same rows. B-04 stays bug-compatible.
      expect(actual['income'], isNot(0.3));
    });

    test('the service total differs from money.ts on the same rows', () {
      final Map<String, Object?> expected =
          caseOf(
                'getMonthlyTotals vs money.ts sumMoney of the same rows',
              )['expected']
              as Map<String, Object?>;
      final Map<String, Object?> actual = totalsOf(
        'income',
        secondType: 'income',
      );
      expect(actual['income'], expected['service']);
      // `viaMoney` is the `money.ts` half of the same measurement; that unit is
      // not ported yet, so only the service side is compared here.
      expect(expected['viaMoney'], isNot(expected['service']));
    });

    test('a string amount concatenates on the web and coerces here', () {
      // `parity/fixtures/generate.ts:1453` pushes `amount: '5'` past the type. JS
      // does `'0' + '5'` → `'05'`, then `'05' - 0` → `5` for the net. The model
      // reads a `num` (`readNum`, `lib/models/json_reader.dart:45`), so income is
      // the number. The net agrees; the income does not, and that is the recorded
      // "web throws / phone defaults" class in `parity/DATA_SPEC.md`.
      final Map<String, Object?> expected =
          caseOf('getMonthlyTotals(string amount concatenates)')['expected']
              as Map<String, Object?>;
      expect(expected['income'], '05');
      expect(expected['netCashFlow'], 5);
      final Map<String, Object?> actual = TransactionService.getMonthlyTotals(
        <Transaction>[txRow(type: 'income', amount: 5, date: '2026-10-02')],
        now: pinnedNow(),
      ).toJson();
      expect(actual['netCashFlow'], expected['netCashFlow']);
      expect(actual['income'], 5);
    });

    group('the month bucket is read on the device', () {
      for (final String date in <String>[
        '2026-10-01',
        '2026-09-30',
        '2026-10-31',
        '2026-11-01',
        '2026-01-01',
        '2025-10-04',
        'garbage',
        '',
      ]) {
        test('date ${date.isEmpty ? 'empty' : date}', () {
          final Map<String, Object?> expected =
              caseOf(
                    'getMonthlyTotals(date ${date.isEmpty ? 'empty' : date})',
                  )['expected']
                  as Map<String, Object?>;
          final Map<String, Object?> actual =
              TransactionService.getMonthlyTotals(<Transaction>[
                txRow(type: 'income', amount: 100, date: date),
              ], now: pinnedNow()).toJson();

          final num rule = fallsInPinnedMonth(date) ? 100 : 0;
          expect(
            actual,
            equals(<String, Object?>{
              'income': rule,
              'expense': 0,
              'netCashFlow': rule,
            }),
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
        });
      }

      test('an unparseable date matches nothing', () {
        // `new Date('garbage')` is `Invalid Date`; `NaN === currentMonth` is false.
        expect(
          TransactionService.getMonthlyTotals(<Transaction>[
            txRow(type: 'income', amount: 100, date: 'garbage'),
          ], now: pinnedNow()).income,
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
      final List<Transaction> rows = filterRows();
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

/// A fixture value that JSON could not carry: `undefined`, `NaN`, `-0`.
bool _isSentinel(Object? value) =>
    value is Map<String, Object?> && value.containsKey('__sentinel__');
