import 'package:em_budget/data/map_database_result_to_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// `mapDatabaseResultToState` (`src/supabase.ts:858-909`) — the read contract that
/// turns a relational row into something the state can hold.
void main() {
  group('casing', () {
    test('every key is renamed to camel, and the snake form is not kept', () {
      final Map<String, Object?> out = mapDatabaseResultToState(
        const <String, Object?>{'user_email': 'a@b.c', 'card_name': 'NAB'},
      );
      expect(out['userEmail'], 'a@b.c');
      expect(out['cardName'], 'NAB');
      expect(out.containsKey('user_email'), isFalse);
    });

    test('a key that is already camel is passed through unchanged', () {
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'cardName': 'NAB',
        })['cardName'],
        'NAB',
      );
    });
  });

  group('the eleven numeric fields', () {
    test('a PostgREST numeric string becomes a number', () {
      for (final String key in const <String>[
        'totalAmount',
        'remainingAmount',
        'amount',
        'balance',
        'currentBalance',
        'limit',
        'charge',
        'transferCharge',
        'lockedAmount',
        'apr',
        'minPayment',
      ]) {
        expect(
          mapDatabaseResultToState(<String, Object?>{key: '1200.50'})[key],
          1200.5,
          reason: key,
        );
      }
    });

    test('the snake spelling is coerced because the set is tested on the camel form', () {
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'total_amount': '185000',
        })['totalAmount'],
        185000,
      );
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'current_balance': '500',
        })['currentBalance'],
        500,
      );
    });

    test('null and unparseable both become 0, so a missing amount is not distinguishable', () {
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'amount': null,
        })['amount'],
        0,
      );
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'amount': 'abc',
        })['amount'],
        0,
      );
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'amount': '',
        })['amount'],
        0,
        reason: 'Number("") is 0',
      );
    });

    test('an integral decimal serialises without a trailing .0', () {
      // `JSON.stringify` writes `1200`; Dart writes `1200.0` for a double, and the
      // snapshot is compared as text.
      final Object? v = mapDatabaseResultToState(const <String, Object?>{
        'amount': '1200.000',
      })['amount'];
      expect(v, isA<int>());
      expect(v, 1200);
    });

    test('a field outside the set is left exactly as it arrived', () {
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'statement_close_date': '15',
        })['statementCloseDate'],
        '15',
      );
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'status': true,
        })['status'],
        true,
      );
    });
  });

  group('alias guards', () {
    test('isCancelled fills isCanceled only when isCanceled is absent', () {
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'is_cancelled': true,
        })['isCanceled'],
        true,
      );
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'is_cancelled': true,
          'is_canceled': false,
        })['isCanceled'],
        false,
        reason: 'the correct spelling wins when both are present',
      );
    });

    test('isFrozen is defaulted to false rather than left absent', () {
      final Map<String, Object?> out = mapDatabaseResultToState(
        const <String, Object?>{'id': 'x'},
      );
      expect(out['isFrozen'], false);
      expect(out.containsKey('isFrozen'), isTrue);
    });

    test('isFrozen is coerced by truthiness, not by type', () {
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'is_frozen': 1,
        })['isFrozen'],
        true,
      );
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'is_frozen': '',
        })['isFrozen'],
        false,
      );
      expect(
        mapDatabaseResultToState(const <String, Object?>{
          'is_frozen': 'no',
        })['isFrozen'],
        true,
      );
    });
  });

  group('the dual timestamp stamp', () {
    test('both spellings are written from the first truthy candidate', () {
      final Map<String, Object?> out = mapDatabaseResultToState(
        const <String, Object?>{'created_at': '2026-01-01T00:00:00.000Z'},
      );
      expect(out['updated_at'], '2026-01-01T00:00:00.000Z');
      expect(out['updatedAt'], '2026-01-01T00:00:00.000Z');
    });

    test('an empty stamp is falsy and does not stop the hunt', () {
      final Map<String, Object?> out = mapDatabaseResultToState(
        const <String, Object?>{
          'updated_at': '',
          'updatedAt': '2026-02-02T00:00:00.000Z',
        },
      );
      expect(out['updated_at'], '2026-02-02T00:00:00.000Z');
    });

    test(
      'no stamp at all writes neither key, so the write path may stamp fresh',
      () {
        final Map<String, Object?> out = mapDatabaseResultToState(
          const <String, Object?>{'id': 'x'},
        );
        expect(out.containsKey('updated_at'), isFalse);
        expect(out.containsKey('updatedAt'), isFalse);
      },
    );
  });

  group('the pair round-trips', () {
    test('a pulled row pushed again keeps the same updated_at', () {
      // The web\'s stated reason for preserving an existing stamp
      // (`src/supabase.ts:362`): a re-push must not move `updated_at` forward.
      final Map<String, Object?> row = mapDatabaseResultToState(
        const <String, Object?>{
          'id': 'a',
          'title': 'T',
          'amount': '1200',
          'updated_at': '2026-05-05T09:00:00.000Z',
          'user_email': 'qa@example.com',
        },
      );
      expect(row['amount'], 1200);
      expect(row['updatedAt'], '2026-05-05T09:00:00.000Z');
    });
  });
}
