import 'package:em_budget/data/schema_columns.dart';
import 'package:flutter_test/flutter_test.dart';

import 'web_source.dart';

/// Proves `lib/data/schema_columns.dart` is the web's list, not a copy that has
/// drifted since it was written. The comparison is order-sensitive because
/// `mapObjectToColumns` iterates the list when filling unnamed columns, and the
/// fixtures record that order.
void main() {
  group('schema columns match the web source', () {
    final Map<String, List<String>> web = parseWebSchemaColumns(
      webSource('src/supabase.ts'),
    );

    test('the same tables, no extras, none missing', () {
      expect(
        schemaColumns.keys.toSet(),
        equals(web.keys.toSet()),
        reason: 'a table added or renamed on the web is not reflected here',
      );
    });

    test('every table has the same columns in the same order', () {
      for (final String table in web.keys.toList()..sort()) {
        expect(
          schemaColumns[table],
          equals(web[table]),
          reason: '$table drifted from src/supabase.ts',
        );
      }
    });

    test('ledger_states is present and is not part of the fan-out', () {
      expect(schemaColumns.containsKey('ledger_states'), isTrue);
      expect(syncTableOrder, isNot(contains('ledger_states')));
    });

    test('the fan-out covers the other twelve tables exactly once', () {
      expect(syncTableOrder.length, schemaColumns.length - 1);
      expect(syncTableOrder.toSet().length, syncTableOrder.length);
      for (final String table in syncTableOrder) {
        expect(
          schemaColumns.containsKey(table),
          isTrue,
          reason: '$table unknown',
        );
      }
    });

    test('the payload keys are the RPC parameter names, in the web order', () {
      // `src/supabase.ts:770-785` — `p_state` then the twelve fan-outs. The order
      // of a map literal is the order the web sends, and the RPC is positional by
      // name, so drift here is a wrong-table write rather than a type error.
      final List<String> rpcOrder = <String>[
        'p_email',
        'p_state',
        'p_cards',
        'p_cash_accounts',
        'p_transactions',
        'p_debts',
        'p_incomes',
        'p_expenses',
        'p_notifications',
        'p_subscriptions',
        'p_loans_given',
        'p_spending_envelopes',
        'p_installments',
        'p_installment_payments',
      ];
      final RegExp inSource = RegExp(
        r'const rpcPayload = \{([\s\S]*?)\n      \};',
      );
      final RegExpMatch? m = inSource.firstMatch(webSource('src/supabase.ts'));
      expect(
        m,
        isNotNull,
        reason: 'rpcPayload literal not found — parser is stale',
      );
      final List<String> fromWeb = RegExp(r'p_[a-z_]+(?=\s*:)')
          .allMatches(m!.group(1)!)
          .map((RegExpMatch r) => r.group(0)!)
          .toList();
      expect(fromWeb, equals(rpcOrder));
    });
  });

  group('getSchemaColumns', () {
    test('returns a copy the caller cannot use to mutate the contract', () {
      final List<String> first = getSchemaColumns('bank_cards');
      final int length = first.length;
      first.add('injected');
      expect(getSchemaColumns('bank_cards').length, length);
    });

    test(
      'an unknown table yields the empty list, so a record comes back empty',
      () {
        expect(getSchemaColumns('no_such_table'), isEmpty);
      },
    );
  });

  group('known gap on the allow-list', () {
    test('B-20: subscriptions has no instance_type column even though the rule supplies it', () {
      expect(
        getSchemaColumns('subscriptions'),
        isNot(contains('instance_type')),
      );
    });
  });
}
