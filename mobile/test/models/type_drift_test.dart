import 'package:em_budget/models/entities.dart';
import 'package:em_budget/models/entities_ledger.dart';
import 'package:flutter_test/flutter_test.dart';

import '../data/web_source.dart';

/// The drift test for the model layer: every typed entity in `lib/models/` is
/// checked against the `src/types.ts` interface it was generated from, read out of
/// the web source at test time.
///
/// It fails when the web adds, renames or drops a field and the Dart model does
/// not follow — the failure mode `INVENTORY.md` §5.11 already documents for the
/// category lists, applied to the objects that carry the money.
///
/// The two directions are asserted separately because they mean different things:
/// a field the web declares and the model cannot hold is data the phone loses,
/// while a key the model writes and the interface does not declare is either a
/// normalisation the port chose on purpose — and must say why, in [check]'s
/// `writes` — or an invention.
///
/// Each fixture carries **every** declared field, because [StateEntity.toJson]
/// drops nulls: an absent optional field would be indistinguishable from a field
/// the model does not know about.
void main() {
  final String types = webSource('src/types.ts');

  void check(
    String interfaceName,
    Map<String, Object?> json,
    Map<String, Object?> Function(Map<String, Object?>) decode, {
    Set<String> writes = const <String>{},
  }) {
    final List<String> webFields = parseInterfaceFields(types, interfaceName);
    final Set<String> dartKeys = decode(json).keys.toSet();

    for (final String field in webFields) {
      expect(
        dartKeys.contains(field),
        isTrue,
        reason: '$interfaceName.$field is in src/types.ts but not written',
      );
    }
    final Set<String> declared = webFields.toSet();
    for (final String key in dartKeys) {
      expect(
        declared.contains(key) || writes.contains(key),
        isTrue,
        reason:
            '$interfaceName writes `$key`, which src/types.ts does not declare',
      );
    }
  }

  group('the interfaces the web declares', () {
    test('CashAccount', () {
      check(
        'CashAccount',
        _pulled(const <String, Object?>{
          'id': 'ca-1',
          'name': 'Cash',
          'balance': 1500.5,
        }),
        (j) => CashAccount.fromJson(j).toJson(),
        // `src/types.ts:16-20` declares no timestamp at all; see [_pulled].
        writes: _pulledSpellings,
      );
    });

    test('BankCard', () {
      check(
        'BankCard',
        _pulled(const <String, Object?>{
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
          'allowNegativeBalance': false,
          'charges': <Map<String, Object?>>[
            <String, Object?>{
              'id': 'ch-1',
              'name': 'Annual',
              'amount': 1200,
              'type': 'Annual Fee',
              'appliedDate': '2026-01-01',
            },
          ],
          'lockedAmount': 0,
          'dueDate': '2026-11-07',
          'minPayment': 500,
          'apr': 24.9,
          'lastPaymentDate': '2026-10-07',
          'statementCloseDate': '2026-10-31',
        }),
        (j) => BankCard.fromJson(j).toJson(),
        writes: _pulledSpellings,
      );
    });

    test('Charge', () {
      check('Charge', const <String, Object?>{
        'id': 'ch-1',
        'name': 'Annual',
        'amount': 1200,
        'type': 'Annual Fee',
        'appliedDate': '2026-01-01',
        'isRecurring': true,
        'recurringInterval': 'Yearly',
        'description': 'bank fee',
      }, (j) => Charge.fromJson(j).toJson());
    });

    test('CreditCard and CreditCardPurchase', () {
      check('CreditCard', const <String, Object?>{
        'id': 'cc-1',
        'name': 'Visa',
        'balance': 40000,
        'limit': 200000,
        'dueDate': '2026-11-07',
        'minPayment': 2000,
      }, (j) => CreditCard.fromJson(j).toJson());
      check('CreditCardPurchase', const <String, Object?>{
        'id': 'p-1',
        'cardId': 'cc-1',
        'amount': 120000,
        'description': 'laptop',
        'merchant': 'Computer Place',
        'date': '2026-10-01',
      }, (j) => CreditCardPurchase.fromJson(j).toJson());
    });

    test('Transaction', () {
      check(
        'Transaction',
        _stamped(const <String, Object?>{
          'id': 't1',
          'type': 'transfer',
          'title': 'ATM',
          'amount': 20000,
          'charge': 150,
          'date': '2026-09-30',
          'category': 'Cash',
          'accountId': 'ca-1',
          'accountType': 'cash',
          'targetAccountId': 'bc-1',
          'targetAccountType': 'card',
          'referenceId': 'x-1',
        }),
        (j) => Transaction.fromJson(j).toJson(),
        // Not in the interface, but `src/supabase.ts:629` reads it and
        // `mapDatabaseResultToState` coerces it (`:867`), so a pulled row has it.
        writes: const <String>{'transferCharge'},
      );
    });

    test('Income and Expense', () {
      check(
        'Income',
        _stamped(const <String, Object?>{
          'id': 'i1',
          'amount': 185000,
          'date': '2026-10-01',
          'source': 'Employer',
          'category': 'Salary',
          'targetAccountId': 'ca-1',
          'targetType': 'cash',
        }),
        (j) => Income.fromJson(j).toJson(),
      );
      check(
        'Expense',
        _stamped(const <String, Object?>{
          'id': 'e1',
          'title': 'Groceries',
          'description': 'weekly',
          'amount': 1200,
          'date': '2026-10-02',
          'category': 'Shopping',
          'paymentMethodId': 'ca-1',
          'paymentMethodType': 'cash',
        }),
        (j) => Expense.fromJson(j).toJson(),
      );
    });

    test('AppNotification', () {
      check(
        'AppNotification',
        _pulled(const <String, Object?>{
          'id': 'n1',
          'type': 'reminder',
          'message': 'Bill due',
          'date': '2026-10-07',
          'read': false,
        }),
        (j) => AppNotification.fromJson(j).toJson(),
        writes: _pulledSpellings,
      );
    });

    test('Debt, DebtPayment and the optional increase history', () {
      final Map<String, Object?> payment = _stamped(const <String, Object?>{
        'id': 'dp1',
        'debtId': 'd1',
        'amount': 1000,
        'date': '2026-01-01',
        'paidFromId': 'ca-1',
        'paidFromType': 'cash',
      });
      check(
        'DebtPayment',
        payment,
        (Map<String, Object?> j) => DebtPayment.fromJson(j).toJson(),
      );

      // `Debt` declares `updated_at` but not `created_at`, so only two spellings.
      final Map<String, Object?> debt = <String, Object?>{
        'id': 'd1',
        'debtSource': 'Bank',
        'totalAmount': 100000,
        'remainingAmount': 40000,
        'dueDate': '2026-12-01',
        'notes': 'home loan',
        'payments': <Map<String, Object?>>[payment],
        'accountId': 'ca-1',
        'accountType': 'cash',
        'accountName': 'Cash',
        'status': 'Active',
        'increaseHistory': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'di1',
            'amount': 5000,
            'date': '2026-02-01',
            'accountName': 'Cash',
          },
        ],
        'updated_at': _stamp,
        'updatedAt': _stamp,
      };
      check(
        'Debt',
        debt,
        (Map<String, Object?> j) => Debt.fromJson(j).toJson(),
      );
    });

    test('LoanGiven and LoanSettlement', () {
      final Map<String, Object?> settlement = _stamped(const <String, Object?>{
        'id': 'ls1',
        'loanId': 'l1',
        'amount': 5000,
        'date': '2026-06-01',
        'receivedInId': 'ca-1',
        'receivedInType': 'cash',
        'receivedInName': 'Cash',
        'bankCharge': 100,
        'chargeExpenseId': 'e9',
      });
      check(
        'LoanSettlement',
        settlement,
        (Map<String, Object?> j) => LoanSettlement.fromJson(j).toJson(),
      );

      check(
        'LoanGiven',
        _stamped(<String, Object?>{
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
          'settlements': <Map<String, Object?>>[settlement],
          'chargeExpenseId': 'e8',
        }),
        (j) => LoanGiven.fromJson(j).toJson(),
      );
    });

    test('Subscription', () {
      check(
        'Subscription',
        _pulled(const <String, Object?>{
          'id': 's1',
          'name': 'Netflix',
          'amount': 2400,
          'billingCycle': 'Monthly',
          'dueDate': '2026-10-15',
          'category': 'Entertainment',
          'status': 'Active',
          'paymentMethodId': 'bc-1',
          'paymentMethodType': 'card',
          'lastPaidDate': '2026-09-15',
          'instanceType': 'Web service',
        }),
        (j) => Subscription.fromJson(j).toJson(),
        writes: _pulledSpellings,
      );
    });

    test('Budget and SavingsGoal', () {
      check(
        'Budget',
        _pulled(const <String, Object?>{
          'id': 'b1',
          'category': 'Food',
          'limit': 20000,
          'spent': 4000,
          'icon': 'Utensils',
          'subBreakdown': <Map<String, Object?>>[
            <String, Object?>{'name': 'Restaurants', 'spent': 1000},
          ],
        }),
        (j) => Budget.fromJson(j).toJson(),
        writes: _pulledSpellings,
      );
      check('SavingsGoal', const <String, Object?>{
        'id': 'g1',
        'name': 'Emergency',
        'target': 500000,
        'current': 120000,
        'targetDate': '2027-03-01',
      }, (j) => SavingsGoal.fromJson(j).toJson());
    });

    test('the installment pair', () {
      check(
        'CreditCardInstallment',
        _pulled(const <String, Object?>{
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
        }),
        (j) => CreditCardInstallment.fromJson(j).toJson(),
        writes: _pulledSpellings,
      );
      check(
        'CreditCardInstallmentPayment',
        _pulled(const <String, Object?>{
          'id': 'ip1',
          'installmentId': 'in1',
          'paymentNumber': 1,
          'amountDue': 10750,
          'amountPaid': 10750,
          'dueDate': '2026-11-01',
          'paidDate': '2026-10-30',
          'status': 'paid',
        }),
        (j) => CreditCardInstallmentPayment.fromJson(j).toJson(),
        writes: _pulledSpellings,
      );
    });

    test('UserProfile', () {
      check('UserProfile', const <String, Object?>{
        'name': 'Nimal',
        'email': 'n@example.com',
        'avatarUrl': 'https://example.com/a.png',
      }, (j) => UserProfile.fromJson(j).toJson());
    });
  });

  group('what the timestamps decision implies', () {
    test('seven interfaces declare no timestamp at all, yet their rows carry one', () {
      // The documented asymmetry: `src/types.ts` under-declares the runtime shape
      // for these, because `mapDatabaseResultToState` stamps every pulled row.
      // A model that followed the interface instead of the row would re-stamp on
      // every push, so the Dart side holds the field and says so above.
      for (final String iface in const <String>[
        'CashAccount',
        'BankCard',
        'AppNotification',
        'Subscription',
        'Budget',
        'CreditCardInstallment',
        'CreditCardInstallmentPayment',
      ]) {
        expect(
          parseInterfaceFields(types, iface),
          isNot(contains('updated_at')),
          reason: iface,
        );
      }
    });

    test('the declared-stamp entities are the ledger ones', () {
      for (final String iface in const <String>[
        'Transaction',
        'Income',
        'Expense',
        'Debt',
        'DebtPayment',
        'LoanGiven',
        'LoanSettlement',
      ]) {
        expect(
          parseInterfaceFields(types, iface),
          contains('updated_at'),
          reason: iface,
        );
      }
    });

    test('created_at is declared by six entities and exists in no ledger table', () {
      for (final String iface in const <String>[
        'Transaction',
        'Income',
        'Expense',
        'DebtPayment',
        'LoanGiven',
        'LoanSettlement',
      ]) {
        expect(
          parseInterfaceFields(types, iface),
          contains('created_at'),
          reason: iface,
        );
      }
      // The only two `created_at` columns in the whole schema are auth tables
      // (`20260725000000_init.sql:14` a `bigint`, `:173` a `timestamptz`), so a
      // ledger row never arrives with one: the field is there for the local
      // objects the app creates, not for the cloud.
      expect(
        parseInterfaceFields(types, 'Debt'),
        isNot(contains('created_at')),
      );
    });
  });
}

const String _stamp = '2026-01-01T00:00:00.000Z';
const Set<String> _pulledSpellings = <String>{'updated_at', 'updatedAt'};

/// What `mapDatabaseResultToState` (`src/supabase.ts:902-906`) leaves on **every**
/// pulled row: both spellings of `updated_at`, whatever the interface declares.
Map<String, Object?> _pulled(Map<String, Object?> json) => <String, Object?>{
  ...json,
  'updated_at': _stamp,
  'updatedAt': _stamp,
};

/// The same, for an entity whose own interface also declares `created_at`, so the
/// row would have carried that pair too had the table had the column.
Map<String, Object?> _stamped(Map<String, Object?> json) => <String, Object?>{
  ..._pulled(json),
  'created_at': _stamp,
  'createdAt': _stamp,
};
