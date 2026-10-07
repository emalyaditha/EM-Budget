/// The typed shape of everything the app keeps in state, generated field-for-field
/// from `src/types.ts`. Line references there are the authority; this file adds no
/// field and drops none.
///
/// Three deliberate choices, each argued in `parity/DATA_SPEC.md`:
/// - Money is `num`, never `double`. The web holds JavaScript floats in state and
///   converts to integer cents only at `toMinorUnits` (`INVENTORY.md` §5.8).
/// - String unions are `String` plus a declared const list, not Dart `enum`s. The
///   web's category lists are hand-synced across four places (`§5.11`) and carry
///   values with spaces and ampersands; an enum would silently reject a stored
///   value the web accepts, which is a behaviour change.
/// - `toJson()` omits null. That matches `JSON.stringify` on an `undefined`
///   property; it does **not** match a property the web holds as literal `null`,
///   and that asymmetry is listed as a known normalisation, not hidden.
library;

import 'json_reader.dart';

/// Base for every state entity: the map `mapObjectToColumns` auto-fills from
/// (`src/supabase.ts:407-428` looks a column up by exact name, then camel, then
/// snake, all against this map).
abstract class StateEntity {
  const StateEntity();

  /// The state-JSON view — camelCase keys, as `ledger_states.state` holds them.
  Map<String, Object?> toJson();

  /// The property view the write path reads. Identical to [toJson] by design:
  /// the web passes the same object to both.
  Map<String, Object?> get stateFields => toJson();
}

/// Drops keys whose value is null, i.e. the properties JavaScript would not have
/// serialised.
Map<String, Object?> jsonWithoutNulls(Map<String, Object?> source) {
  return Map<String, Object?>.of(source)
    ..removeWhere((String _, Object? v) => v == null);
}

// ---------------------------------------------------------------------------
// Category unions — `src/types.ts:1-14`, `:26`, `:29-30`, `:37`, `:80`, `:108`,
// `:124`, `:134-135`, `:142`, `:154`, `:166`, `:186`, `:200`, `:203`, `:232`,
// `:236`, `:249`.
// ---------------------------------------------------------------------------

/// `CategoryIncome` (`src/types.ts:1`), in declaration order.
const List<String> categoryIncomes = <String>[
  'Salary',
  'Freelance',
  'Business',
  'Bonus',
  'Commission',
  'Loan Settle',
  'Other',
];

/// `CategoryExpense` (`src/types.ts:2-14`), in declaration order.
const List<String> categoryExpenses = <String>[
  'Food',
  'Transport',
  'Shopping',
  'Utilities',
  'Rent',
  'Entertainment',
  'Medical',
  'Education',
  'Insurance',
  'Loan',
  'Bank Charges & Interest',
  'Other',
];

/// `Transaction['type']` (`src/types.ts:134-135`).
const List<String> transactionTypes = <String>[
  'income',
  'expense',
  'debt_payment',
  'deposit',
  'withdrawal',
  'transfer',
  'credit_card_charge',
  'financing',
];

/// `AccountType` — the `'cash' | 'card'` pair repeated across eight fields.
const List<String> accountTypes = <String>['cash', 'card'];

// ---------------------------------------------------------------------------
// Accounts and cards
// ---------------------------------------------------------------------------

/// `CashAccount` (`src/types.ts:16-20`).
final class CashAccount extends StateEntity {
  const CashAccount({
    required this.id,
    required this.name,
    required this.balance,
    this.updatedAt,
  });

  final String id;
  final String name;
  final num balance;

  /// Not in `src/types.ts:16-20`, but `mapDatabaseResultToState`
  /// (`src/supabase.ts:902-906`) writes both spellings onto **every** pulled row
  /// and `cash_accounts.updated_at` is `not null`
  /// (`20260725000000_init.sql:66`). Dropping it would re-stamp on every re-push.
  final String? updatedAt;

  factory CashAccount.fromJson(Map<String, Object?> json) => CashAccount(
    id: readString(json, 'id'),
    name: readString(json, 'name'),
    balance: readNum(json, 'balance'),
    updatedAt: readUpdatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'name': name,
    'balance': balance,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
  });
}

/// `Charge` (`src/types.ts:22-31`) — a credit-card charge, inline in a card.
final class Charge extends StateEntity {
  const Charge({
    required this.id,
    required this.name,
    required this.amount,
    required this.type,
    required this.appliedDate,
    this.isRecurring,
    this.recurringInterval,
    this.description,
  });

  final String id;
  final String name;
  final num amount;

  /// `Interest Charge | Late Payment Fee | Over-Limit Fee | Annual Fee | Custom Charge`
  final String type;
  final String appliedDate;
  final bool? isRecurring;
  final String? recurringInterval;
  final String? description;

  factory Charge.fromJson(Map<String, Object?> json) => Charge(
    id: readString(json, 'id'),
    name: readString(json, 'name'),
    amount: readNum(json, 'amount'),
    type: readString(json, 'type'),
    appliedDate: readString(json, 'appliedDate'),
    isRecurring: readBoolOpt(json, 'isRecurring'),
    recurringInterval: readStringOpt(json, 'recurringInterval'),
    description: readStringOpt(json, 'description'),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'name': name,
    'amount': amount,
    'type': type,
    'appliedDate': appliedDate,
    'isRecurring': isRecurring,
    'recurringInterval': recurringInterval,
    'description': description,
  });
}

/// `BankCard` (`src/types.ts:33-53`).
///
/// `allowNegativeBalance` and `statementCloseDate` have **no** relational column
/// and no entry in `SCHEMA_COLUMNS.bank_cards`: they exist only inside the JSON
/// snapshot. Recorded in `parity/BUGS_FOUND.md` as part of B-20's drift set; they
/// are ported because the state object holds them.
final class BankCard extends StateEntity {
  const BankCard({
    required this.id,
    required this.cardName,
    required this.bankName,
    required this.cardType,
    required this.currentBalance,
    this.limit,
    this.isLimitLocked,
    this.cardNumber,
    this.isCanceled,
    this.cardTheme,
    this.isFrozen,
    this.allowNegativeBalance,
    this.charges,
    this.lockedAmount,
    this.dueDate,
    this.minPayment,
    this.apr,
    this.lastPaymentDate,
    this.statementCloseDate,
    this.updatedAt,
  });

  final String id;
  final String cardName;
  final String bankName;

  /// `Debit | Credit`
  final String cardType;
  final num currentBalance;
  final num? limit;
  final bool? isLimitLocked;
  final String? cardNumber;
  final bool? isCanceled;
  final String? cardTheme;
  final bool? isFrozen;
  final bool? allowNegativeBalance;
  final List<Charge>? charges;
  final num? lockedAmount;
  final String? dueDate;
  final num? minPayment;
  final num? apr;
  final String? lastPaymentDate;
  final String? statementCloseDate;

  /// Not in `src/types.ts:33-53`; see [CashAccount.updatedAt] for why the pulled
  /// row always carries it (`20260725000000_init.sql:81`).
  final String? updatedAt;

  factory BankCard.fromJson(Map<String, Object?> json) => BankCard(
    id: readString(json, 'id'),
    cardName: readString(json, 'cardName'),
    bankName: readString(json, 'bankName'),
    cardType: readString(json, 'cardType'),
    currentBalance: readNum(json, 'currentBalance'),
    limit: readNumOpt(json, 'limit'),
    isLimitLocked: readBoolOpt(json, 'isLimitLocked'),
    cardNumber: readStringOpt(json, 'cardNumber'),
    isCanceled:
        readBoolOpt(json, 'isCanceled') ?? readBoolOpt(json, 'isCancelled'),
    cardTheme: readStringOpt(json, 'cardTheme'),
    isFrozen: readBoolOpt(json, 'isFrozen'),
    allowNegativeBalance: readBoolOpt(json, 'allowNegativeBalance'),
    charges: json.containsKey('charges')
        ? readList<Charge>(json, 'charges', Charge.fromJson)
        : null,
    lockedAmount: readNumOpt(json, 'lockedAmount'),
    dueDate: readStringOpt(json, 'dueDate'),
    minPayment: readNumOpt(json, 'minPayment'),
    apr: readNumOpt(json, 'apr'),
    lastPaymentDate: readStringOpt(json, 'lastPaymentDate'),
    statementCloseDate: readStringOpt(json, 'statementCloseDate'),
    updatedAt: _timestampOf(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'cardName': cardName,
    'bankName': bankName,
    'cardType': cardType,
    'currentBalance': currentBalance,
    'limit': limit,
    'isLimitLocked': isLimitLocked,
    'cardNumber': cardNumber,
    'isCanceled': isCanceled,
    'cardTheme': cardTheme,
    'isFrozen': isFrozen,
    'allowNegativeBalance': allowNegativeBalance,
    'charges': charges?.map((Charge c) => c.toJson()).toList(),
    'lockedAmount': lockedAmount,
    'dueDate': dueDate,
    'minPayment': minPayment,
    'apr': apr,
    'lastPaymentDate': lastPaymentDate,
    'statementCloseDate': statementCloseDate,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
  });
}

/// `CreditCard` (`src/types.ts:55-62`). Declared in the types but not in
/// `SCHEMA_COLUMNS` and not in the sync fan-out — see `parity/DATA_SPEC.md`.
final class CreditCard extends StateEntity {
  const CreditCard({
    required this.id,
    required this.name,
    required this.balance,
    required this.limit,
    required this.dueDate,
    required this.minPayment,
  });

  final String id;
  final String name;

  /// The amount owed (liability).
  final num balance;
  final num limit;
  final String dueDate;
  final num minPayment;

  factory CreditCard.fromJson(Map<String, Object?> json) => CreditCard(
    id: readString(json, 'id'),
    name: readString(json, 'name'),
    balance: readNum(json, 'balance'),
    limit: readNum(json, 'limit'),
    dueDate: readString(json, 'dueDate'),
    minPayment: readNum(json, 'minPayment'),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'name': name,
    'balance': balance,
    'limit': limit,
    'dueDate': dueDate,
    'minPayment': minPayment,
  });
}

/// `CreditCardPurchase` (`src/types.ts:64-71`). Same status as [CreditCard]:
/// typed, in state, with no table in the sync contract.
final class CreditCardPurchase extends StateEntity {
  const CreditCardPurchase({
    required this.id,
    required this.cardId,
    required this.amount,
    required this.description,
    required this.merchant,
    required this.date,
  });

  final String id;
  final String cardId;
  final num amount;
  final String description;
  final String merchant;
  final String date;

  factory CreditCardPurchase.fromJson(Map<String, Object?> json) =>
      CreditCardPurchase(
        id: readString(json, 'id'),
        cardId: readString(json, 'cardId'),
        amount: readNum(json, 'amount'),
        description: readString(json, 'description'),
        merchant: readString(json, 'merchant'),
        date: readString(json, 'date'),
      );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'cardId': cardId,
    'amount': amount,
    'description': description,
    'merchant': merchant,
    'date': date,
  });
}

/// `UserProfile` (`src/types.ts:263-267`, not exported by the web).
final class UserProfile {
  const UserProfile({required this.name, required this.email, this.avatarUrl});

  final String name;
  final String email;
  final String? avatarUrl;

  factory UserProfile.fromJson(Map<String, Object?> json) => UserProfile(
    name: readString(json, 'name'),
    email: readString(json, 'email'),
    avatarUrl: readStringOpt(json, 'avatarUrl'),
  );

  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'name': name,
    'email': email,
    'avatarUrl': avatarUrl,
  });
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

/// `Transaction` (`src/types.ts:132-150`).
final class Transaction extends StateEntity {
  const Transaction({
    required this.id,
    required this.type,
    required this.title,
    required this.amount,
    required this.date,
    required this.category,
    this.charge,
    this.accountId,
    this.accountType,
    this.targetAccountId,
    this.targetAccountType,
    this.referenceId,
    this.transferCharge,
    this.updatedAt,
    this.createdAt,
  });

  final String id;

  /// One of [transactionTypes].
  final String type;
  final String title;
  final num amount;

  /// Optional transfer fee / charge.
  final num? charge;
  final String date;
  final String category;
  final String? accountId;
  final String? accountType;
  final String? targetAccountId;
  final String? targetAccountType;

  /// ID of income, expense or debt payment.
  final String? referenceId;

  /// Not in `src/types.ts`, but read by the sync path through a cast
  /// (`src/supabase.ts:629`) and coerced on the way back
  /// (`src/supabase.ts:867`), so it is part of the real contract.
  final num? transferCharge;

  /// The web declares both `updated_at` and `updatedAt`; one Dart field carries
  /// the value and [toJson] writes both spellings, which is what
  /// `mapDatabaseResultToState` produces for any pulled row (`src/supabase.ts:902-906`).
  final String? updatedAt;
  final String? createdAt;

  factory Transaction.fromJson(Map<String, Object?> json) => Transaction(
    id: readString(json, 'id'),
    type: readString(json, 'type'),
    title: readString(json, 'title'),
    amount: readNum(json, 'amount'),
    date: readString(json, 'date'),
    category: readString(json, 'category'),
    charge: readNumOpt(json, 'charge'),
    accountId: readStringOpt(json, 'accountId'),
    accountType: readStringOpt(json, 'accountType'),
    targetAccountId: readStringOpt(json, 'targetAccountId'),
    targetAccountType: readStringOpt(json, 'targetAccountType'),
    referenceId: readStringOpt(json, 'referenceId'),
    transferCharge: readNumOpt(json, 'transferCharge'),
    updatedAt: _timestampOf(json),
    createdAt: readCreatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'type': type,
    'title': title,
    'amount': amount,
    'charge': charge,
    'date': date,
    'category': category,
    'accountId': accountId,
    'accountType': accountType,
    'targetAccountId': targetAccountId,
    'targetAccountType': targetAccountType,
    'referenceId': referenceId,
    'transferCharge': transferCharge,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
    'created_at': createdAt,
    'createdAt': createdAt,
  });
}

/// `updated_at || updatedAt`. A pulled row has both spellings written by
/// `mapDatabaseResultToState` (`src/supabase.ts:902-906`), which is why reading
/// the pair here is enough: the four-way hunt has already happened upstream.
String? _timestampOf(Map<String, Object?> json) => readUpdatedAt(json);

/// `Income` (`src/types.ts:73-85`).
final class Income extends StateEntity {
  const Income({
    required this.id,
    required this.amount,
    required this.date,
    required this.source,
    required this.category,
    required this.targetAccountId,
    required this.targetType,
    this.updatedAt,
    this.createdAt,
  });

  final String id;
  final num amount;
  final String date;
  final String source;

  /// One of [categoryIncomes].
  final String category;

  /// ID of either a CashAccount or a BankCard.
  final String targetAccountId;
  final String targetType;
  final String? updatedAt;
  final String? createdAt;

  factory Income.fromJson(Map<String, Object?> json) => Income(
    id: readString(json, 'id'),
    amount: readNum(json, 'amount'),
    date: readString(json, 'date'),
    source: readString(json, 'source'),
    category: readString(json, 'category'),
    targetAccountId: readString(json, 'targetAccountId'),
    targetType: readString(json, 'targetType'),
    updatedAt: _timestampOf(json),
    createdAt: readCreatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'amount': amount,
    'date': date,
    'source': source,
    'category': category,
    'targetAccountId': targetAccountId,
    'targetType': targetType,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
    'created_at': createdAt,
    'createdAt': createdAt,
  });
}

/// `Expense` (`src/types.ts:87-100`).
final class Expense extends StateEntity {
  const Expense({
    required this.id,
    required this.title,
    required this.description,
    required this.amount,
    required this.date,
    required this.category,
    required this.paymentMethodId,
    required this.paymentMethodType,
    this.updatedAt,
    this.createdAt,
  });

  final String id;
  final String title;
  final String description;
  final num amount;
  final String date;

  /// One of [categoryExpenses].
  final String category;

  /// ID of a CashAccount or BankCard.
  final String paymentMethodId;
  final String paymentMethodType;
  final String? updatedAt;
  final String? createdAt;

  factory Expense.fromJson(Map<String, Object?> json) => Expense(
    id: readString(json, 'id'),
    title: readString(json, 'title'),
    description: readString(json, 'description'),
    amount: readNum(json, 'amount'),
    date: readString(json, 'date'),
    category: readString(json, 'category'),
    paymentMethodId: readString(json, 'paymentMethodId'),
    paymentMethodType: readString(json, 'paymentMethodType'),
    updatedAt: _timestampOf(json),
    createdAt: readCreatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'title': title,
    'description': description,
    'amount': amount,
    'date': date,
    'category': category,
    'paymentMethodId': paymentMethodId,
    'paymentMethodType': paymentMethodType,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
    'created_at': createdAt,
    'createdAt': createdAt,
  });
}

/// `AppNotification` (`src/types.ts:152-158`).
final class AppNotification extends StateEntity {
  const AppNotification({
    required this.id,
    required this.type,
    required this.message,
    required this.date,
    required this.read,
    this.updatedAt,
  });

  final String id;

  /// `reminder | alert | system`
  final String type;
  final String message;
  final String date;
  final bool read;

  /// Not in `src/types.ts:152-158`. Without it the stamp hunt at
  /// `src/supabase.ts:378` would fall through to `date` and push the reminder's
  /// own day as the row's `updated_at`; a pulled row always carries the real one.
  final String? updatedAt;

  factory AppNotification.fromJson(Map<String, Object?> json) =>
      AppNotification(
        id: readString(json, 'id'),
        type: readString(json, 'type'),
        message: readString(json, 'message'),
        date: readString(json, 'date'),
        read: readBool(json, 'read'),
        updatedAt: _timestampOf(json),
      );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'type': type,
    'message': message,
    'date': date,
    'read': read,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
  });
}
