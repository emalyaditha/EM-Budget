import 'dart:convert';

import 'package:em_budget/data/schema_columns.dart';
import 'package:em_budget/models/app_state.dart';
import 'package:em_budget/models/entities.dart';
import 'package:em_budget/models/entities_ledger.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// The typed models, checked against the JSON the web actually holds rather than
/// against themselves. `parity/fixtures/` is generated from the web's state
/// objects, so a decoded value must equal the value the web serialised.
void main() {
  group('AppState.fromJson — the "ensure vital nodes exist" pass', () {
    test('an empty object yields the seed, not a crash', () {
      final AppState s = AppState.fromJson(const <String, Object?>{});
      expect(s.currency, 'Rs.');
      expect(s.pinCode, '');
      expect(s.pinEnabled, false);
      expect(s.userProfile.name, 'User');
      expect(s.userProfile.email, 'user@example.com');
      expect(s.cashAccounts, isEmpty);
      expect(s.budgets, isEmpty);
      expect(s.savingsGoals, isEmpty);
    });

    test(
      'a null collection falls back to the default rather than throwing',
      () {
        // `parsed.budgets || defaults.budgets || []` (`src/utils.ts:277-295`).
        final AppState s = AppState.fromJson(const <String, Object?>{
          'budgets': null,
          'transactions': null,
          'currency': null,
        });
        expect(s.budgets, isEmpty);
        expect(s.transactions, isEmpty);
        expect(
          s.currency,
          'Rs.',
          reason: 'an explicit null currency is not a string, so the seed wins',
        );
      },
    );

    test('a stored scalar wins over the seed', () {
      final AppState s = AppState.fromJson(const <String, Object?>{
        'currency': 'USD',
        'pinEnabled': true,
        'pinCode': '1234',
      });
      expect(s.currency, 'USD');
      expect(s.pinEnabled, isTrue);
      expect(s.pinCode, '1234');
    });

    test('a userProfile of the wrong shape is replaced by the seed', () {
      final AppState s = AppState.fromJson(const <String, Object?>{
        'userProfile': 'nonsense',
      });
      expect(s.userProfile.name, 'User');
    });
  });

  group('AppState.defaultValue', () {
    test('matches the web seed exactly: nineteen fields, all empty', () {
      final Map<String, Object?> json = AppState.defaultValue().toJson();
      expect(json.keys.toList(), <String>[
        'userProfile',
        'cashAccounts',
        'cards',
        'creditCards',
        'creditCardPurchases',
        'creditCardInstallments',
        'creditCardInstallmentPayments',
        'incomes',
        'expenses',
        'debts',
        'transactions',
        'notifications',
        'subscriptions',
        'loansGiven',
        'budgets',
        'savingsGoals',
        'pinCode',
        'pinEnabled',
        'currency',
      ]);
    });
  });

  group('serialisation', () {
    test('a whole state survives an encode/decode round trip', () {
      final AppState original = AppState.fromJson(const <String, Object?>{
        'currency': 'Rs.',
        'cashAccounts': <Map<String, Object?>>[
          <String, Object?>{'id': 'ca-1', 'name': 'Cash', 'balance': 1500.5},
        ],
        'transactions': <Map<String, Object?>>[
          <String, Object?>{
            'id': 't1',
            'title': 'Groceries',
            'amount': 1200,
            'type': 'expense',
            'date': '2026-10-02',
            'category': 'Shopping',
          },
        ],
      });
      final AppState again = AppState.fromJson(
        jsonDecode(jsonEncode(original.toJson())) as Map<String, Object?>,
      );
      expect(
        again.cashAccounts.single.balance,
        original.cashAccounts.single.balance,
      );
      expect(again.transactions.single.title, 'Groceries');
      expect(again.currency, 'Rs.');
    });

    test(
      'toJson writes no null values, matching JSON.stringify on undefined',
      () {
        const BankCard card = BankCard(
          id: 'c1',
          cardName: 'NAB',
          bankName: 'National',
          cardType: 'Debit',
          currentBalance: 0,
        );
        expect(card.toJson().containsKey('limit'), isFalse);
        expect(card.toJson().containsKey('isFrozen'), isFalse);
      },
    );

    test('an integral number serialises without a trailing .0', () {
      // Dart writes `1200.0` for an integral double; JavaScript writes `1200`, and
      // `ledger_states.state` is compared as text.
      final Map<String, Object?> json = const CashAccount(
        id: 'a',
        name: 'Cash',
        balance: 1200,
      ).toJson();
      expect(jsonEncode(json), contains('"balance":1200'));
    });
  });

  group('push sanitisation (B-21)', () {
    test('the pushed snapshot blanks pinCode and nothing else changes', () {
      final AppState s = AppState.fromJson(const <String, Object?>{
        'pinCode': '4321',
        'currency': 'Rs.',
      });
      final Map<String, Object?> push = s.toJsonForPush();
      expect(push['pinCode'], '');
      expect(push['currency'], 'Rs.');
      // `src/supabase.ts:761` is `{ ...state, pinCode: '' }` — the only key it touches.
      expect(push.keys.toList(), s.toJson().keys.toList());
    });
  });

  group('timestamps', () {
    test('a row stamped with either spelling reads back the same instant', () {
      final Transaction a = Transaction.fromJson(const <String, Object?>{
        'id': 't',
        'updatedAt': '2026-05-05T09:00:00.000Z',
      });
      final Transaction b = Transaction.fromJson(const <String, Object?>{
        'id': 't',
        'updated_at': '2026-05-05T09:00:00.000Z',
      });
      expect(a.updatedAt, b.updatedAt);
    });

    test('toJson writes both spellings, as mapDatabaseResultToState does', () {
      const Transaction t = Transaction(
        id: 't',
        title: 'x',
        amount: 1,
        type: 'expense',
        date: '2026-10-02',
        category: 'Shopping',
        updatedAt: '2026-05-05T09:00:00.000Z',
      );
      expect(t.toJson()['updated_at'], '2026-05-05T09:00:00.000Z');
      expect(t.toJson()['updatedAt'], '2026-05-05T09:00:00.000Z');
    });
  });

  group('the cancelled alias', () {
    test('isCancelled is accepted where isCanceled is absent', () {
      final BankCard card = BankCard.fromJson(const <String, Object?>{
        'id': 'c',
        'cardName': 'n',
        'bankName': 'b',
        'cardType': 'Debit',
        'currentBalance': 0,
        'isCancelled': true,
      });
      expect(card.isCanceled, isTrue);
    });
  });

  group('collections that have no table', () {
    test('savingsGoals and creditCardPurchases survive the snapshot only', () {
      // `INVENTORY.md` §3: the goals tab writes JSON inside `ledger_states`;
      // there is no `savings_goals` table and `getSchemaColumns` says so.
      expect(schemaColumns.containsKey('savings_goals'), isFalse);
      expect(schemaColumns.containsKey('credit_card_purchases'), isFalse);

      final AppState s = AppState.fromJson(const <String, Object?>{
        'savingsGoals': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'g1',
            'name': 'Holiday',
            'target': 50000,
            'current': 1000,
            'targetDate': '2026-12-01',
          },
        ],
      });
      expect(s.savingsGoals.single.id, 'g1');
      expect(s.savingsGoals.single.target, 50000);
      expect(s.savingsGoals.single.current, 1000);
    });
  });

  group('union lists are the web\'s, in order', () {
    // Compared against `src/types.ts` rather than a hand-written expectation:
    // `INVENTORY.md` §5.11 records that these lists are already synced by hand
    // across four places, and a Dart copy would be a fifth.
    final String types = webSource('src/types.ts');

    test('CategoryIncome and CategoryExpense', () {
      expect(
        categoryIncomes,
        equals(parseStringUnion(types, 'CategoryIncome')),
      );
      expect(
        categoryExpenses,
        equals(parseStringUnion(types, 'CategoryExpense')),
      );
    });

    test('Transaction type and account type', () {
      expect(
        transactionTypes,
        equals(parseFieldUnion(types, 'Transaction', 'type')),
      );
      expect(
        accountTypes,
        equals(parseFieldUnion(types, 'Transaction', 'accountType')),
      );
    });
  });

  group('nested structures', () {
    test('a debt keeps its payments and increase history', () {
      final Debt d = Debt.fromJson(const <String, Object?>{
        'id': 'd1',
        'debtSource': 'Bank',
        'totalAmount': 100000,
        'remainingAmount': 40000,
        'payments': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'p1',
            'amount': 1000,
            'date': '2026-01-01',
            'method': 'Cash',
          },
        ],
        'increaseHistory': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'i1',
            'amount': 500,
            'date': '2026-02-01',
            'accountName': 'Fee',
          },
        ],
      });
      expect(d.payments.single.amount, 1000);
      expect(d.increaseHistory?.single.amount, 500);
      expect(d.increaseHistory?.single.accountName, 'Fee');
      expect(d.toJson()['payments'], isA<List<Object?>>());
      // `increaseHistory` is optional in the type, so a debt without it writes no
      // key at all rather than an empty list.
      expect(
        Debt.fromJson(const <String, Object?>{'id': 'd'})
            .toJson()
            .containsKey('increaseHistory'),
        isFalse,
      );
    });

    test('an installment payment keeps no owner column', () {
      final CreditCardInstallmentPayment p =
          CreditCardInstallmentPayment.fromJson(const <String, Object?>{
            'id': 'ip1',
            'installmentId': 'i1',
            'paymentNumber': 3,
            'amountDue': 5000,
            'amountPaid': 5000,
            'dueDate': '2026-03-01',
            'status': 'paid',
          });
      expect(p.paymentNumber, 3);
      expect(
        getSchemaColumns('credit_card_installment_payments'),
        isNot(contains('user_email')),
      );
      expect(
        getSchemaColumns('credit_card_installments'),
        contains('user_email'),
      );
    });
  });
}
