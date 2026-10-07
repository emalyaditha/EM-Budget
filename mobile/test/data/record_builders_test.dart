import 'package:em_budget/data/record_builders.dart';
import 'package:em_budget/data/schema_columns.dart';
import 'package:em_budget/models/app_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

const String email = 'qa@example.com';
const String pinned = '2026-10-04T04:30:00.000Z';
const String keptStamp = '2026-01-01T00:00:00.000Z';

String? clock() => pinned;

/// Table → the web's fan-out variable, so the rule keys can be read out of
/// `src/supabase.ts` and compared against what the port writes.
const Map<String, String> _webRecordsVar = <String, String>{
  'spending_envelopes': 'recordsSpendingEnvelopes',
  'bank_cards': 'recordsCards',
  'cash_accounts': 'recordsCash',
  'transactions': 'recordsTx',
  'debts': 'recordsDebts',
  'incomes': 'recordsIncomes',
  'expenses': 'recordsExpenses',
  'notifications': 'recordsNotifications',
  'subscriptions': 'recordsSubscriptions',
  'loans_given': 'recordsLoans',
  'credit_card_installments': 'recordsInstallments',
  'credit_card_installment_payments': 'recordsInstPayments',
};

/// One entity per table, with every state field populated and a stamp already
/// carried, so that a column can only be missing because the port does not write
/// it.
final AppState fullState = AppState.fromJson(<String, Object?>{
  'currency': 'Rs.',
  'cashAccounts': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'ca-1',
      'name': 'Cash',
      'balance': 1500.5,
      'updated_at': keptStamp,
    },
  ],
  'cards': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'bc-1',
      'cardName': 'NAB Debit',
      'bankName': 'National',
      'cardType': 'Debit',
      'currentBalance': 250,
      'limit': 100000,
      'isLimitLocked': false,
      'cardNumber': '4111',
      'isCanceled': false,
      'cardTheme': 'obsidian',
      'isFrozen': false,
      'lockedAmount': 0,
      'dueDate': '2026-11-07',
      'minPayment': 500,
      'apr': 24.9,
      'lastPaymentDate': '2026-10-07',
      'updated_at': keptStamp,
    },
  ],
  'transactions': <Map<String, Object?>>[
    <String, Object?>{
      'id': 't1',
      'type': 'transfer',
      'title': 'ATM',
      'amount': 20000,
      'charge': 150,
      'transferCharge': 200,
      'date': '2026-09-30',
      'category': 'Cash',
      'accountId': 'ca-1',
      'accountType': 'cash',
      'targetAccountId': 'bc-1',
      'targetAccountType': 'card',
      'referenceId': 'x-1',
      'updated_at': keptStamp,
    },
  ],
  'debts': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'd1',
      'debtSource': 'Bank',
      'totalAmount': 100000,
      'remainingAmount': 40000,
      'dueDate': '2026-12-01',
      'notes': 'home loan',
      'payments': <Map<String, Object?>>[
        <String, Object?>{
          'id': 'dp1',
          'amount': 1000,
          'date': '2026-01-01',
          'method': 'Cash',
        },
      ],
      'accountId': 'ca-1',
      'accountType': 'cash',
      'accountName': 'Cash',
      'updated_at': keptStamp,
    },
  ],
  'incomes': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'i1',
      'amount': 185000,
      'date': '2026-10-01',
      'source': 'Employer',
      'category': 'Salary',
      'targetAccountId': 'ca-1',
      'targetType': 'cash',
      'updated_at': keptStamp,
    },
  ],
  'expenses': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'e1',
      'title': 'Groceries',
      'description': 'weekly',
      'amount': 1200,
      'date': '2026-10-02',
      'category': 'Shopping',
      'paymentMethodId': 'ca-1',
      'paymentMethodType': 'cash',
      'updated_at': keptStamp,
    },
  ],
  'notifications': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'n1',
      'type': 'reminder',
      'message': 'Bill due',
      'date': '2026-10-07',
      'read': false,
      'updated_at': keptStamp,
    },
  ],
  'subscriptions': <Map<String, Object?>>[
    <String, Object?>{
      'id': 's1',
      'name': 'Netflix',
      'amount': 2400,
      'billingCycle': 'monthly',
      'dueDate': '2026-10-15',
      'category': 'Entertainment',
      'status': 'active',
      'paymentMethodId': 'bc-1',
      'paymentMethodType': 'card',
      'lastPaidDate': '2026-09-15',
      'instanceType': 'SriLankan',
      'updated_at': keptStamp,
    },
  ],
  'loansGiven': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'l1',
      'borrowerName': 'A friend',
      'totalAmount': 50000,
      'remainingAmount': 20000,
      'dateGiven': '2026-05-01',
      'sourceAccountId': 'ca-1',
      'sourceAccountType': 'cash',
      'sourceAccountName': 'Cash',
      'status': 'Active',
      'notes': 'car repair',
      'settlements': <Map<String, Object?>>[
        <String, Object?>{
          'id': 'ls1',
          'amount': 5000,
          'date': '2026-06-01',
          'method': 'Cash',
          'note': 'part',
        },
      ],
      'updated_at': keptStamp,
    },
  ],
  'budgets': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'b1',
      'category': 'Food',
      'limit': 20000,
      'spent': 4000,
      'icon': 'Utensils',
      'subBreakdown': <Map<String, Object?>>[
        <String, Object?>{'name': 'Restaurants', 'spent': 1000},
      ],
      'updated_at': keptStamp,
    },
  ],
  'creditCardInstallments': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'in1',
      'cardId': 'bc-1',
      'purchaseId': 'p-1',
      'originalAmount': 120000,
      'tenureMonths': 12,
      'processingFee': 9000,
      'monthlyPayment': 10750,
      'startDate': '2026-10-01',
      'status': 'active',
      'nextPaymentDate': '2026-11-01',
      'paymentsMade': 0,
      'updated_at': keptStamp,
    },
  ],
  'creditCardInstallmentPayments': <Map<String, Object?>>[
    <String, Object?>{
      'id': 'ip1',
      'installmentId': 'in1',
      'paymentNumber': 1,
      'amountDue': 10750,
      'amountPaid': 10750,
      'dueDate': '2026-11-01',
      'paidDate': '2026-10-30',
      'status': 'paid',
      'updated_at': keptStamp,
    },
  ],
});

List<LedgerRecord> buildFor(String table) {
  switch (table) {
    case 'spending_envelopes':
      return buildSpendingEnvelopes(fullState, email, now: clock);
    case 'bank_cards':
      return buildBankCards(fullState, email, now: clock);
    case 'cash_accounts':
      return buildCashAccounts(fullState, email, now: clock);
    case 'transactions':
      return buildTransactions(fullState, email, now: clock);
    case 'debts':
      return buildDebts(fullState, email, now: clock);
    case 'incomes':
      return buildIncomes(fullState, email, now: clock);
    case 'expenses':
      return buildExpenses(fullState, email, now: clock);
    case 'notifications':
      return buildNotifications(fullState, email, now: clock);
    case 'subscriptions':
      return buildSubscriptions(fullState, email, now: clock);
    case 'loans_given':
      return buildLoansGiven(fullState, email, now: clock);
    case 'credit_card_installments':
      return buildInstallments(fullState, email, now: clock);
    case 'credit_card_installment_payments':
      return buildInstallmentPayments(fullState, email, now: clock);
  }
  throw StateError('no builder for $table');
}

void main() {
  final String supabaseTs = webSource('src/supabase.ts');

  test('the twelve builders each produce one row', () {
    for (final String table in syncTableOrder) {
      expect(buildFor(table), hasLength(1), reason: table);
    }
  });

  group('write contract', () {
    test('no row ever carries a key outside its allow-list', () {
      for (final String table in syncTableOrder) {
        final Set<String> allowed = getSchemaColumns(table).toSet();
        for (final LedgerRecord row in buildFor(table)) {
          for (final String key in row.keys) {
            expect(
              allowed.contains(key),
              isTrue,
              reason: '$table wrote `$key`, which is not a column',
            );
          }
        }
      }
    });

    test('every rule key the web names, when it is a real column, is written', () {
      // The drift test: read the rule literal out of `src/supabase.ts` and check
      // the port produces the same keys. A new web rule with no Dart counterpart
      // fails here rather than silently becoming a NULL column.
      for (final String table in syncTableOrder) {
        final List<String> webKeys = parseMappingRuleKeys(
          supabaseTs,
          _webRecordsVar[table]!,
        );
        final Set<String> allowed = getSchemaColumns(table).toSet();
        final Set<String> written = buildFor(table).single.keys.toSet();
        for (final String key in webKeys.where(allowed.contains)) {
          expect(
            written.contains(key),
            isTrue,
            reason:
                '$table: the web names rule `$key` and the port does not write it',
          );
        }
      }
    });

    test('the identity column is written wherever the table has one', () {
      for (final String table in syncTableOrder) {
        final bool hasOwner = getSchemaColumns(table).contains('user_email');
        final LedgerRecord row = buildFor(table).single;
        if (hasOwner) {
          expect(row['user_email'], email, reason: table);
        } else {
          expect(row.containsKey('user_email'), isFalse, reason: table);
        }
      }
    });

    test('a row that already carries updated_at is never re-stamped', () {
      // `src/supabase.ts:362` — a re-push must not move the stamp forward, so the
      // injected clock must never appear. Every one of the twelve tables has
      // `updated_at … not null` in the DDL, so `mapDatabaseResultToState`
      // (`:902-906`) stamps every pulled row, including the seven whose
      // `src/types.ts` interface declares no timestamp at all.
      for (final String table in syncTableOrder) {
        final LedgerRecord row = buildFor(table).single;
        final String stampColumn =
            getSchemaColumns(table).contains('updated_at')
            ? 'updated_at'
            : 'updatedAt';
        expect(row[stampColumn], keptStamp, reason: table);
      }
    });

    test('a locally made row with no stamp at all gets the wall clock', () {
      // The other half of the same hunt. `src/types.ts:210-217` declares no
      // timestamp on `Budget`, so a budget created on this device and never
      // pulled from the cloud genuinely carries none, and `:393` stamps it from
      // the clock.
      final AppState fresh = AppState.fromJson(const <String, Object?>{
        'budgets': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'b2',
            'category': 'Food',
            'limit': 100,
            'spent': 0,
            'icon': 'Utensils',
            'subBreakdown': <Map<String, Object?>>[],
          },
        ],
      });
      expect(fresh.budgets.single.toJson().containsKey('updated_at'), isFalse);
      expect(
        buildSpendingEnvelopes(fresh, email, now: clock).single['updated_at'],
        pinned,
      );
    });
  });

  group('bank_cards fix-ups', () {
    final LedgerRecord row = buildFor('bank_cards').single;

    test('is_canceled is forced to a boolean and the aliases are deleted', () {
      expect(row['is_canceled'], isA<bool>());
      expect(row.containsKey('is_cancelled'), isFalse);
      expect(row.containsKey('isCanceled'), isFalse);
    });

    test('an absent is_limit_locked defaults to true, not false', () {
      final AppState unsaved = AppState.fromJson(const <String, Object?>{
        'cards': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'bc-2',
            'cardName': 'No flags',
            'bankName': 'None',
            'cardType': 'Credit',
            'currentBalance': 0,
          },
        ],
      });
      final LedgerRecord r = buildBankCards(unsaved, email, now: clock).single;
      expect(r['is_limit_locked'], isTrue);
      expect(r['is_frozen'], isFalse);
      expect(r['limit'], isNull);
      expect(
        r['card_theme'],
        'obsidian',
        reason: '`cardTheme || \'obsidian\'`',
      );
    });

    test('a card number that is absent writes null, as `|| null` does', () {
      expect(row.containsKey('card_number'), isTrue);
      expect(row['card_number'], '4111');
    });
  });

  group('transactions', () {
    final LedgerRecord row = buildFor('transactions').single;

    test('transfer_charge wins over charge when both are present', () {
      expect(row['transfer_charge'], 200);
      expect(row['charge'], 150);
    });

    test('a zero fee of both kinds writes 0 twice, not null', () {
      final AppState bare = AppState.fromJson(const <String, Object?>{
        'transactions': <Map<String, Object?>>[
          <String, Object?>{
            'id': 't9',
            'type': 'expense',
            'title': 'Tea',
            'amount': 200,
            'date': '2026-10-02',
            'category': 'Food',
          },
        ],
      });
      final LedgerRecord r = buildTransactions(bare, email, now: clock).single;
      expect(r['charge'], 0);
      expect(r['transfer_charge'], 0);
      expect(r['account_id'], isNull);
    });
  });

  group('B-20 is observable, not silent', () {
    test(
      'the web names instance_type as a rule and the allow-list drops it',
      () {
        expect(
          parseMappingRuleKeys(supabaseTs, 'recordsSubscriptions'),
          contains('instance_type'),
        );
        expect(
          getSchemaColumns('subscriptions'),
          isNot(contains('instance_type')),
        );
        expect(
          buildFor('subscriptions').single.containsKey('instance_type'),
          isFalse,
        );
      },
    );
  });

  group('jsonb columns stay inside the row', () {
    test(
      'debt payments, loan settlements and budget sub-breakdowns are values',
      () {
        expect(buildFor('debts').single['payments'], isA<List<Object?>>());
        expect(
          buildFor('loans_given').single['settlements'],
          isA<List<Object?>>(),
        );
        expect(
          buildFor('spending_envelopes').single['sub_breakdown'],
          isA<List<Object?>>(),
        );
        // They are columns of the parent table, not fan-outs of their own.
        expect(syncTableOrder, isNot(contains('debt_payments')));
      },
    );
  });

  group('sync_complete_ledger payload', () {
    final Map<String, Object?> payload = buildSyncRpcPayload(
      fullState,
      email,
      now: clock,
    );

    test('the fourteen parameters, in the web order', () {
      expect(payload.keys.toList(), <String>[
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
      ]);
    });

    test('p_email is the owner and p_state is the sanitised snapshot', () {
      expect(payload['p_email'], email);
      expect((payload['p_state']! as Map<String, Object?>)['pinCode'], '');
    });

    test(
      'the state snapshot keeps pinCode locally — only the push blanks it',
      () {
        final AppState s = AppState.fromJson(const <String, Object?>{
          'pinCode': '2580',
          'pinEnabled': true,
        });
        expect(s.toJson()['pinCode'], '2580');
        expect(
          buildSyncRpcPayload(s, email, now: clock)['p_state'],
          isNot(contains('2580')),
        );
        expect(
          (buildSyncRpcPayload(s, email, now: clock)['p_state']!
              as Map<String, Object?>)['pinCode'],
          '',
        );
      },
    );
  });

  group('empty collections produce empty fan-outs, not missing keys', () {
    test('a brand-new account still sends fourteen parameters', () {
      final Map<String, Object?> payload = buildSyncRpcPayload(
        AppState.defaultValue(),
        email,
        now: clock,
      );
      expect(payload.length, 14);
      for (final String key in payload.keys.where(
        (String k) => k != 'p_email' && k != 'p_state',
      )) {
        expect(payload[key], isEmpty, reason: key);
      }
    });
  });
}
