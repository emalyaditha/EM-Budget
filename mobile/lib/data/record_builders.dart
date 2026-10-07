/// The push fan-out — `syncStateToSupabase`'s twelve mapping blocks
/// (`src/supabase.ts:562-759`) ported block for block.
///
/// Each builder hands `mapObjectToColumns` the same two arguments the web hands
/// it: the state object as a property map, and the explicit `mappingRules`
/// literal written out at the cited line. Nothing is inferred: where the web
/// writes `sub.paymentMethodId || null`, `null` is what the rule holds, and where
/// the web passes a bare property, the key is omitted when it is absent — the
/// undefined/null distinction documented on `mapObjectToColumns`.
///
/// The rules name **both** casings in several blocks (the card block at
/// `:577-590` lists `current_balance` and `currentBalance`, `card_name` and
/// `cardName`, …). That is not redundancy: only the spelling the allow-list has
/// survives, and the other one is dropped by the guard at `:401`. Both are ported
/// so the drop is observable.
library;

import '../models/app_state.dart';
import '../models/entities.dart';
import '../models/entities_ledger.dart';
import 'js_semantics.dart';
import 'map_object_to_columns.dart';
import 'schema_columns.dart';

/// One relational row: column name → value, as it goes into the RPC's `jsonb`.
typedef LedgerRecord = Map<String, Object?>;

/// `state.budgets` → `spending_envelopes` (`src/supabase.ts:565-574`).
List<LedgerRecord> buildSpendingEnvelopes(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('spending_envelopes');
  return state.budgets
      .map((Budget b) {
        return mapObjectToColumns(
          item: b.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': b.id,
            'category': b.category,
            'limit': b.limit,
            'spent': jsTruthy(b.spent) ? b.spent : 0, // `b.spent || 0`
            'icon': jsTruthy(b.icon)
                ? b.icon
                : 'TrendingUp', // `b.icon || 'TrendingUp'`
            'sub_breakdown': b.subBreakdown, // `b.subBreakdown || []`
          },
        );
      })
      .toList(growable: false);
}

/// `state.cards` → `bank_cards` (`src/supabase.ts:576-610`), including the
/// post-mapping fix-ups that delete the misspelled alias and force the booleans.
List<LedgerRecord> buildBankCards(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('bank_cards');
  return state.cards
      .map((BankCard card) {
        final Map<String, Object?> item = card.stateFields;
        final LedgerRecord mapped = mapObjectToColumns(
          item: item,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': card.id,
            'current_balance': card.currentBalance,
            'currentBalance': card.currentBalance,
            'card_name': card.cardName,
            'cardName': card.cardName,
            'bank_name': card.bankName,
            'bankName': card.bankName,
            'card_type': card.cardType,
            'cardType': card.cardType,
            'card_number': card.cardNumber, // `card.cardNumber || null`
            'cardNumber': card.cardNumber,
            'card_theme': jsTruthy(card.cardTheme)
                ? card.cardTheme
                : 'obsidian',
          },
        );

        // `:591-595`. Both the camel and the snake spelling are read for the cancel
        // flag, because a row pulled from the snapshot may carry either.
        mapped['is_canceled'] =
            card.isCanceled == true || item['is_canceled'] == true;
        mapped.remove('is_cancelled');
        mapped.remove('isCanceled');

        // `:596-608`. Each is guarded by the allow-list on the web; the guard is kept
        // so a future column change cannot silently widen the write. Each web line
        // is `x !== undefined ? x : null` — in Dart a null field already writes
        // null, so the ternary collapses.
        if (cols.contains('limit')) {
          mapped['limit'] = card.limit;
        }
        if (cols.contains('is_limit_locked')) {
          // The web's default when the field is absent is **true**, not false
          // (`src/supabase.ts:598`). Ported verbatim; it is the one card boolean whose
          // absence is meaningful.
          mapped['is_limit_locked'] = card.isLimitLocked ?? true;
        }
        if (cols.contains('is_frozen')) {
          mapped['is_frozen'] = card.isFrozen ?? false;
        }
        if (cols.contains('locked_amount')) {
          mapped['locked_amount'] = card.lockedAmount;
        }
        if (cols.contains('due_date')) {
          mapped['due_date'] = card.dueDate;
        }
        if (cols.contains('min_payment')) {
          mapped['min_payment'] = card.minPayment;
        }
        if (cols.contains('apr')) {
          mapped['apr'] = card.apr;
        }
        if (cols.contains('last_payment_date')) {
          mapped['last_payment_date'] = card.lastPaymentDate;
        }
        return mapped;
      })
      .toList(growable: false);
}

/// `state.cashAccounts` → `cash_accounts` (`src/supabase.ts:612-619`).
List<LedgerRecord> buildCashAccounts(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('cash_accounts');
  return state.cashAccounts
      .map((CashAccount acc) {
        return mapObjectToColumns(
          item: acc.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': acc.id,
            'name': acc.name,
            'balance': acc.balance,
          },
        );
      })
      .toList(growable: false);
}

/// `state.transactions` → `transactions` (`src/supabase.ts:621-640`).
///
/// `transfer_charge` falls back to `charge` (`:629`), and `charge` itself falls
/// back to `0` — so a transfer with no fee of either kind writes `0` twice. The
/// four account fields are the only place the web lists a camel alias in the
/// rules without the snake form being in the allow-list.
List<LedgerRecord> buildTransactions(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('transactions');
  return state.transactions
      .map((Transaction tx) {
        final Map<String, Object?> item = tx.stateFields;
        return mapObjectToColumns(
          item: item,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': tx.id,
            'type': tx.type,
            'title': tx.title,
            'amount': tx.amount,
            'charge': jsTruthy(tx.charge) ? tx.charge : 0,
            'transfer_charge': jsTruthy(item['transferCharge'])
                ? item['transferCharge']
                : (jsTruthy(tx.charge) ? tx.charge : 0),
            'date': tx.date,
            'category': tx.category,
            'account_id': tx.accountId, // `|| null`
            'accountType': tx.accountType,
            'account_type': tx.accountType,
            'target_account_id': tx.targetAccountId,
            'targetAccountType': tx.targetAccountType,
            'target_account_type': tx.targetAccountType,
            'reference_id': tx.referenceId,
          },
        );
      })
      .toList(growable: false);
}

/// `state.debts` → `debts` (`src/supabase.ts:642-656`). `payments` and
/// `increaseHistory` stay inside the row as `jsonb`; there is no payments table.
List<LedgerRecord> buildDebts(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('debts');
  return state.debts
      .map((Debt debt) {
        return mapObjectToColumns(
          item: debt.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': debt.id,
            'debt_source': debt.debtSource,
            'total_amount': debt.totalAmount,
            'remaining_amount': debt.remainingAmount,
            'due_date': debt.dueDate,
            'notes': jsTruthy(debt.notes) ? debt.notes : null,
            'payments': debt.payments
                .map((DebtPayment p) => p.toJson())
                .toList(),
            'account_id': debt.accountId,
            'account_type': debt.accountType,
            'account_name': debt.accountName,
          },
        );
      })
      .toList(growable: false);
}

/// `state.incomes` → `incomes` (`src/supabase.ts:658-669`). Note the column is
/// `target_type`, not `target_type`'s state name `targetType`, and that the two
/// required fields are passed bare (no `|| null`).
List<LedgerRecord> buildIncomes(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('incomes');
  return state.incomes
      .map((Income inc) {
        return mapObjectToColumns(
          item: inc.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': inc.id,
            'amount': inc.amount,
            'date': inc.date,
            'source': inc.source,
            'category': inc.category,
            'target_account_id': inc.targetAccountId,
            'target_type': inc.targetType,
          },
        );
      })
      .toList(growable: false);
}

/// `state.expenses` → `expenses` (`src/supabase.ts:671-683`).
List<LedgerRecord> buildExpenses(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('expenses');
  return state.expenses
      .map((Expense exp) {
        return mapObjectToColumns(
          item: exp.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': exp.id,
            'title': exp.title,
            'description': jsTruthy(exp.description) ? exp.description : null,
            'amount': exp.amount,
            'date': exp.date,
            'category': exp.category,
            'payment_method_id': exp.paymentMethodId,
            'payment_method_type': exp.paymentMethodType,
          },
        );
      })
      .toList(growable: false);
}

/// `state.notifications` → `notifications` (`src/supabase.ts:685-694`).
List<LedgerRecord> buildNotifications(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('notifications');
  return state.notifications
      .map((AppNotification notif) {
        return mapObjectToColumns(
          item: notif.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': notif.id,
            'type': notif.type,
            'message': notif.message,
            'date': notif.date,
            'read': notif.read,
          },
        );
      })
      .toList(growable: false);
}

/// `state.subscriptions` → `subscriptions` (`src/supabase.ts:696-711`).
///
/// **B-20 lives here.** The rule at `:709` supplies `instance_type`, and the
/// allow-list does not contain it, so line 3 of `mapObjectToColumns` drops it and
/// the relational column stays NULL for every row the web writes. The Dart port
/// passes the same rule and therefore drops the same key — the bug-compatible
/// reading. Switching it on is the DECISION recorded in `parity/BUGS_FOUND.md`.
List<LedgerRecord> buildSubscriptions(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('subscriptions');
  return state.subscriptions
      .map((Subscription sub) {
        return mapObjectToColumns(
          item: sub.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': sub.id,
            'name': sub.name,
            'amount': sub.amount,
            'billing_cycle': sub.billingCycle,
            'due_date': sub.dueDate,
            'category': sub.category,
            'status': sub.status,
            'payment_method_id': sub.paymentMethodId,
            'payment_method_type': sub.paymentMethodType,
            'last_paid_date': sub.lastPaidDate,
            'instance_type':
                sub.instanceType, // dropped by the allow-list — B-20
          },
        );
      })
      .toList(growable: false);
}

/// `state.loansGiven` → `loans_given` (`src/supabase.ts:713-728`). `settlements`
/// is a `jsonb` column on the row, not a table.
List<LedgerRecord> buildLoansGiven(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('loans_given');
  return state.loansGiven
      .map((LoanGiven loan) {
        return mapObjectToColumns(
          item: loan.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': loan.id,
            'borrower_name': loan.borrowerName,
            'total_amount': loan.totalAmount,
            'remaining_amount': loan.remainingAmount,
            'date_given': loan.dateGiven,
            'source_account_id': loan.sourceAccountId,
            'source_account_type': loan.sourceAccountType,
            'source_account_name': loan.sourceAccountName,
            'status': loan.status,
            'notes': jsTruthy(loan.notes) ? loan.notes : null,
            'settlements': loan.settlements
                .map((LoanSettlement s) => s.toJson())
                .toList(),
          },
        );
      })
      .toList(growable: false);
}

/// `state.creditCardInstallments` → `credit_card_installments`
/// (`src/supabase.ts:730-745`).
List<LedgerRecord> buildInstallments(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns('credit_card_installments');
  return state.creditCardInstallments
      .map((CreditCardInstallment inst) {
        return mapObjectToColumns(
          item: inst.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': inst.id,
            'card_id': inst.cardId,
            'purchase_id': inst.purchaseId,
            'original_amount': inst.originalAmount,
            'tenure_months': inst.tenureMonths,
            'processing_fee': inst.processingFee,
            'monthly_payment': inst.monthlyPayment,
            'start_date': inst.startDate,
            'status': inst.status,
            'next_payment_date': inst.nextPaymentDate, // `|| null`
            'payments_made': inst.paymentsMade,
          },
        );
      })
      .toList(growable: false);
}

/// `state.creditCardInstallmentPayments` → `credit_card_installment_payments`
/// (`src/supabase.ts:747-759`). The one fan-out with no owner column, so
/// `mapObjectToColumns` writes no `user_email` for it and RLS reaches these rows
/// through their installment.
List<LedgerRecord> buildInstallmentPayments(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  final List<String> cols = getSchemaColumns(
    'credit_card_installment_payments',
  );
  return state.creditCardInstallmentPayments
      .map((CreditCardInstallmentPayment pay) {
        return mapObjectToColumns(
          item: pay.stateFields,
          columns: cols,
          email: email,
          now: now,
          mappingRules: <String, Object?>{
            'id': pay.id,
            'installment_id': pay.installmentId,
            'payment_number': pay.paymentNumber,
            'amount_due': pay.amountDue,
            'amount_paid': pay.amountPaid,
            'due_date': pay.dueDate,
            'paid_date': pay.paidDate,
            'status': pay.status,
          },
        );
      })
      .toList(growable: false);
}

/// The 14-parameter `sync_complete_ledger` payload (`src/supabase.ts:770-785`).
///
/// Parameter order is the web's, and `p_state` is the **sanitised** snapshot
/// (`pinCode` blanked at `:761`) rather than the raw one.
Map<String, Object?> buildSyncRpcPayload(
  AppState state,
  String email, {
  String? Function()? now,
}) {
  return <String, Object?>{
    'p_email': email,
    'p_state': state.toJsonForPush(),
    'p_cards': buildBankCards(state, email, now: now),
    'p_cash_accounts': buildCashAccounts(state, email, now: now),
    'p_transactions': buildTransactions(state, email, now: now),
    'p_debts': buildDebts(state, email, now: now),
    'p_incomes': buildIncomes(state, email, now: now),
    'p_expenses': buildExpenses(state, email, now: now),
    'p_notifications': buildNotifications(state, email, now: now),
    'p_subscriptions': buildSubscriptions(state, email, now: now),
    'p_loans_given': buildLoansGiven(state, email, now: now),
    'p_spending_envelopes': buildSpendingEnvelopes(state, email, now: now),
    'p_installments': buildInstallments(state, email, now: now),
    'p_installment_payments': buildInstallmentPayments(state, email, now: now),
  };
}
