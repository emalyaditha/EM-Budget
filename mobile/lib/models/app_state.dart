import 'entities.dart';
import 'entities_ledger.dart';
import 'json_reader.dart';

/// `AppState` (`src/types.ts:269-289`) — the whole ledger, exactly as it is held
/// in React state, mirrored into `localStorage`, and serialised into
/// `ledger_states.state`.
///
/// The field list is closed: the web's `JSON.stringify(state)` writes these keys
/// and no others, and `syncStateToSupabase` reads `state.<collection>` for each
/// of the twelve relational fan-outs from the same object.
final class AppState extends StateEntity {
  const AppState({
    required this.userProfile,
    required this.cashAccounts,
    required this.cards,
    required this.creditCards,
    required this.creditCardPurchases,
    required this.creditCardInstallments,
    required this.creditCardInstallmentPayments,
    required this.incomes,
    required this.expenses,
    required this.debts,
    required this.transactions,
    required this.notifications,
    required this.subscriptions,
    required this.loansGiven,
    required this.budgets,
    required this.savingsGoals,
    required this.pinCode,
    required this.pinEnabled,
    required this.currency,
  });

  final UserProfile userProfile;
  final List<CashAccount> cashAccounts;
  final List<BankCard> cards;
  final List<CreditCard> creditCards;
  final List<CreditCardPurchase> creditCardPurchases;
  final List<CreditCardInstallment> creditCardInstallments;
  final List<CreditCardInstallmentPayment> creditCardInstallmentPayments;
  final List<Income> incomes;
  final List<Expense> expenses;
  final List<Debt> debts;
  final List<Transaction> transactions;
  final List<AppNotification> notifications;
  final List<Subscription> subscriptions;
  final List<LoanGiven> loansGiven;

  /// Optional in the type (`src/types.ts:284-285`) but defaulted to `[]` by both
  /// the seed and the storage read, so it is non-null here and the web's
  /// `state.budgets || []` guards become no-ops.
  final List<Budget> budgets;
  final List<SavingsGoal> savingsGoals;

  /// Vestigial: nothing in the app writes a non-empty value (the real PIN is a
  /// bcrypt hash in `app_lock_credentials`), yet the push blanks it
  /// (`src/supabase.ts:761`) and the pull restores it (`src/supabase.ts:1150`).
  /// See B-21 in `parity/BUGS_FOUND.md`.
  final String pinCode;
  final bool pinEnabled;
  final String currency;

  /// `createDefaultAppState()` (`src/initialData.ts:30-52`).
  factory AppState.defaultValue() => AppState(
    userProfile: const UserProfile(name: 'User', email: 'user@example.com'),
    cashAccounts: const <CashAccount>[],
    cards: const <BankCard>[],
    creditCards: const <CreditCard>[],
    creditCardPurchases: const <CreditCardPurchase>[],
    creditCardInstallments: const <CreditCardInstallment>[],
    creditCardInstallmentPayments: const <CreditCardInstallmentPayment>[],
    incomes: const <Income>[],
    expenses: const <Expense>[],
    debts: const <Debt>[],
    transactions: const <Transaction>[],
    notifications: const <AppNotification>[],
    subscriptions: const <Subscription>[],
    loansGiven: const <LoanGiven>[],
    budgets: const <Budget>[],
    savingsGoals: const <SavingsGoal>[],
    pinCode: '',
    pinEnabled: false,
    currency: 'Rs.',
  );

  /// The "ensure vital nodes exist" pass of `loadStateFromStorage`
  /// (`src/utils.ts:277-295`): `{...defaultState, ...parsed}` and then, for every
  /// collection, `parsed.x || default.x || []`. A `null` collection therefore
  /// falls back to the default rather than throwing, and a collection the mirror
  /// does not have at all is filled from the default.
  ///
  /// Scalar fields take the stored value verbatim — including `currency`, which
  /// `mergeCloudIntoLocal` later overrides with the local copy
  /// (`src/App.tsx:213-250`, recorded in `INVENTORY.md` §6).
  factory AppState.fromJson(Map<String, Object?> json) {
    return AppState(
      userProfile: json['userProfile'] is Map<String, Object?>
          ? UserProfile.fromJson(json['userProfile']! as Map<String, Object?>)
          : const UserProfile(name: 'User', email: 'user@example.com'),
      cashAccounts: readList<CashAccount>(
        json,
        'cashAccounts',
        CashAccount.fromJson,
      ),
      cards: readList<BankCard>(json, 'cards', BankCard.fromJson),
      creditCards: readList<CreditCard>(
        json,
        'creditCards',
        CreditCard.fromJson,
      ),
      creditCardPurchases: readList<CreditCardPurchase>(
        json,
        'creditCardPurchases',
        CreditCardPurchase.fromJson,
      ),
      creditCardInstallments: readList<CreditCardInstallment>(
        json,
        'creditCardInstallments',
        CreditCardInstallment.fromJson,
      ),
      creditCardInstallmentPayments: readList<CreditCardInstallmentPayment>(
        json,
        'creditCardInstallmentPayments',
        CreditCardInstallmentPayment.fromJson,
      ),
      incomes: readList<Income>(json, 'incomes', Income.fromJson),
      expenses: readList<Expense>(json, 'expenses', Expense.fromJson),
      debts: readList<Debt>(json, 'debts', Debt.fromJson),
      transactions: readList<Transaction>(
        json,
        'transactions',
        Transaction.fromJson,
      ),
      notifications: readList<AppNotification>(
        json,
        'notifications',
        AppNotification.fromJson,
      ),
      subscriptions: readList<Subscription>(
        json,
        'subscriptions',
        Subscription.fromJson,
      ),
      loansGiven: readList<LoanGiven>(json, 'loansGiven', LoanGiven.fromJson),
      budgets: readList<Budget>(json, 'budgets', Budget.fromJson),
      savingsGoals: readList<SavingsGoal>(
        json,
        'savingsGoals',
        SavingsGoal.fromJson,
      ),
      // Scalars follow `{...defaultState, ...parsed}`: a stored value wins, an
      // absent one takes the seed. `readString` would have returned `''` for an
      // absent currency, which is not what the web does.
      pinCode: readStringOpt(json, 'pinCode') ?? '',
      pinEnabled: readBoolOpt(json, 'pinEnabled') ?? false,
      currency: readStringOpt(json, 'currency') ?? 'Rs.',
    );
  }

  @override
  Map<String, Object?> toJson() => <String, Object?>{
    'userProfile': userProfile.toJson(),
    'cashAccounts': cashAccounts.map((CashAccount e) => e.toJson()).toList(),
    'cards': cards.map((BankCard e) => e.toJson()).toList(),
    'creditCards': creditCards.map((CreditCard e) => e.toJson()).toList(),
    'creditCardPurchases': creditCardPurchases
        .map((CreditCardPurchase e) => e.toJson())
        .toList(),
    'creditCardInstallments': creditCardInstallments
        .map((CreditCardInstallment e) => e.toJson())
        .toList(),
    'creditCardInstallmentPayments': creditCardInstallmentPayments
        .map((CreditCardInstallmentPayment e) => e.toJson())
        .toList(),
    'incomes': incomes.map((Income e) => e.toJson()).toList(),
    'expenses': expenses.map((Expense e) => e.toJson()).toList(),
    'debts': debts.map((Debt e) => e.toJson()).toList(),
    'transactions': transactions.map((Transaction e) => e.toJson()).toList(),
    'notifications': notifications
        .map((AppNotification e) => e.toJson())
        .toList(),
    'subscriptions': subscriptions.map((Subscription e) => e.toJson()).toList(),
    'loansGiven': loansGiven.map((LoanGiven e) => e.toJson()).toList(),
    'budgets': budgets.map((Budget e) => e.toJson()).toList(),
    'savingsGoals': savingsGoals.map((SavingsGoal e) => e.toJson()).toList(),
    'pinCode': pinCode,
    'pinEnabled': pinEnabled,
    'currency': currency,
  };

  /// `{ ...state, pinCode: '' }` — the only sanitisation the push performs
  /// (`src/supabase.ts:761`). It is what the cloud snapshot stores, so a phone
  /// that forgot this step would write a live PIN where the web writes an empty
  /// string.
  Map<String, Object?> toJsonForPush() {
    final Map<String, Object?> copy = toJson();
    copy['pinCode'] = '';
    return copy;
  }
}
