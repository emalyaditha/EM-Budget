import 'package:em_budget/data/map_object_to_columns.dart';
import 'package:flutter_test/flutter_test.dart';

const String pinned = '2026-10-04T04:30:00.000Z';

String? clock() => pinned;

/// `mapObjectToColumns` (`src/supabase.ts:346-431`) — the four passes, in order,
/// with the JS undefined/null convention the algorithm decides on.
void main() {
  const List<String> cols = <String>[
    'id',
    'user_email',
    'title',
    'amount',
    'updated_at',
  ];

  Map<String, Object?> map({
    Map<String, Object?> item = const <String, Object?>{},
    List<String> columns = cols,
    Map<String, Object?> rules = const <String, Object?>{},
    String? Function()? now = clock,
  }) {
    return mapObjectToColumns(
      item: item,
      columns: columns,
      email: 'qa@example.com',
      mappingRules: rules,
      now: now,
    );
  }

  group('pass 1 — identity', () {
    test('user_email is bound when the table has the column', () {
      expect(map()['user_email'], 'qa@example.com');
    });

    test('the camel spelling is used only when the snake one is absent', () {
      expect(
        map(columns: const <String>['userEmail', 'id'])['userEmail'],
        'qa@example.com',
      );
    });

    test('a table with neither column gets no identity key', () {
      // `credit_card_installment_payments` is that table (`src/supabase.ts:331`);
      // ownership is implied through `installment_id`.
      expect(
        map(columns: const <String>['id', 'installment_id']),
        isNot(contains('user_email')),
      );
    });
  });

  group('pass 2 — the timestamp hunt', () {
    test(
      'an existing stamp is preserved, because a re-push must not move it',
      () {
        final Map<String, Object?> out = map(
          item: const <String, Object?>{
            'updated_at': '2026-01-01T00:00:00.000Z',
          },
        );
        expect(out['updated_at'], '2026-01-01T00:00:00.000Z');
      },
    );

    test(
      'updatedAt, created_at and createdAt all satisfy the hunt, in that order',
      () {
        expect(
          map(
            item: const <String, Object?>{
              'updatedAt': '2026-01-02T00:00:00.000Z',
            },
          )['updated_at'],
          '2026-01-02T00:00:00.000Z',
        );
        expect(
          map(
            item: const <String, Object?>{
              'created_at': '2026-01-03T00:00:00.000Z',
            },
          )['updated_at'],
          '2026-01-03T00:00:00.000Z',
        );
        expect(
          map(
            item: const <String, Object?>{
              'created_at': '2026-01-03T00:00:00.000Z',
              'createdAt': '2026-01-04T00:00:00.000Z',
            },
          )['updated_at'],
          '2026-01-03T00:00:00.000Z',
          reason: 'the first truthy member of the `||` chain wins',
        );
      },
    );

    test('an empty stamp is falsy and falls back to the clock', () {
      expect(
        map(item: const <String, Object?>{'updated_at': ''})['updated_at'],
        pinned,
      );
    });

    test(
      'a numeric epoch becomes an ISO string with three fractional digits',
      () {
        expect(
          map(
            item: const <String, Object?>{'updated_at': 1790899200000},
          )['updated_at'],
          '2026-10-02T00:00:00.000Z',
        );
      },
    );

    test('epoch 0 is falsy, so it falls through to the clock rather than to 1970', () {
      // `obj.updated_at || obj.updatedAt || …` (`src/supabase.ts:365`) — the `||`
      // is a truthiness test, so `0` does not survive it. Dart would have said
      // "a number is a number".
      expect(
        map(item: const <String, Object?>{'updated_at': 0})['updated_at'],
        pinned,
      );
    });

    test('with no stamp at all, the wall clock is used', () {
      expect(map()['updated_at'], pinned);
    });

    test(
      '`date` is tried, parsed to UTC, and its raw value is the last resort',
      () {
        expect(
          map(
            item: const <String, Object?>{'date': '2026-10-02'},
          )['updated_at'],
          '2026-10-02T00:00:00.000Z',
        );
        expect(
          map(
            item: const <String, Object?>{'date': 'not-a-date'},
          )['updated_at'],
          'not-a-date',
        );
        expect(
          map(item: const <String, Object?>{'date': ''})['updated_at'],
          pinned,
        );
      },
    );

    test('`dateGiven` is the loan\'s spelling of the same idea', () {
      expect(
        map(
          item: const <String, Object?>{'dateGiven': '2026-09-01'},
        )['updated_at'],
        '2026-09-01T00:00:00.000Z',
      );
    });

    test('a real stamp outranks `date`', () {
      expect(
        map(
          item: const <String, Object?>{
            'updated_at': '2026-01-01T00:00:00.000Z',
            'date': '2026-09-01',
          },
        )['updated_at'],
        '2026-01-01T00:00:00.000Z',
      );
    });

    test('the camel column spelling is used when the table has only that', () {
      expect(map(columns: const <String>['updatedAt'])['updatedAt'], pinned);
    });
  });

  group('pass 3 — explicit rules, gated by the allow-list', () {
    test(
      'a rule naming a column the table does not have is dropped (B-20)',
      () {
        final Map<String, Object?> out = map(
          rules: const <String, Object?>{'instance_type': 'SriLankan'},
        );
        expect(out.containsKey('instance_type'), isFalse);
      },
    );

    test(
      'a rule value of null occupies the column and blocks the casing fill',
      () {
        // `:411` tests `!== undefined`, which null passes. This is the whole reason
        // the port keeps absent and null apart.
        final Map<String, Object?> out = map(
          item: const <String, Object?>{'title': 'from state'},
          rules: const <String, Object?>{'title': null},
        );
        expect(out['title'], isNull);
      },
    );

    test('a rule the caller did not include lets pass 4 fill the column', () {
      final Map<String, Object?> out = map(
        item: const <String, Object?>{'title': 'from state'},
        rules: const <String, Object?>{},
      );
      expect(out['title'], 'from state');
    });

    test('rules overwrite the identity and timestamp keys when the column allows it', () {
      // The web lets a rule write `updated_at` because pass 3 runs after pass 2;
      // nothing in the twelve builders does, but the order is the contract.
      expect(
        map(
          rules: const <String, Object?>{
            'updated_at': '2020-01-01T00:00:00.000Z',
          },
        )['updated_at'],
        '2020-01-01T00:00:00.000Z',
      );
    });
  });

  group('pass 4 — casing auto-fill', () {
    test('exact, then camel, then snake', () {
      expect(map(item: const <String, Object?>{'amount': 5})['amount'], 5);
      expect(
        map(
          columns: const <String>['id', 'current_balance'],
          item: const <String, Object?>{'currentBalance': 7},
        )['current_balance'],
        7,
      );
      expect(
        map(
          columns: const <String>['id', 'current_balance'],
          item: const <String, Object?>{'current_balance': 7},
        )['current_balance'],
        7,
      );
    });

    test('an exact-name property of null still blocks the camel fallback', () {
      expect(
        map(
          columns: const <String>['id', 'amount'],
          item: const <String, Object?>{'amount': null, 'amt': 1},
        )['amount'],
        isNull,
      );
    });

    test(
      'a column with no matching property is left out of the record entirely',
      () {
        final Map<String, Object?> out = map(
          item: const <String, Object?>{'id': 'x'},
        );
        expect(out.containsKey('title'), isFalse);
        expect(out.containsKey('amount'), isFalse);
      },
    );

    test('the four reserved columns are never filled from the item', () {
      final Map<String, Object?> out = map(
        item: const <String, Object?>{
          'user_email': 'spoof@example.com',
          'updated_at': '2020-01-01T00:00:00.000Z',
        },
      );
      expect(out['user_email'], 'qa@example.com');
      expect(
        out['updated_at'],
        '2020-01-01T00:00:00.000Z',
        reason: 'that one comes from the hunt, not the fill',
      );
    });
  });

  group('record shape', () {
    test('keys appear in the web\'s insertion order: identity, stamp, rules, fills', () {
      final Map<String, Object?> out = map(
        item: const <String, Object?>{'title': 't', 'amount': 1},
        rules: const <String, Object?>{'id': 'r1'},
      );
      expect(out.keys.toList(), <String>[
        'user_email',
        'updated_at',
        'id',
        'title',
        'amount',
      ]);
    });

    test('an allow-list of nothing produces a record of nothing', () {
      expect(
        map(
          columns: const <String>[],
          item: const <String, Object?>{'id': 'x'},
        ),
        isEmpty,
      );
    });
  });
}
