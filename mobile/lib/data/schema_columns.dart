/// The client-side column allow-list, ported verbatim from
/// `src/supabase.ts:197-331`.
///
/// This is not documentation and not a cache: it is the write contract.
/// `mapObjectToColumns` drops every key whose column name is absent from these
/// lists (`src/supabase.ts:399-404`), so a field missing here is a field the app
/// cannot persist to the relational side no matter what the state object holds.
/// B-20 in `parity/BUGS_FOUND.md` is exactly that happening to
/// `subscriptions.instance_type`.
///
/// The web's own comment is the rule for editing this file: "The sync path relies
/// on these exact names, so any edit must ship a matching migration."
library;

/// Table name → allowed columns, in the web's declared order.
///
/// Order is preserved because `mapObjectToColumns` iterates it when filling
/// columns the mapping rules did not name, and that order is what the golden
/// fixtures record.
const Map<String, List<String>> schemaColumns = <String, List<String>>{
  'ledger_states': <String>['id', 'user_email', 'state', 'updated_at'],
  'bank_cards': <String>[
    'id',
    'user_email',
    'card_name',
    'bank_name',
    'card_type',
    'current_balance',
    'card_number',
    'is_canceled',
    'limit',
    'is_limit_locked',
    'is_frozen',
    'card_theme',
    'updated_at',
    'locked_amount',
    'due_date',
    'min_payment',
    'apr',
    'last_payment_date',
  ],
  'cash_accounts': <String>[
    'id',
    'user_email',
    'name',
    'balance',
    'updated_at',
  ],
  'transactions': <String>[
    'id',
    'user_email',
    'type',
    'title',
    'amount',
    'charge',
    'transfer_charge',
    'date',
    'category',
    'account_id',
    'account_type',
    'target_account_id',
    'target_account_type',
    'reference_id',
    'updated_at',
  ],
  'debts': <String>[
    'id',
    'user_email',
    'debt_source',
    'total_amount',
    'remaining_amount',
    'due_date',
    'notes',
    'payments',
    'account_id',
    'account_type',
    'account_name',
    'updated_at',
  ],
  'incomes': <String>[
    'id',
    'user_email',
    'amount',
    'date',
    'source',
    'category',
    'target_account_id',
    'target_type',
    'updated_at',
  ],
  'expenses': <String>[
    'id',
    'user_email',
    'title',
    'description',
    'amount',
    'date',
    'category',
    'payment_method_id',
    'payment_method_type',
    'updated_at',
  ],
  'notifications': <String>[
    'id',
    'user_email',
    'type',
    'message',
    'date',
    'read',
    'updated_at',
  ],
  'subscriptions': <String>[
    'id',
    'user_email',
    'name',
    'amount',
    'billing_cycle',
    'due_date',
    'category',
    'status',
    'payment_method_id',
    'payment_method_type',
    'last_paid_date',
    'updated_at',
  ],
  'loans_given': <String>[
    'id',
    'user_email',
    'borrower_name',
    'total_amount',
    'remaining_amount',
    'date_given',
    'source_account_id',
    'source_account_type',
    'source_account_name',
    'status',
    'notes',
    'settlements',
    'updated_at',
  ],
  'spending_envelopes': <String>[
    'id',
    'user_email',
    'category',
    'limit',
    'spent',
    'icon',
    'sub_breakdown',
    'updated_at',
  ],
  'credit_card_installments': <String>[
    'id',
    'user_email',
    'card_id',
    'purchase_id',
    'original_amount',
    'tenure_months',
    'processing_fee',
    'monthly_payment',
    'start_date',
    'status',
    'next_payment_date',
    'payments_made',
    'updated_at',
  ],
  'credit_card_installment_payments': <String>[
    'id',
    'installment_id',
    'payment_number',
    'amount_due',
    'amount_paid',
    'due_date',
    'paid_date',
    'status',
    'updated_at',
  ],
};

/// `src/supabase.ts:339`. An unknown table yields the empty list, which makes
/// `mapObjectToColumns` produce a record containing nothing — the web behaves the
/// same way, and the sync path relies on it for "table not in the contract".
List<String> getSchemaColumns(String tableName) {
  return List<String>.of(schemaColumns[tableName] ?? const <String>[]);
}

/// The tables the push payload writes, in the order `syncStateToSupabase` maps
/// them (`src/supabase.ts:562-759`). `ledger_states` is the snapshot and is not
/// part of the relational fan-out; `credit_card_installment_payments` is the one
/// relational table with no owner column.
const List<String> syncTableOrder = <String>[
  'spending_envelopes',
  'bank_cards',
  'cash_accounts',
  'transactions',
  'debts',
  'incomes',
  'expenses',
  'notifications',
  'subscriptions',
  'loans_given',
  'credit_card_installments',
  'credit_card_installment_payments',
];
