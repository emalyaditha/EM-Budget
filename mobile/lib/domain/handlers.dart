/// The nine `src/App.tsx` money handlers, plus the `updateState` they all go through
/// and the subscription reconciliation that `updateState` performs on every write.
///
/// **The JSON boundary.** Every function here takes and returns
/// `Map<String, Object?>` — the ledger exactly as `saveStateToStorage` writes it and
/// `parity/fixtures/app-handlers.json` records it — not the typed models. That choice
/// is what makes the goldens replayable: a golden *is* a JSON tree, so a typed port
/// would have to be compared through a decoder and every dropped field would look like
/// a parity failure instead of a bug. The typed layer is still required to be lossless,
/// and `mobile/test/domain/app_handlers_test.dart` proves it by pushing each handler's
/// output through `AppState.fromJson(...)`/`toJson()` and demanding an identical tree.
///
/// Four conventions carry that boundary and all four come from `parity/DATA_SPEC.md`:
///
/// - **`undefined` is an absent key.** `{...c, balance: x}` keeps `x`'s position;
///   writing `undefined` removes the key, because `JSON.stringify` drops the pair.
///   [`_assign`] is the only place that rule is spelled.
/// - **`num`, not `double`.** A result that can be an integer is handed over as an
///   `int` through [asJsonSafeNumber], which is what `JSON.stringify` writes.
/// - **Key insertion order is data.** Dart's `LinkedHashMap` keeps the first position of
///   a re-assigned key exactly like an object spread does, so `{...row, 'k': v}` is a
///   faithful `{ ...row, k: v }`.
/// - **`prev === state`.** The web's `setState(updater)` re-runs the updater against
///   whatever state is current when React processes it; the handlers' own guards read
///   the closure `state` *outside* the updater for exactly that reason (`App.tsx:3074`
///   "Computed from current state, outside the updater (B5)"). A click is synchronous,
///   so the two are the same object, and the port passes one map to both roles.
///
/// **Side effects are injected, never performed.** A handler also touches the clock,
/// `crypto.randomUUID`, the number locale, the toast channel, the tombstone log and the
/// dirty flag. All six arrive through [HandlerDeps] so that a replay can pin them
/// ([parity/fixtures/app-handlers.json `_provenance.harness`]) and so nothing under
/// `lib/domain/` reaches for `DateTime.now()` — the guard test forbids it.
library;

import 'dart:math' as math;

import '../data/dates_local.dart';
import '../data/js_semantics.dart';
import '../data/number_locale.dart';
import '../models/entities.dart';
import 'credit_cards.dart';
import 'money.dart';
import 'net_worth.dart';
import 'validators.dart';

// ---------------------------------------------------------------------------
// the injected world
// ---------------------------------------------------------------------------

/// `hydrationInFlight` (`App.tsx:203-207`) — the two booleans that decide whether an
/// edit made during cloud hydration has to be merged rather than replaced.
final class HydrationGate {
  /// `hydrationInFlight.current`.
  bool inFlight = false;

  /// `hydrationInFlight.edited`, flipped by [updateState].
  bool edited = false;
}

/// Everything a handler can observe or change outside the ledger.
///
/// The four sinks are optional because the parity replay only measures the ledger: the
/// goldens compare the thirteen collections the localStorage mirror holds and nothing
/// else. Leaving a sink out is not a behaviour change to the ledger, and the app wires
/// all four in Phase 5. Each one mirrors its web call **positionally**, including the
/// call sites that pass `('success', message)` where the context expects
/// `(message, type)` — `NotificationContext.showToast:37-46` detects which argument is
/// a [ToastType] and reorders them itself, so the port deliberately does not "fix" the
/// swap.
final class HandlerDeps {
  const HandlerDeps({
    required this.nowMs,
    required this.uuid,
    required this.locale,
    this.email,
    this.hydration,
    this.onToast,
    this.onRecordDeletions,
    this.onMarkStateDirty,
    this.onCloseTransactionEditor,
  });

  /// `Date.now()`. A function, not a constant, because the web reads the clock about
  /// fifteen times per handler and the harness pins it with `clock.setFixedTime` — a
  /// frozen value would silently hide a handler that reads the clock twice and expects
  /// the two reads to differ (`handleTransferFunds` mints `-out`, `-in` and `-char`
  /// ids from three separate `Date.now()` calls).
  final int Function() nowMs;

  /// `crypto.randomUUID()`, as the 36-character form `generateUniqueId`
  /// (`src/utils.ts:315-322`) interpolates after the prefix.
  final String Function() uuid;

  /// The locale `toLocaleString()` reads off the runtime. `_provenance.locale` is
  /// `en-US` for these goldens; the app passes `JsNumberLocale.device()`.
  final JsNumberLocale locale;

  /// `userEmail` — the owner the dirty flag and the tombstones are keyed by.
  final String? email;

  /// The `hydrationInFlight` ref, or `null` when nothing is hydrating.
  final HydrationGate? hydration;

  /// `showToast(first, second)` (`context/NotificationContext.tsx:32`).
  final void Function(String first, [String? second])? onToast;

  /// `recordDeletions(userEmail, ids)` (`src/utils.ts:155-168`).
  final void Function(String? email, List<String> ids)? onRecordDeletions;

  /// `markStateDirty(userEmail)` (`src/utils.ts:98-106`).
  final void Function(String? email)? onMarkStateDirty;

  /// `setEditingTransactionId(null)` — the two handlers that end a row edit close the
  /// modal that started it. UI, not ledger, but it is part of what a click does.
  final void Function()? onCloseTransactionEditor;
}

// ---------------------------------------------------------------------------
// JSON-boundary helpers
// ---------------------------------------------------------------------------

/// A collection read the way `state.x || []` reads it: anything that is not a list is
/// the empty list. A `null` element is kept out, because a ledger collection cannot
/// carry one — `syncStateToSupabase` fans each row into a record and would throw first.
List<Map<String, Object?>> _rows(Object? collection) => collection is List
    ? collection.whereType<Map<String, Object?>>().toList()
    : const <Map<String, Object?>>[];

/// `{ ...row }` — a shallow copy. Nothing here mutates a row in place, so a row that
/// survives a handler untouched is still the row that came in.
Map<String, Object?> _copy(Map<String, Object?> row) =>
    Map<String, Object?>.from(row);

/// A field write where `null` means the web's `undefined`: the key goes away rather
/// than becoming `null`, because `JSON.stringify` drops `undefined` pairs and the
/// seeded mirror holds no explicit `null` anywhere in the thirteen collections.
void _assign(Map<String, Object?> row, String key, Object? value) {
  if (value == null) {
    row.remove(key);
  } else {
    row[key] = value;
  }
}

/// `Number(x)` — the web's coercion, used everywhere a handler does bare float
/// arithmetic instead of cents arithmetic. See the two call-site notes for why a
/// `NaN` is sometimes the answer.
num _num(Object? value) => jsToNumber(value);

/// `x || 0` then `Number(...)`, in that order, which is how `handleMakeDebtPayment:2849`
/// reads a stored amount. `'abc' || 0` is `'abc'`, so the `Number` still produces `NaN`
/// — the falsey half is only what `0`, `''`, `null` collapse to.
num _orZero(Object? value) => jsTruthy(value) ? jsToNumber(value) : 0;

/// `(minorA ± minorB) / 100` — the inline cent arithmetic the handlers do *without*
/// going through `addMoney`/`subtractMoney` (`App.tsx:1085`, `:1196`, `:2204`).
///
/// The result is a major-unit amount destined for app state, so it goes through
/// [asJsonSafeNumber]: the web holds a `double` in React and `JSON.stringify` writes
/// `"3"` for `3.0`, and this port is at the JSON boundary, not at the React boundary.
num _majorFromCents(num cents) => asJsonSafeNumber(cents / 100);

/// `generateUniqueId(prefix)` (`src/utils.ts:315-322`). The web falls back to
/// `Date.now()`+base36 when `crypto.randomUUID` is missing; on a phone it never is, so
/// the port requires the injected source and has no fallback to get wrong.
String _uniqueId(HandlerDeps deps, String prefix) => '$prefix-${deps.uuid()}';

/// `new Date().toISOString()` at the pinned instant.
String _nowIso(HandlerDeps deps) =>
    nowIso(DateTime.fromMillisecondsSinceEpoch(deps.nowMs(), isUtc: true));

/// `todayLocal()` (`src/utils.ts`), at the pinned instant and the device's zone.
String _today(HandlerDeps deps) => todayLocal(nowMs: deps.nowMs());

/// `${prev.currency}` inside a user-facing message.
///
/// An absent `currency` cannot reach a handler: `AppState.fromJson` defaults it to
/// `Rs.` (`lib/models/app_state.dart`), which is the same object the web's
/// `loadStateFromStorage` builds. The fallback is that default, not the web's literal
/// `"undefined"`.
String _currency(Map<String, Object?> state) {
  final Object? value = state['currency'];
  if (value is String) return value;
  if (value == null) return 'Rs.';
  return jsToString(value);
}

/// `n.toLocaleString()` with no options — `maximumFractionDigits` 3, minimum 0. The
/// web reaches for this form in every handler message, and never for `formatMoney`,
/// which is why the messages read `Rs. 2,450.5` and not `Rs. 2,450.50`.
String _localeNumber(HandlerDeps deps, num value) =>
    jsToLocaleStringFixed(value, 0, 3, deps.locale);

/// `(x || '')` where the result is then compared or concatenated as a string.
String _stringOrEmpty(Object? value) =>
    jsTruthy(value) ? (value is String ? value : jsToString(value)) : '';

/// `Math.max(0, n)` — and `dart:math` propagates `NaN` the way `Math.max` does, so a
/// garbage stored amount stays garbage instead of becoming the floor.
num _maxZero(num value) => math.max(0, value);

/// V8's stable `Array#sort` reproduced by index decoration (`INVENTORY.md` §5.7), for
/// the one comparator in this file that has no tiebreak and therefore depends on it.
List<Map<String, Object?>> _stableSorted(
  List<Map<String, Object?>> rows,
  int Function(Map<String, Object?> a, Map<String, Object?> b) compare,
) {
  final List<int> order = List<int>.generate(rows.length, (int i) => i)
    ..sort((int a, int b) {
      final int byKey = compare(rows[a], rows[b]);
      return byKey != 0 ? byKey : a.compareTo(b);
    });
  return order.map((int i) => rows[i]).toList();
}

// ---------------------------------------------------------------------------
// updateState — the chokepoint every handler writes through
// ---------------------------------------------------------------------------

/// `updateState` (`App.tsx:686-714`), the only writer of app state.
///
/// Three things happen on every single write and none of them is optional in the port:
/// the durable dirty flag (an edit the cloud has not seen, marked at edit time because
/// the push is debounced and may never run), the hydration `edited` latch, and
/// [reconcileSubscriptionsWithTransactions] — which is why the subscription landmine
/// (`INVENTORY.md` §5.10) is part of *every* handler's output rather than of the
/// subscription screen alone.
Map<String, Object?> updateState(
  HandlerDeps deps,
  Map<String, Object?> state,
  Map<String, Object?> Function(Map<String, Object?> prev) updater,
) {
  deps.onMarkStateDirty?.call(deps.email);
  final HydrationGate? gate = deps.hydration;
  if (gate != null && gate.inFlight) gate.edited = true;

  final Map<String, Object?> next = updater(state);
  next['subscriptions'] = reconcileSubscriptionsWithTransactions(
    next['subscriptions'],
    next['transactions'],
  );
  return next;
}

/// `reconcileSubscriptionsWithTransactions` (`App.tsx:319-379`).
///
/// A subscription's due date walks forward by billing cycle for every expense row that
/// names it and lands inside a **[-15, +25] day window** around the current due date.
/// Two date regimes meet here and that is the whole defect (`INVENTORY.md` §5.10):
/// the window is measured with `new Date('YYYY-MM-DD')`, which is **UTC** midnight,
/// while the step is `addMonthsClamped`, which is **local** and clamps a 31st to the
/// last day of the month. Both are replicated verbatim, and the difference is a
/// behaviour the goldens would catch the moment either side is "improved".
List<Object?> reconcileSubscriptionsWithTransactions(
  Object? subscriptions,
  Object? transactions,
) {
  // `if (!subscriptions || !transactions) return subscriptions || []`. An empty array
  // is truthy in JavaScript, so this guard is about absence, not about emptiness.
  if (subscriptions == null || transactions == null) {
    return subscriptions is List
        ? List<Object?>.from(subscriptions)
        : <Object?>[];
  }
  final List<Map<String, Object?>> subs = _rows(subscriptions);
  final List<Map<String, Object?>> txs = _rows(transactions);

  return subs.map<Object?>((Map<String, Object?> sub) {
    if (sub['status'] == 'Cancelled') return sub;

    String? currentDueDate = sub['dueDate'] is String
        ? sub['dueDate']! as String
        : null;
    Object? lastPaid = sub['lastPaidDate'];
    Object? paymentMethodId = sub['paymentMethodId'];
    Object? paymentMethodType = sub['paymentMethodType'];

    final String lowerSubName = _stringOrEmpty(sub['name'])
        .toLowerCase()
        .trim();
    final List<Map<String, Object?>> matchingTx = txs.where((
      Map<String, Object?> t,
    ) {
      if (t['type'] != 'expense') return false;
      final String lowerTitle = _stringOrEmpty(t['title']).toLowerCase().trim();
      return lowerTitle == lowerSubName ||
          lowerTitle.contains(lowerSubName) ||
          lowerSubName.contains(lowerTitle) ||
          lowerTitle.replaceAll(_subscriptionTitlePattern, '') == lowerSubName;
    }).toList();

    // `(a.date || '').localeCompare(b.date || '')`, stable.
    final List<Map<String, Object?>> sortedTx = _stableSorted(
      matchingTx,
      (Map<String, Object?> a, Map<String, Object?> b) =>
          jsLocaleCompare(_stringOrEmpty(a['date']), _stringOrEmpty(b['date'])),
    );

    for (final Map<String, Object?> tx in sortedTx) {
      if (!jsTruthy(tx['date'])) continue;
      final int? txMs = jsDateToEpochMs(tx['date']);
      final int? dueMs = jsDateToEpochMs(currentDueDate);
      // `NaN` in either half makes both comparisons false, so the loop simply moves on.
      if (txMs == null || dueMs == null) continue;
      final double diffDays = (txMs - dueMs) / 86400000;
      if (diffDays >= -15 && diffDays <= 25) {
        currentDueDate = addMonthsClamped(
          currentDueDate!,
          sub['billingCycle'] == 'Monthly' ? 1 : 12,
        );
        lastPaid = tx['date'];
        paymentMethodId = tx['accountId'];
        paymentMethodType = tx['accountType'];
      }
    }

    return <String, Object?>{
      ...sub,
      'dueDate': currentDueDate,
      'lastPaidDate': lastPaid,
      'paymentMethodId': paymentMethodId,
      'paymentMethodType': paymentMethodType,
    }..let((Map<String, Object?> row) {
      // The four keys above were *assigned*, not spread: `dueDate: undefined` still
      // creates the key, and `JSON.stringify` then drops it. Rebuilding from `{...sub}`
      // with `null` values has to undo that, or a subscription that never had a
      // `lastPaidDate` would gain a JSON `null` the web's mirror never shows.
      for (final String key in const <String>[
        'dueDate',
        'lastPaidDate',
        'paymentMethodId',
        'paymentMethodType',
      ]) {
        if (row[key] == null) row.remove(key);
      }
    });
  }).toList();
}

/// `/subscription\s*(settle|payment)?:?\s*/g` — the fourth name-match arm.
final RegExp _subscriptionTitlePattern = RegExp(
  r'subscription\s*(settle|payment)?:?\s*',
);

extension _Let<T> on T {
  T let(void Function(T value) body) {
    body(this);
    return this;
  }
}

// ---------------------------------------------------------------------------
// 1. handleAddIncome — `App.tsx:1033-1133`
// ---------------------------------------------------------------------------

/// Rule: Add Income Inflow. An `inc-*` row, a matching `income` transaction, the target
/// credited by raw cent arithmetic, and a system notification whose message quotes
/// `amount.toLocaleString()` — three decimal places maximum, no padding.
Map<String, Object?> handleAddIncome(
  HandlerDeps deps,
  Map<String, Object?> state,
  num amount,
  String date,
  String source,
  String category,
  String targetAccountId,
  String targetType,
) {
  final String incomeId = _uniqueId(deps, 'inc');
  final String transactionId = _uniqueId(deps, 'trans');
  final String nowIso = _nowIso(deps);

  final Map<String, Object?> newIncome = <String, Object?>{
    'id': incomeId,
    'amount': amount,
    'date': date,
    'source': source,
    'category': category,
    'targetAccountId': targetAccountId,
    'targetType': targetType,
    'updated_at': nowIso,
    'updatedAt': nowIso,
  };

  // The web drafts this record twice (`:1058` for the validator, `:1101` inside the
  // updater) and the two drafts are identical, so one map stands for both.
  final Map<String, Object?> newTransaction = <String, Object?>{
    'id': transactionId,
    'type': 'income',
    'title': source,
    'amount': amount,
    'date': date,
    'category': category,
    'accountId': targetAccountId,
    'accountType': targetType,
    'referenceId': incomeId,
    'updated_at': nowIso,
    'updatedAt': nowIso,
  };

  final ValidationResult validation = validateData(
    schemaNamed('TransactionSchema'),
    newTransaction,
  );
  if (!validation.success) {
    deps.onToast?.call(validation.error ?? '', 'error');
    return state;
  }

  return updateState(deps, state, (Map<String, Object?> prev) {
    List<Object?> updatedCash = _rows(prev['cashAccounts']).map(_copy).toList();
    List<Object?> updatedCards = _rows(prev['cards']).map(_copy).toList();

    if (targetType == 'cash') {
      for (int i = 0; i < updatedCash.length; i++) {
        final Map<String, Object?> c = updatedCash[i]! as Map<String, Object?>;
        if (c['id'] == targetAccountId) {
          c['balance'] = _majorFromCents(
            toMinorUnits(c['balance']) + toMinorUnits(amount),
          );
        }
      }
    } else {
      for (int i = 0; i < updatedCards.length; i++) {
        final Map<String, Object?> c = updatedCards[i]! as Map<String, Object?>;
        if (c['id'] == targetAccountId) {
          c['currentBalance'] = _majorFromCents(
            toMinorUnits(c['currentBalance']) + toMinorUnits(amount),
          );
        }
      }
    }

    // The *pre-edit* name is what the message quotes: `prev.cashAccounts`, not
    // `updatedCash`. Renaming an account in the same click is not possible here, but
    // reading the updated list would survive a rename and the web does not.
    final String nameOfTarget = targetType == 'cash'
        ? _orCashName(prev, targetAccountId, 'Cash')
        : _orCardName(prev, targetAccountId, 'Bank Card');

    final Map<String, Object?> newNotif = <String, Object?>{
      'id': 'nt-${deps.nowMs()}',
      'type': 'system',
      'message':
          'Ledger balanced: Income of ${_currency(prev)} ${_localeNumber(deps, amount)} credited to $nameOfTarget.',
      'date': _today(deps),
      'read': false,
    };

    return <String, Object?>{
      ...prev,
      'incomes': <Object?>[..._rows(prev['incomes']), newIncome],
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'transactions': <Object?>[newTransaction, ..._rows(prev['transactions'])],
      'notifications': <Object?>[newNotif, ..._rows(prev['notifications'])],
    };
  });
}

/// `rows.find((r) => r.id === id)` at the JSON boundary. The id stays `Object?` because
/// the web's `===` is strict: a numeric id in state does not match a string one in the
/// payload, and coercing here would silently match a row the web never found.
Map<String, Object?>? _find(List<Map<String, Object?>> rows, Object? id) {
  for (final Map<String, Object?> row in rows) {
    if (row['id'] == id) return row;
  }
  return null;
}

/// `prev.cashAccounts.find(...)?.name || 'Cash'`.
String _orCashName(
  Map<String, Object?> state,
  String accountId,
  String fallback,
) {
  final String name = _stringOrEmpty(
    _find(_rows(state['cashAccounts']), accountId)?['name'],
  );
  return name.isEmpty ? fallback : name;
}

/// `prev.cards.find(...)?.cardName || 'Bank Card'`.
String _orCardName(Map<String, Object?> state, String cardId, String fallback) {
  final String name = _stringOrEmpty(
    _find(_rows(state['cards']), cardId)?['cardName'],
  );
  return name.isEmpty ? fallback : name;
}

// ---------------------------------------------------------------------------
// 2. handleAddExpense — `App.tsx:1136-1299`
// ---------------------------------------------------------------------------

/// Rule: Add Expense / Invoice. One or two expense rows and one or two transaction rows
/// (a `bankCharge` above zero mints its own pair), the source debited by
/// `amount + charge` in cents, and up to one low-balance alert whose threshold and
/// wording differ between a debit card, a credit card and a cash account.
Map<String, Object?> handleAddExpense(
  HandlerDeps deps,
  Map<String, Object?> state,
  String title,
  String description,
  num amount,
  String date,
  String category,
  String paymentMethodId,
  String paymentMethodType, [
  num bankCharge = 0,
]) {
  final String expenseId = _uniqueId(deps, 'exp');
  final String transactionId = _uniqueId(deps, 'trans');
  final String nowIso = _nowIso(deps);

  final Map<String, Object?> newExpense = <String, Object?>{
    'id': expenseId,
    'title': title,
    'description': description,
    'amount': amount,
    'date': date,
    'category': category,
    'paymentMethodId': paymentMethodId,
    'paymentMethodType': paymentMethodType,
    'updated_at': nowIso,
    'updatedAt': nowIso,
  };

  final Map<String, Object?> newTransaction = <String, Object?>{
    'id': transactionId,
    'type': 'expense',
    'title': title,
    'amount': amount,
    'date': date,
    'category': category,
    'accountId': paymentMethodId,
    'accountType': paymentMethodType,
    'referenceId': expenseId,
    if (bankCharge > 0) 'charge': bankCharge,
    'updated_at': nowIso,
    'updatedAt': nowIso,
  };

  final ValidationResult validation = validateData(
    schemaNamed('TransactionSchema'),
    newTransaction,
  );
  if (!validation.success) {
    deps.onToast?.call(validation.error ?? '', 'error');
    return state;
  }

  return updateState(deps, state, (Map<String, Object?> prev) {
    final List<Object?> updatedCash = _rows(prev['cashAccounts'])
        .map(_copy)
        .toList();
    final List<Object?> updatedCards = _rows(prev['cards']).map(_copy).toList();
    final List<Object?> newAlertNotifications = <Object?>[];

    // Cents on both sides, one division: `(toMinorUnits(balance) - (toMinorUnits(amount)
    // + toMinorUnits(charge))) / 100`. `:1191` sums the two minor units first, so a
    // half-paisa on each never rounds twice.
    final num totalDeductionCents =
        toMinorUnits(amount) + toMinorUnits(bankCharge);

    if (paymentMethodType == 'cash') {
      for (final Object? maybeRow in updatedCash) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] != paymentMethodId) continue;
        final num nextVal = _majorFromCents(
          toMinorUnits(c['balance']) - totalDeductionCents,
        );
        if (nextVal < 5000) {
          newAlertNotifications.add(<String, Object?>{
            'id': 'nt-alert-${deps.nowMs()}',
            'type': 'alert',
            'message':
                'Low balance alert! ${c['name']} is critically low: ${_currency(prev)} ${_localeNumber(deps, nextVal)}',
            'date': _today(deps),
            'read': false,
          });
        }
        c['balance'] = nextVal;
      }
    } else {
      for (final Object? maybeRow in updatedCards) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] != paymentMethodId) continue;
        final bool isCredit = c['cardType'] == 'Credit';
        final num nextVal = _majorFromCents(
          toMinorUnits(c['currentBalance']) - totalDeductionCents,
        );
        // A credit card's floor is *available credit* (`limit + balance`, the balance
        // being negative), and only when the card has a limit at all.
        final Object? limit = c['limit'];
        final bool isLow = isCredit
            ? limit != null && _num(limit) + nextVal < 1000
            : nextVal < 10000;
        if (isLow) {
          final String alertMsg = isCredit
              ? 'Credit card alert! Card ${c['cardName']} available credit is low: '
                    '${_currency(prev)} ${_localeNumber(deps, _num(limit) + nextVal)}'
              : 'Low balance alert! Card ${c['cardName']} balance is low: '
                    '${_currency(prev)} ${_localeNumber(deps, nextVal)}';
          newAlertNotifications.add(<String, Object?>{
            'id': 'nt-alert-${deps.nowMs()}',
            'type': 'alert',
            'message': alertMsg,
            'date': _today(deps),
            'read': false,
          });
        }
        c['currentBalance'] = nextVal;
      }
    }

    final List<Object?> newExpenses = <Object?>[
      ..._rows(prev['expenses']),
      newExpense,
    ];
    final List<Object?> newTransactions = <Object?>[newTransaction];

    if (bankCharge > 0) {
      final String chargeExpenseId = _uniqueId(deps, 'exp-charge');
      final String chargeTransactionId = _uniqueId(deps, 'trans-charge');

      newExpenses.add(<String, Object?>{
        'id': chargeExpenseId,
        'title': 'Bank Charge: $title',
        'description': 'Automatic bank charge fee for: $title',
        'amount': bankCharge,
        'date': date,
        'category': 'Bank Charges & Interest',
        'paymentMethodId': paymentMethodId,
        'paymentMethodType': paymentMethodType,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });

      newTransactions.add(<String, Object?>{
        'id': chargeTransactionId,
        'type': 'expense',
        'title': 'Bank Charge: $title',
        'amount': bankCharge,
        'date': date,
        'category': 'Bank Charges & Interest',
        'accountId': paymentMethodId,
        'accountType': paymentMethodType,
        'referenceId': chargeExpenseId,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });
    }

    return <String, Object?>{
      ...prev,
      'expenses': newExpenses,
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'transactions': <Object?>[
        ...newTransactions,
        ..._rows(prev['transactions']),
      ],
      'notifications': <Object?>[
        ...newAlertNotifications,
        ..._rows(prev['notifications']),
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// 3. handleMakeLoanSettlement — `App.tsx:1567-1760`
// ---------------------------------------------------------------------------

/// Rule: money comes back from a loan. The receivable clamps first
/// ([applyRepayment]) — settling Rs. 1,000 on a Rs. 200 balance banks Rs. 800 that
/// nobody owed — and the *clamped* amount is what every downstream record carries.
Map<String, Object?> handleMakeLoanSettlement(
  HandlerDeps deps,
  Map<String, Object?> state,
  String loanId,
  num requested,
  String receivedInId,
  String receivedInType,
  String receivedInName, [
  num bankCharge = 0,
]) {
  final String settlementId = 'setl_${deps.nowMs()}';
  final String settlementDate = _today(deps);
  final String nowIso = _nowIso(deps);
  final String? chargeExpenseId = bankCharge > 0
      ? 'exp-charge-${deps.nowMs()}'
      : null;

  if (!_isMoneyAmount(requested)) {
    deps.onToast?.call('Settlement amount must be a positive number.', 'error');
    return state;
  }
  if (!_isOptionalCharge(bankCharge)) {
    deps.onToast?.call('Card charge cannot be negative.', 'error');
    return state;
  }
  if (compareMoney(bankCharge, requested) > 0) {
    deps.onToast?.call(
      'Card charge cannot exceed the settlement amount.',
      'error',
    );
    return state;
  }

  final Map<String, Object?>? loanSnapshot = _find(
    _rows(state['loansGiven']),
    loanId,
  );
  if (loanSnapshot == null) {
    deps.onToast?.call('That loan record no longer exists', 'error');
    return state;
  }
  final num outstanding = _maxZero(
    _num(loanSnapshot['remainingAmount'] ?? loanSnapshot['totalAmount'] ?? 0),
  );
  final num amount = applyRepayment(outstanding, requested).applied;
  if (amount <= 0) {
    deps.onToast?.call('This loan is already fully settled', 'error');
    return state;
  }
  if (compareMoney(bankCharge, amount) > 0) {
    deps.onToast?.call(
      'Card charge cannot exceed the amount still owed on this loan.',
      'error',
    );
    return state;
  }
  if (compareMoney(amount, requested) < 0) {
    deps.onToast?.call(
      'Only ${formatMoney(_currency(state), outstanding, const FormatMoneyOptions(), deps.locale)} '
          'was still owed — that is what was received',
      'warning',
    );
  }

  return updateState(deps, state, (Map<String, Object?> prev) {
    final Map<String, Object?>? targetLoan = _find(
      _rows(prev['loansGiven']),
      loanId,
    );
    if (targetLoan == null) return prev;

    final List<Object?> updatedCash = _rows(prev['cashAccounts'])
        .map(_copy)
        .toList();
    final List<Object?> updatedCards = _rows(prev['cards']).map(_copy).toList();

    final num netCredited = subtractMoney(amount, bankCharge);

    if (receivedInType == 'cash') {
      for (final Object? maybeRow in updatedCash) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] == receivedInId) {
          c['balance'] = addMoney(_num(c['balance']), netCredited);
        }
      }
    } else {
      for (final Object? maybeRow in updatedCards) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] == receivedInId) {
          c['currentBalance'] = addMoney(
            _num(c['currentBalance']),
            netCredited,
          );
        }
      }
    }

    final Map<String, Object?> newSettlement = <String, Object?>{
      'id': settlementId,
      'loanId': loanId,
      'amount': amount,
      'date': settlementDate,
      'receivedInId': receivedInId,
      'receivedInType': receivedInType,
      'receivedInName': receivedInName,
      if (bankCharge > 0) 'bankCharge': bankCharge,
      'chargeExpenseId': ?chargeExpenseId,
      'updated_at': nowIso,
      'updatedAt': nowIso,
    };

    final List<Object?> updatedLoans = _rows(prev['loansGiven'])
        .map((Map<String, Object?> loan) {
          if (loan['id'] != loanId) return _copy(loan);
          final num newRemaining = _maxZero(
            subtractMoney(
              _num(loan['remainingAmount'] ?? loan['totalAmount'] ?? 0),
              amount,
            ),
          );
          final List<Object?> settlements = <Object?>[
            ..._rows(loan['settlements']),
            newSettlement,
          ];
          return <String, Object?>{
            ...loan,
            'remainingAmount': newRemaining,
            'status': newRemaining <= 0 ? 'Settled' : 'Partially Settled',
            'settlements': settlements,
            'updated_at': nowIso,
            'updatedAt': nowIso,
          };
        })
        .toList();

    final Map<String, Object?> newTx = <String, Object?>{
      'id': 'tx_setl_${deps.nowMs()}',
      'type': 'income',
      'title': 'Loan Settle Recv: ${targetLoan['borrowerName']}',
      'amount': amount,
      'date': settlementDate,
      'category': 'Loan Settle',
      'accountId': receivedInId,
      'accountType': receivedInType,
      'referenceId': settlementId,
      if (bankCharge > 0) 'charge': bankCharge,
      'updated_at': nowIso,
      'updatedAt': nowIso,
    };

    final Map<String, Object?> newInc = <String, Object?>{
      'id': 'inc_setl_${deps.nowMs()}',
      'amount': amount,
      'date': settlementDate,
      'source': 'Loan settlement received from ${targetLoan['borrowerName']}',
      'category': 'Loan Settle',
      'targetAccountId': receivedInId,
      'targetType': receivedInType,
      'updated_at': nowIso,
      'updatedAt': nowIso,
    };

    final List<Object?> newExpenses = _rows(prev['expenses']).toList();
    final List<Object?> newTransactions = <Object?>[newTx];

    if (chargeExpenseId != null) {
      newExpenses.insert(0, <String, Object?>{
        'id': chargeExpenseId,
        'title': 'Bank Charge: Loan Settle ${targetLoan['borrowerName']}',
        'description': 'Automatic transaction fee on loan settlement deposit',
        'amount': bankCharge,
        'date': settlementDate,
        'category': 'Bank Charges & Interest',
        'paymentMethodId': receivedInId,
        'paymentMethodType': receivedInType,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });
      newTransactions.add(<String, Object?>{
        'id': 'trans-charge-${deps.nowMs()}',
        'type': 'expense',
        'title': 'Bank Charge: Loan Settle ${targetLoan['borrowerName']}',
        'amount': bankCharge,
        'date': settlementDate,
        'category': 'Bank Charges & Interest',
        'accountId': receivedInId,
        'accountType': receivedInType,
        'referenceId': chargeExpenseId,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });
    }

    final Map<String, Object?> newNotif = <String, Object?>{
      'id': 'nt_setl_${deps.nowMs()}',
      'type': 'system',
      'message':
          'Processed loan settlement installment of ${_currency(prev)} ${_localeNumber(deps, amount)} '
          'from ${targetLoan['borrowerName']}, credited to $receivedInName.',
      'date': settlementDate,
      'read': false,
    };

    return <String, Object?>{
      ...prev,
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'loansGiven': updatedLoans,
      'expenses': newExpenses,
      'transactions': <Object?>[
        ...newTransactions,
        ..._rows(prev['transactions']),
      ],
      'incomes': <Object?>[newInc, ..._rows(prev['incomes'])],
      'notifications': <Object?>[newNotif, ..._rows(prev['notifications'])],
    };
  });
}

/// `validateMoneyAmount` (`App.tsx:167-169`) — a `number`, **finite**, and above zero.
/// `Number.isFinite` is stricter than the `isNaN` guards in `lib/money.ts`, so
/// `Infinity` is rejected here and would be accepted there.
bool _isMoneyAmount(num amount) =>
    amount is double ? amount.isFinite && amount > 0 : amount > 0;

/// `validateOptionalCharge` (`App.tsx:171-173`).
bool _isOptionalCharge(num charge) =>
    charge is double ? charge.isFinite && charge >= 0 : charge >= 0;

// ---------------------------------------------------------------------------
// 4. handlePaySubscription — `App.tsx:2181-2344`
// ---------------------------------------------------------------------------

/// Rule: pay a recurring plan. The due date steps by cycle through `addMonthsClamped`
/// (so a 31st due date walks to the 30th and stays there — `INVENTORY.md` §5.2), the
/// plan records what it was paid from, and [updateState]'s reconciliation then gets a
/// chance to walk it further against the row this handler just wrote.
Map<String, Object?> handlePaySubscription(
  HandlerDeps deps,
  Map<String, Object?> state,
  String subId,
  String accountId,
  String accountType,
  String paymentDate, [
  num bankCharge = 0,
]) {
  return updateState(deps, state, (Map<String, Object?> prev) {
    final Map<String, Object?>? sub = _find(
      _rows(prev['subscriptions']),
      subId,
    );
    if (sub == null) return prev;

    final List<Object?> updatedCash = _rows(prev['cashAccounts'])
        .map(_copy)
        .toList();
    final List<Object?> updatedCards = _rows(prev['cards']).map(_copy).toList();
    final List<Object?> newAlertNotifications = <Object?>[];

    final num totalDeductionCents =
        toMinorUnits(sub['amount']) + toMinorUnits(bankCharge);

    String accountName = '';
    if (accountType == 'cash') {
      for (final Object? maybeRow in updatedCash) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] != accountId) continue;
        accountName = c['name']! as String;
        final num nextVal = _majorFromCents(
          toMinorUnits(c['balance']) - totalDeductionCents,
        );
        if (nextVal < 5000) {
          newAlertNotifications.add(<String, Object?>{
            'id': 'nt-alert-${deps.nowMs()}',
            'type': 'alert',
            'message':
                'Low balance alert! ${c['name']} is critically low: ${_currency(prev)} ${_localeNumber(deps, nextVal)}',
            'date': _today(deps),
            'read': false,
          });
        }
        c['balance'] = nextVal;
      }
    } else {
      for (final Object? maybeRow in updatedCards) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] != accountId) continue;
        accountName = '${c['bankName']} - ${c['cardName']}';
        final num nextVal = _majorFromCents(
          toMinorUnits(c['currentBalance']) - totalDeductionCents,
        );
        // `:2223` is the debit-only rule: a **credit** card's `currentBalance` is its
        // debt, so this fires the moment the card is owing more than Rs. 10,000 and the
        // wording ("balance is low") describes the opposite of what happened. B-28
        // records why the screen that should have caught this refuses the payment
        // before the handler ever runs.
        if (nextVal < 10000) {
          newAlertNotifications.add(<String, Object?>{
            'id': 'nt-alert-${deps.nowMs()}',
            'type': 'alert',
            'message':
                'Low balance alert! Card ${c['cardName']} balance is low: ${_currency(prev)} ${_localeNumber(deps, nextVal)}',
            'date': _today(deps),
            'read': false,
          });
        }
        c['currentBalance'] = nextVal;
      }
    }

    final String nextDueDateStr = addMonthsClamped(
      sub['dueDate']! as String,
      sub['billingCycle'] == 'Monthly' ? 1 : 12,
    );

    final List<Object?> updatedSubscriptions = _rows(prev['subscriptions'])
        .map((Map<String, Object?> s) {
          if (s['id'] != subId) return _copy(s);
          return <String, Object?>{
            ...s,
            'dueDate': nextDueDateStr,
            'lastPaidDate': paymentDate,
            'paymentMethodId': accountId,
            'paymentMethodType': accountType,
          };
        })
        .toList();

    final String nowIso = _nowIso(deps);
    final String expenseId = 'exp-${deps.nowMs()}';
    final String transactionId = 'trans-${deps.nowMs()}';

    final Map<String, Object?> newExpense = <String, Object?>{
      'id': expenseId,
      'title': 'Subscription: ${sub['name']}',
      'description':
          'Recurring payment plan: ${sub['billingCycle']} - paid from $accountName',
      'amount': sub['amount'],
      'date': paymentDate,
      'category': sub['category'],
      'paymentMethodId': accountId,
      'paymentMethodType': accountType,
      'updated_at': nowIso,
      'updatedAt': nowIso,
    };

    final Map<String, Object?> newTransaction = <String, Object?>{
      'id': transactionId,
      'type': 'expense',
      'title': 'Subscription Settle: ${sub['name']}',
      'amount': sub['amount'],
      'date': paymentDate,
      'category': sub['category'],
      'accountId': accountId,
      'accountType': accountType,
      'referenceId': expenseId,
      if (bankCharge > 0) 'charge': bankCharge,
      'updated_at': nowIso,
      'updatedAt': nowIso,
    };

    final List<Object?> newExpenses = <Object?>[
      ..._rows(prev['expenses']),
      newExpense,
    ];
    final List<Object?> newTransactions = <Object?>[newTransaction];

    if (bankCharge > 0) {
      final String chargeExpenseId = 'exp-charge-${deps.nowMs()}';
      newExpenses.add(<String, Object?>{
        'id': chargeExpenseId,
        'title': 'Bank Charge: Subscription ${sub['name']}',
        'description': 'Automatic transaction fee on subscription card payment',
        'amount': bankCharge,
        'date': paymentDate,
        'category': 'Bank Charges & Interest',
        'paymentMethodId': accountId,
        'paymentMethodType': accountType,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });
      newTransactions.add(<String, Object?>{
        'id': 'trans-charge-${deps.nowMs()}',
        'type': 'expense',
        'title': 'Bank Charge: Subscription ${sub['name']}',
        'amount': bankCharge,
        'date': paymentDate,
        'category': 'Bank Charges & Interest',
        'accountId': accountId,
        'accountType': accountType,
        'referenceId': chargeExpenseId,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });
    }

    final Map<String, Object?> systemNotif = <String, Object?>{
      'id': 'nt-sys-${deps.nowMs()}',
      'type': 'system',
      'message':
          'Subscription paid: ${sub['name']} is settled (${_currency(prev)} ${_localeNumber(deps, _num(sub['amount']))}). '
          'Next due: $nextDueDateStr.',
      'date': _today(deps),
      'read': false,
    };

    return <String, Object?>{
      ...prev,
      'subscriptions': updatedSubscriptions,
      'expenses': newExpenses,
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'transactions': <Object?>[
        ...newTransactions,
        ..._rows(prev['transactions']),
      ],
      'notifications': <Object?>[
        systemNotif,
        ...newAlertNotifications,
        ..._rows(prev['notifications']),
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// 5. handlePayCreditCard — `App.tsx:2381-2460`
// ---------------------------------------------------------------------------

/// Rule: settle a credit card from a wallet or another card.
///
/// The cycle patch is computed from the **pre-action** state, outside the updater
/// (`App.tsx:2391-2392`), and spread over the card *after* `lastPaymentDate` — so a
/// full settlement erases `dueDate`/`minPayment` (JSON drops the `undefined` pair) while
/// the appended `lastPaymentDate` keeps the position the web gives it.
Map<String, Object?> handlePayCreditCard(
  HandlerDeps deps,
  Map<String, Object?> state,
  String cardId,
  num amount,
  String fromId,
  String fromType,
) {
  if (fromType == 'card' && fromId == cardId) {
    deps.onToast?.call(
      'Cannot pay a credit card using the same card as source.',
      'error',
    );
    return state;
  }
  if (!_isMoneyAmount(amount)) {
    deps.onToast?.call('Payment amount must be a positive number.', 'error');
    return state;
  }

  final Map<String, Object?>? rollSourceCard = _find(
    _rows(state['cards']),
    cardId,
  );
  final List<Transaction> typedTxs = _rows(state['transactions'])
      .map(Transaction.fromJson)
      .toList();
  final RollCardPatch rollResult = rollSourceCard == null
      ? const RollCardPatch.none()
      : maybeRollCard(BankCard.fromJson(rollSourceCard), typedTxs, amount);

  String overpaymentMsg = '';
  final Map<String, Object?> next = updateState(deps, state, (
    Map<String, Object?> prev,
  ) {
    final List<Object?> updatedCash = _rows(prev['cashAccounts'])
        .map((Map<String, Object?> c) {
          if (fromType == 'cash' && c['id'] == fromId) {
            return <String, Object?>{
              ...c,
              'balance': subtractMoney(_num(c['balance']), amount),
            };
          }
          return _copy(c);
        })
        .toList();

    final List<Object?> updatedCards = _rows(prev['cards']).map((
      Map<String, Object?> c,
    ) {
      num cBal = _num(c['currentBalance']);
      if (fromType == 'card' && c['id'] == fromId) {
        // We paid using this card, so balance decreases.
        cBal = subtractMoney(cBal, amount);
      }
      final Map<String, Object?> out = _copy(c);
      if (c['id'] == cardId) {
        // `Math.abs(c.currentBalance)` — the **pre-action** balance, not the `cBal` the
        // source-card debit above may already have moved. The two are the same row only
        // when the card pays itself, which the guard at the top of the handler rejects.
        final num outstanding = _num(c['currentBalance']) < 0
            ? -_num(c['currentBalance'])
            : 0;
        if (amount > outstanding) {
          overpaymentMsg =
              'Note: Payment of ${_currency(prev)}${_localeNumber(deps, amount)} exceeds '
              'outstanding debt of ${_currency(prev)}${_localeNumber(deps, outstanding)}, '
              'resulting in a positive credit balance of '
              '${_currency(prev)}${_localeNumber(deps, subtractMoney(amount, outstanding))}.';
        }
        // We paid off this card, so the debt moves back toward zero.
        cBal = addMoney(cBal, amount);
      }
      out['currentBalance'] = cBal;
      _assign(
        out,
        'lastPaymentDate',
        c['id'] == cardId ? _today(deps) : c['lastPaymentDate'],
      );
      if (c['id'] == cardId && rollResult.settles) {
        // `{ dueDate: undefined, minPayment: undefined }` — at the JSON boundary that is
        // a removal, not a `null`.
        out.remove('dueDate');
        out.remove('minPayment');
      }
      return out;
    }).toList();

    final Map<String, Object?>? targetCard = _find(
      _rows(prev['cards']),
      cardId,
    );
    final String nowIso = _nowIso(deps);
    final Map<String, Object?> newTransaction = <String, Object?>{
      'id': _uniqueId(deps, 'trans'),
      'type': 'debt_payment',
      'title': 'Credit Card Settlement: ${targetCard?['cardName'] ?? 'Card'}',
      'amount': amount,
      'date': _today(deps),
      'category': 'Debt Repayment',
      'accountId': fromId,
      'accountType': fromType,
      'targetAccountId': targetCard?['id'] ?? cardId,
      'targetAccountType': 'card',
      'updated_at': nowIso,
      'updatedAt': nowIso,
    };

    return <String, Object?>{
      ...prev,
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'transactions': <Object?>[newTransaction, ..._rows(prev['transactions'])],
    };
  });

  if (overpaymentMsg.isNotEmpty) {
    deps.onToast?.call('success', 'Payment recorded! $overpaymentMsg');
  } else if (rollResult.settles) {
    deps.onToast?.call(
      'success',
      'Card fully settled — no further minimum due.',
    );
  } else if (rollSourceCard != null &&
      jsTruthy(rollSourceCard['dueDate']) &&
      jsTruthy(rollSourceCard['minPayment']) &&
      paymentsInCycle(
                typedTxs,
                cardId,
                rollSourceCard['dueDate']! as String,
                cycleAnchor(
                  dueDate: rollSourceCard['dueDate'] as String?,
                  statementCloseDate:
                      rollSourceCard['statementCloseDate'] as String?,
                ),
              ) +
              amount >=
          _num(rollSourceCard['minPayment'])) {
    deps.onToast?.call(
      'success',
      'Payment recorded! Minimum satisfied for this cycle — revolving interest '
          'applies to the remaining balance at cycle end.',
    );
  } else {
    deps.onToast?.call('success', 'Payment recorded successfully!');
  }

  return next;
}

// ---------------------------------------------------------------------------
// 6. handleMakeDebtPayment — `App.tsx:2782-2933`
// ---------------------------------------------------------------------------

/// Rule: repay a debt. Same clamping rule as a loan receipt, and the same
/// **bare-float** deduction: `totalDeduction = amount + bankCharge` is added as floats
/// (`:2826`), not in cents, so it must not be routed through the cent helpers.
Map<String, Object?> handleMakeDebtPayment(
  HandlerDeps deps,
  Map<String, Object?> state,
  String debtId,
  num requested,
  String paidFromId,
  String paidFromType, [
  num bankCharge = 0,
]) {
  final Map<String, Object?>? debtSnapshot = _find(
    _rows(state['debts']),
    debtId,
  );
  if (debtSnapshot == null) {
    deps.onToast?.call('That debt record no longer exists', 'error');
    return state;
  }
  if (!_isMoneyAmount(requested)) {
    deps.onToast?.call('Payment amount must be a positive number.', 'error');
    return state;
  }
  if (!_isOptionalCharge(bankCharge)) {
    deps.onToast?.call('Card charge cannot be negative.', 'error');
    return state;
  }

  final num outstanding = _maxZero(
    _num(debtSnapshot['remainingAmount'] ?? debtSnapshot['totalAmount'] ?? 0),
  );
  final num amount = applyRepayment(outstanding, requested).applied;
  if (amount <= 0) {
    deps.onToast?.call('This debt is already fully repaid', 'error');
    return state;
  }
  if (compareMoney(amount, requested) < 0) {
    deps.onToast?.call(
      'Only ${formatMoney(_currency(state), outstanding, const FormatMoneyOptions(), deps.locale)} '
          'was still owed — that is what was repaid',
      'warning',
    );
  }

  final String paymentId = 'dp-${deps.nowMs()}';
  final String transactionId = 'trans-${deps.nowMs()}';
  final String paymentDate = _today(deps);

  return updateState(deps, state, (Map<String, Object?> prev) {
    final List<Object?> updatedCash = _rows(prev['cashAccounts'])
        .map(_copy)
        .toList();
    final List<Object?> updatedCards = _rows(prev['cards']).map(_copy).toList();

    final num totalDeduction = amount + bankCharge;

    if (paidFromType == 'cash') {
      for (final Object? maybeRow in updatedCash) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] == paidFromId) {
          c['balance'] = subtractMoney(_num(c['balance']), totalDeduction);
        }
      }
    } else {
      for (final Object? maybeRow in updatedCards) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] == paidFromId) {
          c['currentBalance'] = subtractMoney(
            _num(c['currentBalance']),
            totalDeduction,
          );
        }
      }
    }

    final List<Object?> updatedDebts = _rows(prev['debts']).map((
      Map<String, Object?> debt,
    ) {
      if (debt['id'] != debtId) return _copy(debt);
      final Map<String, Object?> newPayment = <String, Object?>{
        'id': paymentId,
        'debtId': debtId,
        'amount': amount,
        'date': paymentDate,
        'paidFromId': paidFromId,
        'paidFromType': paidFromType,
      };
      final List<Object?> payments = <Object?>[
        ..._rows(debt['payments']),
        newPayment,
      ];
      // `debt.remainingAmount - Number(amount)` (`:2755`) is a bare float subtraction,
      // but its result lands in state, so it takes `JSON.stringify`'s spelling.
      final num nextRemaining = asJsonSafeNumber(
        _maxZero(_orZero(debt['remainingAmount']) - _orZero(amount)),
      );
      return <String, Object?>{
        ...debt,
        'remainingAmount': nextRemaining,
        'payments': payments,
        'status': nextRemaining == 0
            ? 'Fully Repaid'
            : _stringOrEmpty(debt['status']).isEmpty
            ? 'Active'
            : debt['status'],
      };
    }).toList();

    final Map<String, Object?>? matchedDebt = _find(
      _rows(prev['debts']),
      debtId,
    );
    final String debtSource = _stringOrEmpty(matchedDebt?['debtSource']);
    final String nowIso = _nowIso(deps);

    final Map<String, Object?> newTransaction = <String, Object?>{
      'id': transactionId,
      'type': 'debt_payment',
      'title':
          'Debt Repayment - ${debtSource.isEmpty ? 'Private Loan' : debtSource}',
      'amount': amount,
      'date': paymentDate,
      'category': 'Debt Repayment',
      'accountId': paidFromId,
      'accountType': paidFromType,
      'referenceId': paymentId,
      if (bankCharge > 0) 'charge': bankCharge,
      'updated_at': nowIso,
      'updatedAt': nowIso,
    };

    final List<Object?> newExpenses = _rows(prev['expenses']).toList();
    final List<Object?> newTransactions = <Object?>[newTransaction];

    if (bankCharge > 0) {
      final String chargeExpenseId = 'exp-charge-${deps.nowMs()}';
      newExpenses.add(<String, Object?>{
        'id': chargeExpenseId,
        'title':
            'Bank Charge: Repay ${debtSource.isEmpty ? 'Private Loan' : debtSource}',
        'description': 'Automatic bank charge fee for debt repayment',
        'amount': bankCharge,
        'date': paymentDate,
        'category': 'Bank Charges & Interest',
        'paymentMethodId': paidFromId,
        'paymentMethodType': paidFromType,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });
      newTransactions.add(<String, Object?>{
        'id': 'trans-charge-${deps.nowMs()}',
        'type': 'expense',
        'title':
            'Bank Charge: Repay ${debtSource.isEmpty ? 'Private Loan' : debtSource}',
        'amount': bankCharge,
        'date': paymentDate,
        'category': 'Bank Charges & Interest',
        'accountId': paidFromId,
        'accountType': paidFromType,
        'referenceId': chargeExpenseId,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });
    }

    final Map<String, Object?> systemAlert = <String, Object?>{
      'id': 'nt-${deps.nowMs()}',
      'type': 'system',
      // `${matchedDebt?.debtSource}` with no `|| 'Private Loan'` fallback, unlike the
      // two messages above: a debt with no source reads `from undefined` here. Replicated.
      'message':
          'Settle Repayment: Reduced loan from ${matchedDebt?['debtSource']} '
          'by ${_currency(prev)} ${_localeNumber(deps, amount)}.',
      'date': paymentDate,
      'read': false,
    };

    return <String, Object?>{
      ...prev,
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'expenses': newExpenses,
      'debts': updatedDebts,
      'transactions': <Object?>[
        ...newTransactions,
        ..._rows(prev['transactions']),
      ],
      'notifications': <Object?>[systemAlert, ..._rows(prev['notifications'])],
    };
  });
}

// ---------------------------------------------------------------------------
// 7. handleDeleteTransaction — `App.tsx:3070-3313`
// ---------------------------------------------------------------------------

/// Rule: undo a ledger row. Nine branches, because a row is a *pointer* to whatever
/// created it and each creator moved money differently; the reversal is what makes
/// deleting an old row safe, and the zero-amount audit row is what makes it visible.
Map<String, Object?> handleDeleteTransaction(
  HandlerDeps deps,
  Map<String, Object?> state,
  String txId,
) {
  // Computed from current state, outside the updater (`App.tsx:3074`, comment "B5").
  final Map<String, Object?>? target = _find(
    _rows(state['transactions']),
    txId,
  );
  if (target != null &&
      (target['type'] == 'income' || target['type'] == 'expense') &&
      jsTruthy(target['referenceId'])) {
    deps.onRecordDeletions?.call(deps.email, <String>[
      txId,
      target['referenceId']! as String,
    ]);
  } else if (target != null) {
    deps.onRecordDeletions?.call(deps.email, <String>[txId]);
  }

  final Map<String, Object?> next = updateState(deps, state, (
    Map<String, Object?> prev,
  ) {
    final Map<String, Object?>? tx = _find(_rows(prev['transactions']), txId);
    if (tx == null) return prev;

    List<Object?> updatedCash = _rows(prev['cashAccounts']).map(_copy).toList();
    List<Object?> updatedCards = _rows(prev['cards']).map(_copy).toList();
    List<Object?> updatedIncomes = _rows(prev['incomes']).toList();
    List<Object?> updatedExpenses = _rows(prev['expenses']).toList();
    List<Object?> updatedDebts = _rows(prev['debts']).toList();
    List<Object?> updatedPurchases = _rows(prev['creditCardPurchases'])
        .toList();
    List<Object?> updatedInstallments = _rows(prev['creditCardInstallments'])
        .toList();
    List<Object?> updatedInstallmentPayments = _rows(
      prev['creditCardInstallmentPayments'],
    ).toList();
    List<Object?> updatedLoansGiven = _rows(prev['loansGiven']).toList();

    /// Put a row's effect back. `isIncome` names the *direction of the original row*,
    /// so a refund reverses a credit and a repayment reversal credits.
    void reverseAmount(
      num amount,
      String accountId,
      String accountType,
      bool isIncome,
    ) {
      if (accountType == 'cash') {
        updatedCash = updatedCash.map((Object? maybeRow) {
          final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
          if (c['id'] != accountId) return _copy(c);
          return <String, Object?>{
            ...c,
            'balance': isIncome
                ? subtractMoney(_num(c['balance']), amount)
                : addMoney(_num(c['balance']), amount),
          };
        }).toList();
      } else if (accountType == 'card') {
        updatedCards = updatedCards.map((Object? maybeRow) {
          final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
          if (c['id'] != accountId) return _copy(c);
          return <String, Object?>{
            ...c,
            'currentBalance': isIncome
                ? subtractMoney(_num(c['currentBalance']), amount)
                : addMoney(_num(c['currentBalance']), amount),
          };
        }).toList();
      }
    }

    final String type = _stringOrEmpty(tx['type']);
    final String title = _stringOrEmpty(tx['title']);
    final num amount = _num(tx['amount']);
    final String? accountId = tx['accountId'] as String?;
    final String? accountType = tx['accountType'] as String?;
    final String? referenceId = tx['referenceId'] as String?;

    if (type == 'income') {
      updatedIncomes = updatedIncomes
          .where(
            (Object? i) => (i! as Map<String, Object?>)['id'] != referenceId,
          )
          .toList();
      if (accountId != null &&
          accountType != null &&
          accountId.isNotEmpty &&
          accountType.isNotEmpty) {
        reverseAmount(amount, accountId, accountType, true);
      }

      // A loan settlement is written twice, so it is reversed twice.
      if (tx['category'] == 'Loan Settle' &&
          referenceId != null &&
          referenceId.isNotEmpty) {
        final String settledId = referenceId;
        updatedLoansGiven = updatedLoansGiven.map<Object?>((Object? maybeLoan) {
          final Map<String, Object?> loan = maybeLoan! as Map<String, Object?>;
          final Map<String, Object?>? removed = _find(
            _rows(loan['settlements']),
            settledId,
          );
          if (removed == null) return _copy(loan);
          final num remaining = _num(
            loan['remainingAmount'] ?? loan['totalAmount'] ?? 0,
          );
          final num nextRemaining = addMoney(
            remaining,
            _num(removed['amount']),
          );
          final List<Object?> left = _rows(loan['settlements'])
              .where((Map<String, Object?> s) => s['id'] != settledId)
              .toList();
          return <String, Object?>{
            ...loan,
            'remainingAmount': nextRemaining,
            'settlements': left,
            'status': nextRemaining <= 0
                ? 'Settled'
                : left.isEmpty
                ? 'Active'
                : 'Partially Settled',
          };
        }).toList();
      }
    } else if (type == 'expense') {
      if (title.startsWith('Credit Card Purchase:')) {
        updatedCards = updatedCards.map((Object? maybeRow) {
          final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
          if (c['id'] != accountId) return _copy(c);
          return <String, Object?>{
            ...c,
            'currentBalance': addMoney(_num(c['currentBalance']), amount),
          };
        }).toList();
        updatedPurchases = updatedPurchases
            .where(
              (Object? p) => (p! as Map<String, Object?>)['id'] != referenceId,
            )
            .toList();
      } else {
        updatedExpenses = updatedExpenses
            .where(
              (Object? e) => (e! as Map<String, Object?>)['id'] != referenceId,
            )
            .toList();
        if (accountId != null &&
            accountType != null &&
            accountId.isNotEmpty &&
            accountType.isNotEmpty) {
          reverseAmount(amount, accountId, accountType, false);
        }
      }
    } else if (type == 'credit_card_charge') {
      updatedCards = updatedCards.map((Object? maybeRow) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] != accountId) return _copy(c);
        return <String, Object?>{
          ...c,
          'currentBalance': addMoney(_num(c['currentBalance']), amount),
          'charges': _rows(c['charges'])
              .where((Map<String, Object?> ch) => ch['id'] != referenceId)
              .toList(),
        };
      }).toList();
    } else if (type == 'debt_payment') {
      if (title.startsWith('Credit Card Settlement:')) {
        if (accountId != null &&
            accountType != null &&
            accountId.isNotEmpty &&
            accountType.isNotEmpty) {
          reverseAmount(amount, accountId, accountType, false);
        }
        Map<String, Object?>? targetCc;
        if (jsTruthy(tx['targetAccountId']) &&
            tx['targetAccountType'] == 'card') {
          targetCc = _find(
            _rows(prev['cards']),
            tx['targetAccountId']! as String,
          );
        }
        if (targetCc == null) {
          final String cardNamePart = title
              .replaceAll('Credit Card Settlement:', '')
              .trim();
          for (final Map<String, Object?> c in _rows(prev['cards'])) {
            if (c['cardName'] == cardNamePart && c['cardType'] == 'Credit') {
              targetCc = c;
              break;
            }
          }
        }
        if (targetCc != null) {
          final String targetId = targetCc['id']! as String;
          updatedCards = updatedCards.map((Object? maybeRow) {
            final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
            if (c['id'] != targetId) return _copy(c);
            return <String, Object?>{
              ...c,
              'currentBalance': subtractMoney(
                _num(c['currentBalance']),
                amount,
              ),
            };
          }).toList();
        }
      } else if (referenceId != null &&
          referenceId.isNotEmpty &&
          _rows(prev['creditCardInstallmentPayments'])
              .any((Map<String, Object?> p) => p['id'] == referenceId)) {
        if (accountId != null &&
            accountType != null &&
            accountId.isNotEmpty &&
            accountType.isNotEmpty) {
          reverseAmount(amount, accountId, accountType, false);
        }
        final String revertedPaymentId = referenceId;
        updatedInstallmentPayments = _revertedInstallmentRows(
          prev,
          revertedPaymentId,
        );
        final Map<String, Object?>? instPay = _find(
          _rows(prev['creditCardInstallmentPayments']),
          revertedPaymentId,
        );
        if (instPay != null) {
          final Map<String, Object?>? installment = _find(
            _rows(prev['creditCardInstallments']),
            instPay['installmentId']! as String,
          );
          if (installment != null) {
            final List<Map<String, Object?>> instPaymentRecords =
                _rows(updatedInstallmentPayments)
                    .where(
                      (Map<String, Object?> p) =>
                          p['installmentId'] == installment['id'],
                    )
                    .toList();
            final int paidCount = instPaymentRecords
                .where((Map<String, Object?> p) => p['status'] == 'paid')
                .length;
            final List<Map<String, Object?>> pending = instPaymentRecords
                .where((Map<String, Object?> p) => p['status'] == 'pending')
                .toList();
            final List<Map<String, Object?>> orderedPending = _stableSorted(
              pending,
              (Map<String, Object?> a, Map<String, Object?> b) =>
                  (_num(a['paymentNumber']))
                      .compareTo(_num(b['paymentNumber'])),
            );
            final String? nextPendingDueDate = orderedPending.isEmpty
                ? null
                : orderedPending.first['dueDate'] as String?;
            updatedInstallments = _rows(prev['creditCardInstallments'])
                .map<Object?>((Map<String, Object?> i) {
                  if (i['id'] != installment['id']) return _copy(i);
                  return <String, Object?>{
                    ...i,
                    'paymentsMade': paidCount,
                    'status': paidCount >= _num(i['tenureMonths'])
                        ? 'completed'
                        : 'active',
                    'nextPaymentDate': nextPendingDueDate ?? '',
                  };
                })
                .toList();
            updatedCards = updatedCards.map((Object? maybeRow) {
              final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
              if (c['id'] != installment['cardId']) return _copy(c);
              return <String, Object?>{
                ...c,
                'currentBalance': subtractMoney(
                  _num(c['currentBalance']),
                  amount,
                ),
              };
            }).toList();
          }
        }
      } else {
        if (accountId != null &&
            accountType != null &&
            accountId.isNotEmpty &&
            accountType.isNotEmpty) {
          reverseAmount(amount, accountId, accountType, false);
        }
        updatedDebts = updatedDebts.map<Object?>((Object? maybeRow) {
          final Map<String, Object?> d = maybeRow! as Map<String, Object?>;
          final Map<String, Object?>? removedPayment = _find(
            _rows(d['payments']),
            referenceId,
          );
          if (removedPayment == null) return _copy(d);
          // `d.remainingAmount + Math.abs(removedPayment.amount)` — a bare float sum
          // (`:3220`), not cents arithmetic, but its result is written into state, so it
          // still takes `JSON.stringify`'s spelling.
          final num nextRemaining = asJsonSafeNumber(
            _num(d['remainingAmount']) + _num(removedPayment['amount']).abs(),
          );
          return <String, Object?>{
            ...d,
            'remainingAmount': nextRemaining,
            'payments': _rows(d['payments'])
                .where((Map<String, Object?> p) => p['id'] != referenceId)
                .toList(),
            'status': nextRemaining > 0 ? 'Active' : d['status'],
          };
        }).toList();
      }
    } else if (type == 'deposit') {
      if (accountId != null && accountId.isNotEmpty) {
        reverseAmount(
          amount,
          accountId,
          _stringOrEmpty(accountType).isEmpty ? 'cash' : accountType!,
          true,
        );
      }
    } else if (type == 'withdrawal') {
      if (accountId != null && accountId.isNotEmpty) {
        reverseAmount(
          amount,
          accountId,
          _stringOrEmpty(accountType).isEmpty ? 'cash' : accountType!,
          false,
        );
      }
    } else if (type == 'financing') {
      if (accountId != null &&
          accountType != null &&
          accountId.isNotEmpty &&
          accountType.isNotEmpty) {
        if (accountType == 'cash') {
          updatedCash = updatedCash.map((Object? maybeRow) {
            final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
            if (c['id'] != accountId) return _copy(c);
            return <String, Object?>{
              ...c,
              'balance': subtractMoney(_num(c['balance']), amount),
            };
          }).toList();
        } else {
          updatedCards = updatedCards.map((Object? maybeRow) {
            final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
            if (c['id'] != accountId) return _copy(c);
            return <String, Object?>{
              ...c,
              'currentBalance': subtractMoney(
                _num(c['currentBalance']),
                amount,
              ),
            };
          }).toList();
        }
      }
    } else if (type == 'transfer') {
      if (accountId != null &&
          accountType != null &&
          accountId.isNotEmpty &&
          accountType.isNotEmpty) {
        if (amount < 0) {
          final num magnitude = amount.abs();
          if (accountType == 'cash') {
            updatedCash = updatedCash.map((Object? maybeRow) {
              final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
              if (c['id'] != accountId) return _copy(c);
              return <String, Object?>{
                ...c,
                'balance': addMoney(_num(c['balance']), magnitude),
              };
            }).toList();
          } else {
            updatedCards = updatedCards.map((Object? maybeRow) {
              final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
              if (c['id'] != accountId) return _copy(c);
              return <String, Object?>{
                ...c,
                'currentBalance': addMoney(
                  _num(c['currentBalance']),
                  magnitude,
                ),
              };
            }).toList();
          }
        } else {
          if (accountType == 'cash') {
            updatedCash = updatedCash.map((Object? maybeRow) {
              final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
              if (c['id'] != accountId) return _copy(c);
              return <String, Object?>{
                ...c,
                'balance': subtractMoney(_num(c['balance']), amount),
              };
            }).toList();
          } else {
            updatedCards = updatedCards.map((Object? maybeRow) {
              final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
              if (c['id'] != accountId) return _copy(c);
              return <String, Object?>{
                ...c,
                'currentBalance': subtractMoney(
                  _num(c['currentBalance']),
                  amount,
                ),
              };
            }).toList();
          }
        }
      }
    }

    final String nowIso = _nowIso(deps);
    final Map<String, Object?> auditTransaction = <String, Object?>{
      'id': 'trans-del-${deps.nowMs()}',
      'type': 'expense',
      'title': 'Transaction Deleted: $title',
      'amount': 0,
      'date': _today(deps),
      'category': 'Transaction Deletion',
      'referenceId': txId,
      'updated_at': nowIso,
      'updatedAt': nowIso,
    };

    return <String, Object?>{
      ...prev,
      'transactions': <Object?>[
        auditTransaction,
        ..._rows(prev['transactions'])
            .where((Map<String, Object?> t) => t['id'] != txId),
      ],
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'incomes': updatedIncomes,
      'expenses': updatedExpenses,
      'debts': updatedDebts,
      'creditCardPurchases': updatedPurchases,
      'creditCardInstallments': updatedInstallments,
      'creditCardInstallmentPayments': updatedInstallmentPayments,
      'loansGiven': updatedLoansGiven,
    };
  });

  deps.onCloseTransactionEditor?.call();
  return next;
}

/// The installment-payment revert of `handleDeleteTransaction:3186-3188`, extracted only
/// because the closure that does it is already three levels deep.
/// `paidDate: undefined` is a removal, which is why this is not a plain map literal.
List<Object?> _revertedInstallmentRows(
  Map<String, Object?> prev,
  String revertedPaymentId,
) {
  return _rows(prev['creditCardInstallmentPayments'])
      .map<Object?>((Map<String, Object?> p) {
        if (p['id'] != revertedPaymentId) return _copy(p);
        return <String, Object?>{...p, 'amountPaid': 0, 'status': 'pending'}
          ..let((Map<String, Object?> row) {
            row.remove('paidDate');
          });
      })
      .toList();
}

// ---------------------------------------------------------------------------
// 8. handleTransferFunds — `App.tsx:3316-3450`
// ---------------------------------------------------------------------------

/// Rule: move money between two of the user's own accounts. One `referenceId` ties the
/// legs together — and the fee row, which is *reported* rather than deducted a second
/// time (`:3427`), so all three carry the same link and the harness's aliasing proves
/// it.
Map<String, Object?> handleTransferFunds(
  HandlerDeps deps,
  Map<String, Object?> state,
  String fromId,
  String fromType,
  String toId,
  String toType,
  num amount,
  String note,
  String date, [
  num charge = 0,
]) {
  if (fromId == toId && fromType == toType) {
    deps.onToast?.call(
      'error',
      'Source and destination accounts cannot be the same.',
    );
    return state;
  }

  final String transferId = 'trans-grp-${deps.nowMs()}';
  final String transOutId = 'trans-${deps.nowMs()}-out';
  final String transInId = 'trans-${deps.nowMs()}-in';

  final num sourceAccountBalance = fromType == 'cash'
      ? _orZeroFirst(_rows(state['cashAccounts']), fromId, 'balance')
      : _orZeroFirst(_rows(state['cards']), fromId, 'currentBalance');

  if (compareMoney(sourceAccountBalance, addMoney(amount, charge)) < 0) {
    deps.onToast?.call(
      'error',
      'Insufficient balance in the source account including transfer charges.',
    );
    return state;
  }

  return updateState(deps, state, (Map<String, Object?> prev) {
    final List<Object?> updatedCash = _rows(prev['cashAccounts'])
        .map(_copy)
        .toList();
    final List<Object?> updatedCards = _rows(prev['cards']).map(_copy).toList();

    final num movedWithCharge = addMoney(amount, charge);

    if (fromType == 'cash') {
      for (final Object? maybeRow in updatedCash) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] == fromId) {
          c['balance'] = subtractMoney(_num(c['balance']), movedWithCharge);
        }
      }
    } else {
      for (final Object? maybeRow in updatedCards) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] == fromId) {
          c['currentBalance'] = subtractMoney(
            _num(c['currentBalance']),
            movedWithCharge,
          );
        }
      }
    }

    if (toType == 'cash') {
      for (final Object? maybeRow in updatedCash) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] == toId) {
          c['balance'] = addMoney(_num(c['balance']), amount);
        }
      }
    } else {
      for (final Object? maybeRow in updatedCards) {
        final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
        if (c['id'] == toId) {
          c['currentBalance'] = addMoney(_num(c['currentBalance']), amount);
        }
      }
    }

    final String fromName = _accountName(prev, fromId, fromType);
    final String toName = _accountName(prev, toId, toType);
    final String nowIso = _nowIso(deps);

    final List<Object?> newTransactions = <Object?>[
      <String, Object?>{
        'id': transOutId,
        'type': 'transfer',
        'title': 'Transfer to $toName: $note',
        'amount': -amount,
        'charge': charge,
        'date': date,
        'category': 'Transfer Out',
        'accountId': fromId,
        'accountType': fromType,
        'targetAccountId': toId,
        'targetAccountType': toType,
        'referenceId': transferId,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      },
      <String, Object?>{
        'id': transInId,
        'type': 'transfer',
        'title': 'Transfer from $fromName: $note',
        'amount': amount,
        'charge': charge,
        'date': date,
        'category': 'Transfer In',
        'accountId': toId,
        'accountType': toType,
        'targetAccountId': fromId,
        'targetAccountType': fromType,
        'referenceId': transferId,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      },
    ];

    if (charge > 0) {
      newTransactions.add(<String, Object?>{
        'id': 'trans-${deps.nowMs()}-char',
        'type': 'expense',
        'title': 'Transfer Fee/Charge: $fromName to $toName',
        'amount': charge,
        'date': date,
        'category': 'Transfer Fee',
        'accountId': fromId,
        'accountType': fromType,
        'referenceId': transferId,
        'updated_at': nowIso,
        'updatedAt': nowIso,
      });
    }

    return <String, Object?>{
      ...prev,
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'transactions': <Object?>[
        ...newTransactions,
        ..._rows(prev['transactions']),
      ],
    };
  });
}

/// `x || 0` on a found row's field: `.find(...)?.balance || 0`.
num _orZeroFirst(List<Map<String, Object?>> rows, String id, String field) {
  final Object? value = _find(rows, id)?[field];
  return jsTruthy(value) ? _num(value) : 0;
}

/// The `?.name || 'Cash'` / `?.cardName || 'Bank Card'` pair.
String _accountName(
  Map<String, Object?> state,
  String accountId,
  String accountType,
) {
  if (accountType == 'cash') {
    return _orCashName(state, accountId, 'Cash');
  }
  return _orCardName(state, accountId, 'Bank Card');
}

// ---------------------------------------------------------------------------
// 9. handleEditTransaction — `App.tsx:3451-3563`
// ---------------------------------------------------------------------------

/// Rule: change a recorded row. Balance is undone and re-applied through
/// [ledgerBalanceEffect] so that both halves use one sign map, and the *stored* row
/// supplies the direction: the edit form always submits a positive amount, and whether
/// this leg went in or out is not something the user is being asked to re-decide.
Map<String, Object?> handleEditTransaction(
  HandlerDeps deps,
  Map<String, Object?> state,
  String txId,
  Map<String, Object?> newData,
) {
  final Map<String, Object?> next = updateState(deps, state, (
    Map<String, Object?> prev,
  ) {
    final Map<String, Object?>? tx = _find(_rows(prev['transactions']), txId);
    if (tx == null) return prev;

    List<Object?> updatedCash = _rows(prev['cashAccounts']).map(_copy).toList();
    List<Object?> updatedCards = _rows(prev['cards']).map(_copy).toList();

    // `c.id === accountId` is a strict compare, so the ids stay `Object?` rather than
    // being coerced: a numeric id does not match a string one on either side.
    void changeBalance(
      num amountAdded,
      Object? accountId,
      Object? accountType,
    ) {
      if (accountType == 'cash') {
        updatedCash = updatedCash.map((Object? maybeRow) {
          final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
          if (c['id'] != accountId) return _copy(c);
          return <String, Object?>{
            ...c,
            'balance': addMoney(_num(c['balance']), amountAdded),
          };
        }).toList();
      } else if (accountType == 'card') {
        updatedCards = updatedCards.map((Object? maybeRow) {
          final Map<String, Object?> c = maybeRow! as Map<String, Object?>;
          if (c['id'] != accountId) return _copy(c);
          return <String, Object?>{
            ...c,
            'currentBalance': addMoney(_num(c['currentBalance']), amountAdded),
          };
        }).toList();
      }
    }

    final Object? txAccountId = tx['accountId'];
    final Object? txAccountType = tx['accountType'];
    if (jsTruthy(txAccountId) && jsTruthy(txAccountType)) {
      changeBalance(
        -ledgerBalanceEffect(
          _stringOrEmpty(tx['type']),
          tx['category'],
          tx['amount'],
        ),
        txAccountId,
        txAccountType,
      );
    }
    final Object? newAccountId = newData['accountId'];
    final Object? newAccountType = newData['accountType'];
    if (jsTruthy(newAccountId) && jsTruthy(newAccountType)) {
      changeBalance(
        ledgerBalanceEffect(
          _stringOrEmpty(tx['type']),
          tx['category'],
          newData['amount'],
        ),
        newAccountId,
        newAccountType,
      );
    }

    final List<Object?> updatedIncomes = _rows(prev['incomes']).toList();
    List<Object?> updatedExpenses = _rows(prev['expenses']).toList();
    List<Object?> updatedDebts = _rows(prev['debts']).toList();

    final String nowIso = _nowIso(deps);
    final String type = _stringOrEmpty(tx['type']);

    if (type == 'income') {
      // No linked income record update required.
    } else if (type == 'expense') {
      updatedExpenses = updatedExpenses.map<Object?>((Object? maybeRow) {
        final Map<String, Object?> e = maybeRow! as Map<String, Object?>;
        if (e['id'] != tx['referenceId']) return _copy(e);
        // Each of these is an **assignment** from `newData`, not a spread: a field the
        // edit payload does not carry is the web's `undefined`, which `JSON.stringify`
        // then drops — so the linked expense row loses the key rather than gaining a
        // JSON `null`.
        return <String, Object?>{...e}..let((Map<String, Object?> out) {
          _assign(out, 'amount', newData['amount']);
          _assign(out, 'title', newData['title']);
          _assign(out, 'date', newData['date']);
          _assign(out, 'category', newData['category']);
          _assign(out, 'paymentMethodId', newData['accountId']);
          _assign(out, 'paymentMethodType', newData['accountType']);
          out['updated_at'] = nowIso;
          out['updatedAt'] = nowIso;
        });
      }).toList();
    } else if (type == 'debt_payment') {
      updatedDebts = updatedDebts.map<Object?>((Object? maybeRow) {
        final Map<String, Object?> d = maybeRow! as Map<String, Object?>;
        final Map<String, Object?>? removedPayment = _find(
          _rows(d['payments']),
          tx['referenceId'],
        );
        if (removedPayment == null) return _copy(d);
        final num difference = _num(newData['amount']) - _num(tx['amount']);
        // Both operands came out of state as major-unit floats and `difference` is a bare
        // float, so this is the same `78000.0` vs `78000` case as
        // `handleMakeDebtPayment` (`:2755`) — guarded the same way.
        final num nextRemaining = asJsonSafeNumber(
          _maxZero(_num(d['remainingAmount']) - difference),
        );
        return <String, Object?>{
          ...d,
          'remainingAmount': nextRemaining,
          'updated_at': nowIso,
          'updatedAt': nowIso,
          'payments': _rows(d['payments'])
              .map<Object?>((Map<String, Object?> p) {
                if (p['id'] != tx['referenceId']) return _copy(p);
                return <String, Object?>{...p}..let((Map<String, Object?> out) {
                  _assign(out, 'amount', newData['amount']);
                  _assign(out, 'date', newData['date']);
                  _assign(out, 'paidFromId', newData['accountId']);
                  _assign(out, 'paidFromType', newData['accountType']);
                  out['updated_at'] = nowIso;
                  out['updatedAt'] = nowIso;
                });
              })
              .toList(),
          'status': nextRemaining == 0 ? 'Fully Repaid' : 'Active',
        };
      }).toList();
    }

    return <String, Object?>{
      ...prev,
      'cashAccounts': updatedCash,
      'cards': updatedCards,
      'incomes': updatedIncomes,
      'expenses': updatedExpenses,
      'debts': updatedDebts,
      'transactions': _rows(prev['transactions'])
          .map<Object?>((Map<String, Object?> t) {
            if (t['id'] != txId) return _copy(t);
            return <String, Object?>{
              ...t,
              ...newData,
              'updated_at': nowIso,
              'updatedAt': nowIso,
            };
          })
          .toList(),
    };
  });

  deps.onCloseTransactionEditor?.call();
  return next;
}

// ---------------------------------------------------------------------------
// the subscription pay dialog's own guard — SubscriptionManagement.tsx:119-137
// ---------------------------------------------------------------------------

/// `executePayment` (`src/components/SubscriptionManagement.tsx:119-137`), the guard
/// that runs *before* [handlePaySubscription].
///
/// It lives with the handlers because `app-handlers.json` measures it: a case whose
/// ledger does not move, which is the only way the harness can record a refusal.
///
/// **B-28.** `:124-133` calls a card's `currentBalance` its spendable money. For a
/// credit card that number is the debt, so Travel Credit at `-40,406.29` against a
/// `250,000` limit fails `availableBalance < sub.amount + chargeVal` and the dialog
/// refuses a payment the user can absolutely make. Two consequences, both measured:
/// `handlePaySubscription`'s debit-only alert rule (`App.tsx:2223`) is unreachable from
/// this screen, and the credit card stays selectable in the list — the user gets a
/// dead option and an "Insufficient" message that quotes a negative balance as the
/// money they have. Replicated bug-compatible per rule 5; the fix is a joint web+mobile
/// change after parity (`parity/BUGS_FOUND.md` B-28).
Object? subscriptionPayDialogAuthorize(
  HandlerDeps deps,
  Map<String, Object?> state,
  String? selectedSubId,
  String payAccountId,
  String payAccountType,
  String payDate,
  String payBankCharge,
) {
  if (selectedSubId == null || selectedSubId.isEmpty) return null;
  final Map<String, Object?>? sub = _find(
    _rows(state['subscriptions']),
    selectedSubId,
  );
  if (sub == null) return null;

  num availableBalance = 0;
  if (payAccountType == 'cash') {
    final Object? balance = _find(
      _rows(state['cashAccounts']),
      payAccountId,
    )?['balance'];
    availableBalance = balance == null ? 0 : _num(balance);
  } else {
    final Object? balance = _find(
      _rows(state['cards']),
      payAccountId,
    )?['currentBalance'];
    availableBalance = balance == null ? 0 : _num(balance);
  }
  final num chargeVal = payAccountType == 'card'
      ? _orZero(jsParseFloat(payBankCharge))
      : 0;

  final num required = _num(sub['amount']) + chargeVal;
  if (availableBalance < required) {
    final String currency = _currency(state);
    deps.onToast?.call(
      'error',
      'Insufficient $currency${_localeNumber(deps, required)}, '
          'have $currency${_localeNumber(deps, availableBalance)}',
    );
    return null;
  }

  return handlePaySubscription(
    deps,
    state,
    sub['id']! as String,
    payAccountId,
    payAccountType,
    payDate,
    chargeVal,
  );
}
