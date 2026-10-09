import 'dart:convert';
import 'dart:io';

import 'package:em_budget/domain/validators.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// `src/validators/index.ts` replayed against `parity/fixtures/validators.json`.
///
/// The contract is the **error string**, not a pass/fail bit. `validateData` joins every
/// Zod issue into one `"path: message; path: message"` line, so a port that gets the
/// ordering, the wording or the `Root` fallback wrong still returns something plausible —
/// and nothing downstream would notice. That is why this suite compares whole maps
/// (`{ok, parsed}` / `{ok, error}`) rather than picking fields out of them.
///
/// Two of the measured behaviours are findings, not accidents, and are asserted as
/// properties below so a "cleanup" cannot quietly undo them: the client's PAN pattern
/// **accepts** a raw 16-digit number (B-13, the DB CHECK is the only thing that refuses to
/// store it) and **rejects** the `4520 **** **** 3776` shape the QA harness seeds (B-14,
/// so stored rows exist that re-validation would refuse).
/// Which schema a case ran, from the name the generator gave it. Longest prefix wins,
/// because `LedgerRestorePayload union:` must not be read as a bare-state case.
const Map<String, String> _prefixes = <String, String>{
  'LedgerRestorePayload union:': 'LedgerRestorePayloadSchema',
  'LedgerExportV1': 'LedgerExportV1Schema',
  // `BareRestore` also opens a union case name, so this key must stay **after** the two
  // above: `schemaOf` returns the first prefix the name starts with.
  'BareRestore': 'BareRestoreStateSchema',
  'BankCard': 'BankCardSchema',
  'Transaction': 'TransactionSchema',
  'CashAccount': 'CashAccountSchema',
  'Debt': 'DebtSchema',
  'Subscription': 'SubscriptionSchema',
};

/// The schema a case name belongs to, with the generator's `validateData(…)` wrapper
/// removed. First match wins, which is why the table above is in prefix-specificity order.
String _schemaNameOf(String caseName) {
  final String body = caseName.startsWith('validateData(')
      ? caseName.substring('validateData('.length)
      : caseName;
  for (final MapEntry<String, String> entry in _prefixes.entries) {
    if (body.startsWith(entry.key)) return entry.value;
  }
  throw StateError('No schema is identifiable in the case name $caseName');
}

/// The names the web exports, so the coverage test below is about the port, not about a
/// hand-written count of the prefix table.
const List<String> _exportedSchemas = <String>[
  'CashAccountSchema',
  'BankCardSchema',
  'TransactionSchema',
  'DebtSchema',
  'SubscriptionSchema',
  'BareRestoreStateSchema',
  'LedgerExportV1Schema',
  'LedgerRestorePayloadSchema',
];

void main() {
  final List<String> fixtureNames = <String>[];
  final Map<String, Object?> expectedByName = <String, Object?>{};
  final Map<String, List<Object?>> inputByName = <String, List<Object?>>{};
  late final Map<String, Object?> prov;

  Schema schemaOf(String caseName) => schemaNamed(_schemaNameOf(caseName));

  late final Map<String, Object?> jsonByName;

  void loadFixture() {
    final File file = File(
      '${repoRoot()}${Platform.pathSeparator}parity'
      '${Platform.pathSeparator}fixtures${Platform.pathSeparator}validators.json',
    );
    if (!file.existsSync()) {
      throw StateError('Missing fixture file: ${file.path}');
    }
    final Map<String, Object?> root =
        jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    prov = root['_provenance']! as Map<String, Object?>;
    if (prov['unitFile'] != 'src/validators/index.ts') {
      throw StateError('validators.json is not from src/validators/index.ts');
    }
    if (prov['generatedFrom'] != 'pre-flutter') {
      throw StateError(
        'validators.json claims generatedFrom ${prov['generatedFrom']}; '
        'fixtures are measured from the pre-flutter tag only',
      );
    }
    for (final Object? raw in root['cases']! as List<Object?>) {
      final Map<String, Object?> entry = raw! as Map<String, Object?>;
      final String name = entry['name']! as String;
      if (expectedByName.containsKey(name)) {
        throw StateError('Duplicate fixture case: $name');
      }
      // Fail closed: an unrecognised case name must not be skipped silently, or the
      // suite would pass while replaying less than the file contains.
      schemaOf(name);
      expectedByName[name] = entry['expected'];
      inputByName[name] = entry['input']! as List<Object?>;
      fixtureNames.add(name);
    }
    if (fixtureNames.length < 49) {
      throw StateError(
        'validators.json carries only ${fixtureNames.length} cases; '
        'LOGIC_SPEC.md §11 documents 49',
      );
    }
    jsonByName = expectedByName;
  }

  loadFixture();

  /// One replayed case: parse the fixture's input and compare the whole result map.
  void replay(String name) {
    final Map<String, Object?> result = validateData(
      schemaOf(name),
      _deref(inputByName[name]!.first),
    ).asFixtureJson();
    expect(result, equals(jsonByName[name]), reason: name);
  }

  group('validators against validators.json', () {
    for (final String name in fixtureNames) {
      test(name, () => replay(name));
    }
  });

  group('the same rules, stated as properties', () {
    test('every schema the web exports has at least one golden', () {
      // Asserted against the exported-name list, not `_prefixes.length`: a name added to
      // the table without a case would otherwise shrink both sides of that comparison
      // equally and still pass.
      final Set<String> exercised = fixtureNames.map(_schemaNameOf).toSet();
      expect(exercised, unorderedEquals(_exportedSchemas));
    });

    test(
      'the parsed object comes out in schema key order, not input order',
      () {
        // `Transaction valid` is fed `id, title, category, type, …` and the golden is
        // `id, type, title, amount, …`. Zod walks the shape, so the order is the schema's.
        // The map compares equal either way, which is exactly why this is asserted
        // separately: `canonicalStateJson` hashes a key sequence.
        final Object? parsed = validateData(
          schemaNamed('TransactionSchema'),
          <String, Object?>{
            'id': 't1',
            'title': 'Groceries',
            'category': 'Shopping',
            'type': 'expense',
            'amount': 1200,
            'date': '2026-10-02',
            'accountId': 'ca-1',
          },
        ).data;
        expect((parsed! as Map<String, Object?>).keys.toList(), <String>[
          'id',
          'type',
          'title',
          'amount',
          'date',
          'category',
          'accountId',
        ]);
      },
    );

    test('an absent optional key is missing from the output, not null', () {
      final Map<String, Object?> parsed =
          validateData(schemaNamed('CashAccountSchema'), <String, Object?>{
                'id': 'a',
                'name': 'Wallet',
                'balance': 100,
              }).data!
              as Map<String, Object?>;
      expect(parsed.containsKey('balance'), isTrue);
      expect(parsed.keys.length, 3);
    });

    test('unknown keys are stripped', () {
      final Map<String, Object?> parsed =
          validateData(schemaNamed('DebtSchema'), <String, Object?>{
                'id': 'd',
                'debtSource': 'Bank',
                'totalAmount': 1000,
                'remainingAmount': 500,
                'dueDate': '2026-10-07',
                'interestRate': 8,
              }).data!
              as Map<String, Object?>;
      expect(parsed.containsKey('interestRate'), isFalse);
    });

    test('a default is produced per parse, not shared', () {
      // `payments: z.array(...).default([])` must not hand back one list that two parsed
      // debts mutate. A function default is what makes that true, so this adds to one
      // result and re-parses.
      Map<String, Object?> parseOnce() =>
          validateData(schemaNamed('DebtSchema'), <String, Object?>{
                'id': 'd',
                'debtSource': 'Bank',
                'totalAmount': 1000,
                'remainingAmount': 500,
                'dueDate': '2026-10-07',
              }).data!
              as Map<String, Object?>;
      final List<Object?> first = parseOnce()['payments']! as List<Object?>;
      first.add('x');
      expect(parseOnce()['payments'], isEmpty);
    });

    test('B-13: the client accepts a raw 16-digit PAN', () {
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard(cardNumber: '4520123456783776'),
        ).success,
        isTrue,
        reason: 'only 20260831000000_pan_masking.sql refuses to store it',
      );
    });

    test('B-14: the QA harness mask is the one the schema rejects', () {
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard(cardNumber: '4520 **** **** 3776'),
        ).error,
        'cardNumber: Card number must be 16 digits or masked standard (**** 1234)',
      );
    });

    test('the date regex is anchored at the start only', () {
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard(dueDate: '2026-10-07T00:00:00Z'),
        ).success,
        isTrue,
        reason: 'a full timestamp passes, which a bare-day check elsewhere would not',
      );
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard(dueDate: '04-10-2026'),
        ).error,
        'dueDate: Invalid due date (must be YYYY-MM-DD)',
      );
    });

    test('a missing required enum names its options, a missing string says undefined', () {
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard()..remove('cardType'),
        ).error,
        r'cardType: Invalid option: expected one of "Debit"|"Credit"',
      );
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard()..remove('id'),
        ).error,
        'id: Invalid input: expected string, received undefined',
      );
    });

    test('the messageless checks fall back to Zod 4\'s own wording', () {
      expect(
        validateData(
          schemaNamed('DebtSchema'),
          _debt(remainingAmount: -1),
        ).error,
        'remainingAmount: Too small: expected number to be >=0',
      );
      expect(
        validateData(schemaNamed('DebtSchema'), _debt(dueDate: 'nope')).error,
        r'dueDate: Invalid string: must match pattern /^\d{4}-\d{2}-\d{2}/',
      );
      expect(
        validateData(schemaNamed('DebtSchema'), _debt(notes: 'x' * 501)).error,
        'notes: Too big: expected string to have <=500 characters',
      );
    });

    test('issues are joined in schema key order with a semicolon', () {
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard(id: '', cardType: 'Prepaid'),
        ).error,
        r'id: ID is required; cardType: Invalid option: expected one of "Debit"|"Credit"',
      );
    });

    test('an array element reports a dotted path with its index', () {
      final ValidationResult result = validateData(
        schemaNamed('DebtSchema'),
        _debt(
          payments: <Object?>[
            <String, Object?>{
              'id': 'p',
              'debtId': '',
              'amount': 1,
              'date': 'bad',
              'paidFromId': 'a',
              'paidFromType': 'cash',
            },
          ],
        ),
      );
      expect(result.error, startsWith('payments.0.debtId: '));
      expect(result.error, contains('payments.0.date: '));
      expect(
        result.error,
        isNot(contains('payments.1')),
        reason: 'only the element that failed is reported',
      );
    });

    test('a whole payload that is not an object fails at the Root', () {
      expect(
        validateData(schemaNamed('DebtSchema'), null).error,
        'Root: Invalid input: expected object, received null',
      );
    });

    test('a union says nothing about which branch failed', () {
      expect(
        validateData(
          schemaNamed('LedgerRestorePayloadSchema'),
          <String, Object?>{'nope': true},
        ).error,
        'Root: Invalid input',
      );
    });

    test('null and undefined are different inputs to a validator', () {
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard(cardNumber: null),
        ).error,
        'cardNumber: Invalid input: expected string, received null',
      );
      expect(
        validateData(
          schemaNamed('BankCardSchema'),
          _bankCard()..remove('id'),
        ).error,
        'id: Invalid input: expected string, received undefined',
      );
    });

    test(
      'Infinity is not a number to Zod, and `.finite()` never gets to say so',
      () {
        final String? error = validateData(
          schemaNamed('BankCardSchema'),
          _bankCard(currentBalance: double.infinity),
        ).error;
        expect(
          error,
          'currentBalance: Invalid input: expected number, received number',
        );
        expect(
          validateData(
            schemaNamed('BankCardSchema'),
            _bankCard(currentBalance: double.nan),
          ).error,
          'currentBalance: Invalid input: expected number, received NaN',
        );
      },
    );

    test(
      'a transaction category is a free string, a subscription category is not',
      () {
        // The hand-synced category list (`INVENTORY.md` §5.11) shows up here as an
        // asymmetry: `Kryptokurrency` passes one schema and names twelve options in the
        // other's error.
        expect(
          validateData(schemaNamed('TransactionSchema'), <String, Object?>{
            'id': 't1',
            'type': 'expense',
            'title': 'Groceries',
            'amount': 1200,
            'date': '2026-10-02',
            'category': 'Kryptokurrency',
          }).success,
          isTrue,
        );
        expect(
          validateData(schemaNamed('SubscriptionSchema'), <String, Object?>{
            'id': 's',
            'name': 'Netflix',
            'amount': 1500,
            'billingCycle': 'Monthly',
            'dueDate': '2026-10-04',
            'category': 'Kryptokurrency',
          }).error,
          contains('expected one of "Food"'),
        );
      },
    );

    test('a restore collection keeps its elements exactly as they came', () {
      final Map<String, Object?> parsed =
          validateData(schemaNamed('BareRestoreStateSchema'), <String, Object?>{
                'cashAccounts': <Object?>[
                  1,
                  'a',
                  null,
                  <String, Object?>{'z': 1},
                  <Object?>[2],
                ],
                'cards': <Object?>[],
                'transactions': <Object?>[],
              }).data!
              as Map<String, Object?>;
      expect(parsed['cashAccounts'], <Object?>[
        1,
        'a',
        null,
        <String, Object?>{'z': 1},
        <Object?>[2],
      ]);
    });

    test('the three collections that can wipe state are required, the other twelve are not', () {
      expect(
        validateData(schemaNamed('BareRestoreStateSchema'), <String, Object?>{
          'cards': <Object?>[],
          'transactions': <Object?>[],
        }).error,
        'cashAccounts: Invalid input: expected array, received undefined',
      );
      expect(
        validateData(schemaNamed('BareRestoreStateSchema'), <String, Object?>{
          'cashAccounts': <Object?>[],
          'cards': <Object?>[],
          'transactions': <Object?>[],
        }).success,
        isTrue,
      );
    });
  });
}

/// A schema-shaped input for the property tests above, without repeating a golden.
///
/// `_omit` rather than `null` is the "key absent" spelling, because here the two produce
/// different messages.
Map<String, Object?> _bankCard({
  Object? id = 'cd-1',
  Object? cardNumber = '•••• •••• •••• 3776',
  Object? currentBalance = 74250,
  Object? cardType = 'Debit',
  Object? dueDate = _omit,
}) {
  return <String, Object?>{
    'id': id,
    'cardName': 'Everyday Debit',
    'bankName': 'CB',
    'cardType': cardType,
    'currentBalance': currentBalance,
    if (cardNumber != _omit) 'cardNumber': cardNumber,
    'isCanceled': false,
    if (dueDate != _omit) 'dueDate': dueDate,
  };
}

const Object _omit = _Omit();

class _Omit {
  const _Omit();
}

Map<String, Object?> _debt({
  Object? remainingAmount = 500,
  Object? dueDate = '2026-10-07',
  Object? notes = _omit,
  Object? payments = _omit,
}) {
  return <String, Object?>{
    'id': 'd',
    'debtSource': 'Bank',
    'totalAmount': 1000,
    'remainingAmount': remainingAmount,
    'dueDate': dueDate,
    if (notes != _omit) 'notes': notes,
    if (payments != _omit) 'payments': payments,
  };
}

/// Turns a fixture value into the value the web actually handed Zod.
///
/// `undefined` becomes [jsUndefined] rather than `null`, because for this unit the two are
/// different goldens; every other part of the port collapses them
/// (`DATA_SPEC.md` §1).
Object? _deref(Object? raw) {
  if (raw is Map<String, Object?> && raw.containsKey('__sentinel__')) {
    final String sentinel = raw['__sentinel__']! as String;
    switch (sentinel) {
      case 'undefined':
        return jsUndefined;
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
        e.key: _deref(e.value),
    };
  }
  if (raw is List<Object?>) return raw.map(_deref).toList();
  return raw;
}
