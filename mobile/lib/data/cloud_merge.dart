import '../models/app_state.dart';
import '../models/entities.dart';
import '../models/entities_ledger.dart';
import 'js_semantics.dart';

/// `mergeCloudIntoLocal` (`src/App.tsx:213-250`) — the boot merge, and the one place
/// the app does per-record reconciliation. `INVENTORY.md` §6 describes it as "union by
/// id, cloud wins", which is **wrong in the direction that matters** and is corrected
/// here: `union` iterates `[...local, ...cloud]` and keeps the **first** entry per id
/// (`:216-219`), so for any id present on both sides **the local copy wins**. Cloud
/// contributes only the ids the local ledger has never seen.
///
/// Three consequences that a "tidier" port would lose:
/// - an edit made while the pull was in flight survives, because the local row is the
///   one kept — that is the entire purpose of the function;
/// - `creditCards` is **not** in the union list, so `...cloud` gives it wholesale to the
///   cloud and any local-only card is dropped. Vestigial today (B-23), kept verbatim;
/// - a tombstoned id is dropped from **both** sides, not only from the cloud copy — the
///   guard at `:219` runs before the map is consulted, so a local row carrying a deleted
///   id is discarded too.
///
/// Scalars follow `{ ...local, ...cloud }` — cloud wins — with two overrides: `currency`
/// prefers the local copy (`:243`), and `userProfile` is a field-wise cloud-wins merge
/// whose `email` prefers local (`:244-248`). The phone cannot express "key present with
/// value `undefined`" separately from "key absent", which the web's spread *can* do; the
/// path that reaches this function always builds the cloud profile with the key present
/// (`supabase.ts:1111-1115`), so cloud-wins is the behaviour the web actually exhibits.
AppState mergeCloudIntoLocal(
  AppState cloud,
  AppState local, {
  Set<String> tombstones = const <String>{},
}) {
  return AppState(
    userProfile: UserProfile(
      name: cloud.userProfile.name,
      // `local.userProfile?.email || cloud.userProfile?.email` — truthiness, so an
      // empty local email falls through to the cloud one.
      email: jsTruthy(local.userProfile.email)
          ? local.userProfile.email
          : cloud.userProfile.email,
      avatarUrl: cloud.userProfile.avatarUrl,
    ),
    cashAccounts: _union(
      cloud.cashAccounts,
      local.cashAccounts,
      (CashAccount e) => e.id,
      tombstones,
    ),
    cards: _union(cloud.cards, local.cards, (BankCard e) => e.id, tombstones),
    // Not unioned — the cloud copy wins wholesale. See the doc comment.
    creditCards: cloud.creditCards,
    creditCardPurchases: _union(
      cloud.creditCardPurchases,
      local.creditCardPurchases,
      (CreditCardPurchase e) => e.id,
      tombstones,
    ),
    creditCardInstallments: _union(
      cloud.creditCardInstallments,
      local.creditCardInstallments,
      (CreditCardInstallment e) => e.id,
      tombstones,
    ),
    creditCardInstallmentPayments: _union(
      cloud.creditCardInstallmentPayments,
      local.creditCardInstallmentPayments,
      (CreditCardInstallmentPayment e) => e.id,
      tombstones,
    ),
    incomes: _union(
      cloud.incomes,
      local.incomes,
      (Income e) => e.id,
      tombstones,
    ),
    expenses: _union(
      cloud.expenses,
      local.expenses,
      (Expense e) => e.id,
      tombstones,
    ),
    debts: _union(cloud.debts, local.debts, (Debt e) => e.id, tombstones),
    transactions: _union(
      cloud.transactions,
      local.transactions,
      (Transaction e) => e.id,
      tombstones,
    ),
    notifications: _union(
      cloud.notifications,
      local.notifications,
      (AppNotification e) => e.id,
      tombstones,
    ),
    subscriptions: _union(
      cloud.subscriptions,
      local.subscriptions,
      (Subscription e) => e.id,
      tombstones,
    ),
    loansGiven: _union(
      cloud.loansGiven,
      local.loansGiven,
      (LoanGiven e) => e.id,
      tombstones,
    ),
    budgets: _union(
      cloud.budgets,
      local.budgets,
      (Budget e) => e.id,
      tombstones,
    ),
    savingsGoals: _union(
      cloud.savingsGoals,
      local.savingsGoals,
      (SavingsGoal e) => e.id,
      tombstones,
    ),
    pinCode: cloud.pinCode,
    pinEnabled: cloud.pinEnabled,
    currency: jsTruthy(local.currency) ? local.currency : cloud.currency,
  );
}

/// `union` (`:214-222`), with the id read through [idOf] because the phone's entity base
/// class does not declare one. Order is the web's: local entries first, so the
/// first-seen-wins map resolves every shared id to the local copy.
List<T> _union<T>(
  List<T> cloudArr,
  List<T> localArr,
  String Function(T item) idOf,
  Set<String> tombstones,
) {
  final Map<String, T> byId = <String, T>{};
  for (final T item in <T>[...localArr, ...cloudArr]) {
    final String id = idOf(item);
    // `item && item.id` — a row with no id is dropped whole, from either side.
    if (id.isEmpty) {
      continue;
    }
    if (tombstones.contains(id)) continue;
    byId.putIfAbsent(id, () => item);
  }
  return byId.values.toList();
}
