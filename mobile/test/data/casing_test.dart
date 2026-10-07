import 'package:em_budget/data/casing.dart';
import 'package:em_budget/data/schema_columns.dart';
import 'package:flutter_test/flutter_test.dart';

/// The two regular expressions the web applies to column names, ported
/// character-for-character. These are the inputs a generic snake/camel helper gets
/// wrong, so they are pinned rather than assumed.
void main() {
  group('toCamelCase — /_([a-z])/g', () {
    test('rewrites only an underscore followed by a lowercase letter', () {
      expect(toCamelCase('current_balance'), 'currentBalance');
      expect(toCamelCase('target_account_id'), 'targetAccountId');
      expect(
        toCamelCase('is_CANCELED'),
        'is_CANCELED',
        reason: 'the `C` is not [a-z]',
      );
      expect(
        toCamelCase('a__b'),
        'a_B',
        reason: 'the first underscore guards a second underscore',
      );
      expect(
        toCamelCase('foo_'),
        'foo_',
        reason: 'a trailing underscore has no partner',
      );
      expect(toCamelCase('_foo'), 'Foo');
      expect(toCamelCase('a_b_c'), 'aBC');
    });

    test('digits and underscores after the underscore are left alone', () {
      expect(toCamelCase('amount_1'), 'amount_1');
      expect(toCamelCase('last_'), 'last_');
      expect(toCamelCase(''), '');
    });
  });

  group('toSnakeCase — /([A-Z])/g then lowercase', () {
    test('inserts an underscore before every capital', () {
      expect(toSnakeCase('cardName'), 'card_name');
      expect(toSnakeCase('isCanceled'), 'is_canceled');
      expect(toSnakeCase('ABC'), '_a_b_c');
      expect(toSnakeCase('targetAccountId'), 'target_account_id');
    });

    test('is the identity on a column that is already snake_case', () {
      // The web always builds `snake` from a column name, and the columns are
      // already snake_case, so this second lookup re-tests the exact-name lookup
      // and finds nothing. It is ported anyway because it is what the algorithm
      // does, not what it appears to mean.
      expect(toSnakeCase('is_canceled'), 'is_canceled');
      expect(toSnakeCase('updated_at'), 'updated_at');
    });
  });

  group('the pair over the real contract', () {
    test('every allow-listed column is already snake_case', () {
      // If this ever fails, the allow-list gained a camel column and the auto-fill
      // pass now has a casing it must reason about — the web would find a
      // different property than the port does.
      for (final List<String> columns in schemaColumns.values) {
        for (final String col in columns) {
          expect(toSnakeCase(col), col, reason: '$col is not snake_case');
        }
      }
    });
  });
}
