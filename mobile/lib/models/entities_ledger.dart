/// Debt, loan, subscription, budget and installment entities. Second half of the
/// field-for-field port of `src/types.ts`; the shared rules are documented on the
/// file that opens it (`entities.dart`).
library;

import 'entities.dart';
import 'json_reader.dart';

/// `DebtPayment` (`src/types.ts:102-113`, `interface` — not exported by the web).
///
/// It has no table of its own: debts carry their payments as a `jsonb` column
/// (`payments` in `SCHEMA_COLUMNS.debts`), which is why `mapObjectToColumns` is
/// handed `payments: debt.payments || []` as a value rather than a fan-out.
final class DebtPayment extends StateEntity {
  const DebtPayment({
    required this.id,
    required this.debtId,
    required this.amount,
    required this.date,
    required this.paidFromId,
    required this.paidFromType,
    this.updatedAt,
    this.createdAt,
  });

  final String id;
  final String debtId;
  final num amount;
  final String date;
  final String paidFromId;
  final String paidFromType;
  final String? updatedAt;
  final String? createdAt;

  factory DebtPayment.fromJson(Map<String, Object?> json) => DebtPayment(
    id: readString(json, 'id'),
    debtId: readString(json, 'debtId'),
    amount: readNum(json, 'amount'),
    date: readString(json, 'date'),
    paidFromId: readString(json, 'paidFromId'),
    paidFromType: readString(json, 'paidFromType'),
    updatedAt: readUpdatedAt(json),
    createdAt: readCreatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'debtId': debtId,
    'amount': amount,
    'date': date,
    'paidFromId': paidFromId,
    'paidFromType': paidFromType,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
    'created_at': createdAt,
    'createdAt': createdAt,
  });
}

/// One entry of `Debt.increaseHistory` (`src/types.ts:127`).
final class DebtIncrease {
  const DebtIncrease({
    required this.id,
    required this.amount,
    required this.date,
    this.accountName,
  });

  final String id;
  final num amount;
  final String date;
  final String? accountName;

  factory DebtIncrease.fromJson(Map<String, Object?> json) => DebtIncrease(
    id: readString(json, 'id'),
    amount: readNum(json, 'amount'),
    date: readString(json, 'date'),
    accountName: readStringOpt(json, 'accountName'),
  );

  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'amount': amount,
    'date': date,
    'accountName': accountName,
  });
}

/// `Debt` (`src/types.ts:115-130`).
final class Debt extends StateEntity {
  const Debt({
    required this.id,
    required this.debtSource,
    required this.totalAmount,
    required this.remainingAmount,
    required this.dueDate,
    required this.notes,
    required this.payments,
    this.accountId,
    this.accountType,
    this.accountName,
    this.status,
    this.increaseHistory,
    this.updatedAt,
  });

  final String id;
  final String debtSource;
  final num totalAmount;
  final num remainingAmount;
  final String dueDate;
  final String notes;
  final List<DebtPayment> payments;
  final String? accountId;
  final String? accountType;
  final String? accountName;

  /// `Active | Closed | Fully Repaid`
  final String? status;
  final List<DebtIncrease>? increaseHistory;
  final String? updatedAt;

  factory Debt.fromJson(Map<String, Object?> json) => Debt(
    id: readString(json, 'id'),
    debtSource: readString(json, 'debtSource'),
    totalAmount: readNum(json, 'totalAmount'),
    remainingAmount: readNum(json, 'remainingAmount'),
    dueDate: readString(json, 'dueDate'),
    notes: readString(json, 'notes'),
    payments: readList<DebtPayment>(json, 'payments', DebtPayment.fromJson),
    accountId: readStringOpt(json, 'accountId'),
    accountType: readStringOpt(json, 'accountType'),
    accountName: readStringOpt(json, 'accountName'),
    status: readStringOpt(json, 'status'),
    increaseHistory: json.containsKey('increaseHistory')
        ? readList<DebtIncrease>(json, 'increaseHistory', DebtIncrease.fromJson)
        : null,
    updatedAt: readUpdatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'debtSource': debtSource,
    'totalAmount': totalAmount,
    'remainingAmount': remainingAmount,
    'dueDate': dueDate,
    'notes': notes,
    'payments': payments.map((DebtPayment p) => p.toJson()).toList(),
    'accountId': accountId,
    'accountType': accountType,
    'accountName': accountName,
    'status': status,
    'increaseHistory': increaseHistory
        ?.map((DebtIncrease h) => h.toJson())
        .toList(),
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
  });
}

/// `LoanSettlement` (`src/types.ts:160-175`).
final class LoanSettlement extends StateEntity {
  const LoanSettlement({
    required this.id,
    required this.loanId,
    required this.amount,
    required this.date,
    required this.receivedInId,
    required this.receivedInType,
    required this.receivedInName,
    this.bankCharge,
    this.chargeExpenseId,
    this.updatedAt,
    this.createdAt,
  });

  final String id;
  final String loanId;
  final num amount;
  final String date;
  final String receivedInId;
  final String receivedInType;
  final String receivedInName;

  /// "The fee was netted out of the credit, so reversing a settlement needs it."
  final num? bankCharge;
  final String? chargeExpenseId;
  final String? updatedAt;
  final String? createdAt;

  factory LoanSettlement.fromJson(Map<String, Object?> json) => LoanSettlement(
    id: readString(json, 'id'),
    loanId: readString(json, 'loanId'),
    amount: readNum(json, 'amount'),
    date: readString(json, 'date'),
    receivedInId: readString(json, 'receivedInId'),
    receivedInType: readString(json, 'receivedInType'),
    receivedInName: readString(json, 'receivedInName'),
    bankCharge: readNumOpt(json, 'bankCharge'),
    chargeExpenseId: readStringOpt(json, 'chargeExpenseId'),
    updatedAt: readUpdatedAt(json),
    createdAt: readCreatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'loanId': loanId,
    'amount': amount,
    'date': date,
    'receivedInId': receivedInId,
    'receivedInType': receivedInType,
    'receivedInName': receivedInName,
    'bankCharge': bankCharge,
    'chargeExpenseId': chargeExpenseId,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
    'created_at': createdAt,
    'createdAt': createdAt,
  });
}

/// `LoanGiven` (`src/types.ts:177-194`).
final class LoanGiven extends StateEntity {
  const LoanGiven({
    required this.id,
    required this.borrowerName,
    required this.totalAmount,
    required this.remainingAmount,
    required this.dateGiven,
    required this.sourceAccountId,
    required this.sourceAccountType,
    required this.sourceAccountName,
    required this.status,
    required this.notes,
    required this.settlements,
    this.chargeExpenseId,
    this.updatedAt,
    this.createdAt,
  });

  final String id;
  final String borrowerName;
  final num totalAmount;
  final num remainingAmount;
  final String dateGiven;
  final String sourceAccountId;
  final String sourceAccountType;
  final String sourceAccountName;

  /// `Active | Partially Settled | Settled`
  final String status;
  final String notes;
  final List<LoanSettlement> settlements;
  final String? chargeExpenseId;
  final String? updatedAt;
  final String? createdAt;

  factory LoanGiven.fromJson(Map<String, Object?> json) => LoanGiven(
    id: readString(json, 'id'),
    borrowerName: readString(json, 'borrowerName'),
    totalAmount: readNum(json, 'totalAmount'),
    remainingAmount: readNum(json, 'remainingAmount'),
    dateGiven: readString(json, 'dateGiven'),
    sourceAccountId: readString(json, 'sourceAccountId'),
    sourceAccountType: readString(json, 'sourceAccountType'),
    sourceAccountName: readString(json, 'sourceAccountName'),
    status: readString(json, 'status'),
    notes: readString(json, 'notes'),
    settlements: readList<LoanSettlement>(
      json,
      'settlements',
      LoanSettlement.fromJson,
    ),
    chargeExpenseId: readStringOpt(json, 'chargeExpenseId'),
    updatedAt: readUpdatedAt(json),
    createdAt: readCreatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'borrowerName': borrowerName,
    'totalAmount': totalAmount,
    'remainingAmount': remainingAmount,
    'dateGiven': dateGiven,
    'sourceAccountId': sourceAccountId,
    'sourceAccountType': sourceAccountType,
    'sourceAccountName': sourceAccountName,
    'status': status,
    'notes': notes,
    'settlements': settlements.map((LoanSettlement s) => s.toJson()).toList(),
    'chargeExpenseId': chargeExpenseId,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
    'created_at': createdAt,
    'createdAt': createdAt,
  });
}

/// `Subscription` (`src/types.ts:196-208`).
///
/// [instanceType] is the field B-20 is about: the state object holds it, the UI
/// renders it, the push mapping names it at `src/supabase.ts:709` — and the
/// column allow-list does not contain it, so the web never writes the column.
final class Subscription extends StateEntity {
  const Subscription({
    required this.id,
    required this.name,
    required this.amount,
    required this.billingCycle,
    required this.dueDate,
    required this.category,
    required this.status,
    this.paymentMethodId,
    this.paymentMethodType,
    this.lastPaidDate,
    this.instanceType,
    this.updatedAt,
  });

  final String id;
  final String name;
  final num amount;

  /// `Monthly | Yearly`
  final String billingCycle;

  /// `YYYY-MM-DD` or a standard calendar date.
  final String dueDate;

  /// One of [categoryExpenses].
  final String category;

  /// `Active | Paused | Cancelled`
  final String status;
  final String? paymentMethodId;
  final String? paymentMethodType;
  final String? lastPaidDate;
  final String? instanceType;

  /// Not in `src/types.ts:196-208`. `mapDatabaseResultToState` stamps every
  /// pulled row (`src/supabase.ts:902-906`), so a subscription the phone loaded
  /// from the cloud carries its real `updated_at` and must re-push it unchanged.
  final String? updatedAt;

  factory Subscription.fromJson(Map<String, Object?> json) => Subscription(
    id: readString(json, 'id'),
    name: readString(json, 'name'),
    amount: readNum(json, 'amount'),
    billingCycle: readString(json, 'billingCycle'),
    dueDate: readString(json, 'dueDate'),
    category: readString(json, 'category'),
    status: readString(json, 'status'),
    paymentMethodId: readStringOpt(json, 'paymentMethodId'),
    paymentMethodType: readStringOpt(json, 'paymentMethodType'),
    lastPaidDate: readStringOpt(json, 'lastPaidDate'),
    instanceType: readStringOpt(json, 'instanceType'),
    updatedAt: readUpdatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'name': name,
    'amount': amount,
    'billingCycle': billingCycle,
    'dueDate': dueDate,
    'category': category,
    'status': status,
    'paymentMethodId': paymentMethodId,
    'paymentMethodType': paymentMethodType,
    'lastPaidDate': lastPaidDate,
    'instanceType': instanceType,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
  });
}

/// `Budget` (`src/types.ts:210-217`) — the `spending_envelopes` table's state name.
final class Budget extends StateEntity {
  const Budget({
    required this.id,
    required this.category,
    required this.limit,
    required this.spent,
    required this.icon,
    required this.subBreakdown,
    this.updatedAt,
  });

  final String id;

  /// One of [categoryExpenses].
  final String category;
  final num limit;
  final num spent;
  final String icon;

  /// `{ name: string; spent: number }[]` — an inline structure, kept as maps so a
  /// value the web would hold stays byte-identical through a round trip.
  final List<Map<String, Object?>> subBreakdown;

  /// Not in `src/types.ts:210-217`. `spending_envelopes.updated_at` is
  /// `not null` (`20260725000000_init.sql`), so a pulled envelope carries the
  /// stamp even though the interface does not declare it.
  final String? updatedAt;

  factory Budget.fromJson(Map<String, Object?> json) => Budget(
    id: readString(json, 'id'),
    category: readString(json, 'category'),
    limit: readNum(json, 'limit'),
    spent: readNum(json, 'spent'),
    icon: readString(json, 'icon'),
    subBreakdown: readMapList(json, 'subBreakdown'),
    updatedAt: readUpdatedAt(json),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'category': category,
    'limit': limit,
    'spent': spent,
    'icon': icon,
    'subBreakdown': subBreakdown,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
  });
}

/// `SavingsGoal` (`src/types.ts:219-225`). No table: goals live only inside the
/// JSON snapshot, which is why `syncStateToSupabase` has no `p_savings_goals`
/// parameter and why deleting a goal cannot leave a relational orphan.
final class SavingsGoal extends StateEntity {
  const SavingsGoal({
    required this.id,
    required this.name,
    required this.target,
    required this.current,
    required this.targetDate,
  });

  final String id;
  final String name;
  final num target;
  final num current;
  final String targetDate;

  factory SavingsGoal.fromJson(Map<String, Object?> json) => SavingsGoal(
    id: readString(json, 'id'),
    name: readString(json, 'name'),
    target: readNum(json, 'target'),
    current: readNum(json, 'current'),
    targetDate: readString(json, 'targetDate'),
  );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'name': name,
    'target': target,
    'current': current,
    'targetDate': targetDate,
  });
}

/// `CreditCardInstallment` (`src/types.ts:227-239`).
final class CreditCardInstallment extends StateEntity {
  const CreditCardInstallment({
    required this.id,
    required this.cardId,
    required this.purchaseId,
    required this.originalAmount,
    required this.tenureMonths,
    required this.processingFee,
    required this.monthlyPayment,
    required this.startDate,
    required this.status,
    required this.nextPaymentDate,
    required this.paymentsMade,
    this.updatedAt,
  });

  final String id;
  final String cardId;
  final String purchaseId;
  final num originalAmount;

  /// `6 | 12 | 24 | 48`. A Dart enum would reject a tenure the fee table does not
  /// know; the web's Zod schema is the place that already constrains it.
  final int tenureMonths;
  final num processingFee;
  final num monthlyPayment;
  final String startDate;

  /// `active | completed | cancelled`
  final String status;
  final String nextPaymentDate;
  final int paymentsMade;

  /// Not in `src/types.ts:227-239`; see [Subscription.updatedAt].
  final String? updatedAt;

  factory CreditCardInstallment.fromJson(Map<String, Object?> json) =>
      CreditCardInstallment(
        id: readString(json, 'id'),
        cardId: readString(json, 'cardId'),
        purchaseId: readString(json, 'purchaseId'),
        originalAmount: readNum(json, 'originalAmount'),
        tenureMonths: readNum(json, 'tenureMonths').toInt(),
        processingFee: readNum(json, 'processingFee'),
        monthlyPayment: readNum(json, 'monthlyPayment'),
        startDate: readString(json, 'startDate'),
        status: readString(json, 'status'),
        nextPaymentDate: readString(json, 'nextPaymentDate'),
        paymentsMade: readNum(json, 'paymentsMade').toInt(),
        updatedAt: readUpdatedAt(json),
      );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'cardId': cardId,
    'purchaseId': purchaseId,
    'originalAmount': originalAmount,
    'tenureMonths': tenureMonths,
    'processingFee': processingFee,
    'monthlyPayment': monthlyPayment,
    'startDate': startDate,
    'status': status,
    'nextPaymentDate': nextPaymentDate,
    'paymentsMade': paymentsMade,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
  });
}

/// `CreditCardInstallmentPayment` (`src/types.ts:241-250`).
///
/// The only synced table with **no owner column** (`SCHEMA_COLUMNS
/// .credit_card_installment_payments`, `src/supabase.ts:320-330`): RLS reaches it
/// through its installment, and `mapObjectToColumns` therefore writes no
/// `user_email` for it.
final class CreditCardInstallmentPayment extends StateEntity {
  const CreditCardInstallmentPayment({
    required this.id,
    required this.installmentId,
    required this.paymentNumber,
    required this.amountDue,
    required this.amountPaid,
    required this.dueDate,
    required this.status,
    this.paidDate,
    this.updatedAt,
  });

  final String id;
  final String installmentId;
  final int paymentNumber;
  final num amountDue;
  final num amountPaid;
  final String dueDate;
  final String? paidDate;

  /// `pending | paid | overdue`
  final String status;

  /// Not in `src/types.ts:241-250`; see [Subscription.updatedAt].
  final String? updatedAt;

  factory CreditCardInstallmentPayment.fromJson(Map<String, Object?> json) =>
      CreditCardInstallmentPayment(
        id: readString(json, 'id'),
        installmentId: readString(json, 'installmentId'),
        paymentNumber: readNum(json, 'paymentNumber').toInt(),
        amountDue: readNum(json, 'amountDue'),
        amountPaid: readNum(json, 'amountPaid'),
        dueDate: readString(json, 'dueDate'),
        paidDate: readStringOpt(json, 'paidDate'),
        status: readString(json, 'status'),
        updatedAt: readUpdatedAt(json),
      );

  @override
  Map<String, Object?> toJson() => jsonWithoutNulls(<String, Object?>{
    'id': id,
    'installmentId': installmentId,
    'paymentNumber': paymentNumber,
    'amountDue': amountDue,
    'amountPaid': amountPaid,
    'dueDate': dueDate,
    'paidDate': paidDate,
    'status': status,
    'updated_at': updatedAt,
    'updatedAt': updatedAt,
  });
}
