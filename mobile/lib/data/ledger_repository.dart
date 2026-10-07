import 'dart:async';
import 'dart:convert';

import '../models/app_state.dart';
import '../models/entities.dart';
import '../models/entities_ledger.dart';
import 'api_policy.dart';
import 'js_semantics.dart';
import 'ledger_gateway.dart';
import 'map_database_result_to_state.dart';
import 'record_builders.dart';
import 'state_storage.dart';

/// `src/supabase.ts:526-853` and `:914-1172` — the whole-state sync engine.
///
/// This is the riskiest unit in the app and the port is deliberately **not** improved
/// (`INVENTORY.md` §6, R4). What it does, in the web's order:
///
/// 1. a **push is refused until a pull has succeeded** in this session for this account
///    ([markEmailAsLoadedFromCloud]) — "prevents blank local state from destroying
///    existing user data";
/// 2. a push whose serialised state equals the last one the server confirmed is
///    **skipped**, and skipping *releases* the dirty marker and the tombstones;
/// 3. otherwise the marker is set **before** the attempt, so an interrupted push leaves a
///    durable trail for the next boot;
/// 4. pushes for one account are **chained**, so the newest state is always the last one
///    to commit; the chain is re-armed as a settled future so a rejected sync cannot
///    poison it;
/// 5. the 14-parameter `sync_complete_ledger` RPC is the only write path, retried on
///    transient failure, and the `ledger_states` JSON mirror is rewritten best-effort
///    after it.
///
/// Everything above is session memory except the marker and the tombstones, which live
/// in [StateStorage]. A phone process that is killed and restarted therefore loses the
/// loaded-from-cloud gate and the chains, and keeps the marker — which is exactly the
/// asymmetry the web's comment describes, and the reason the gate must stay
/// fail-closed.
///
/// Two shapes in here are inert on the web and stay inert here rather than being
/// tidied: the round-trip retry around `doPush`/`doSync` can never fire, because both
/// functions `catch` and *return* a failure instead of throwing, and `retryWithBackoff`
/// only retries a throw. See B-22 in `parity/BUGS_FOUND.md`.
class LedgerRepository {
  LedgerRepository(
    this.gateway,
    this.storage, {
    this.onLog,
    this.retrySleep = realSleep,
    this.pullTimeout = RetryBudget.syncTimeout,
    String Function()? now,
  }) : _now = now ?? nowIso;

  final LedgerGateway gateway;
  final StateStorage storage;

  /// `logger.warn` / `logger.error`. Injected so the safety-guard abort is assertable;
  /// nothing is printed by default.
  final void Function(String message)? onLog;

  /// Passed to [retryWithBackoff]; a test records the delays instead of waiting.
  final Sleeper retrySleep;

  /// `SYNC_TIMEOUT` (`supabase.ts:922`), the wall over the **whole** pull. Shortened
  /// only by a test; `RetryBudget.syncTimeout` is what the app uses.
  final Duration pullTimeout;

  /// `new Date().toISOString()` for the snapshot's `updated_at`. The record builders
  /// take the same seam, so one injected clock pins both. The web evaluates its own
  /// clock **per column** (`supabase.ts:393`, `:395`), not once per push, so this is a
  /// getter called per row rather than a value computed at the top of a sync.
  final String Function() _now;

  String get _nowIso => _now();

  // ---------------------------------------------------------------------------
  // Session state (`supabase.ts:15-45`)
  // ---------------------------------------------------------------------------

  /// `lastSyncedStatesCache` — the serialised state the server last confirmed, per
  /// normalised email.
  final Map<String, String> lastSyncedStatesCache = <String, String>{};

  /// `loadedFromCloudEmails` — the hydration gate.
  final Set<String> loadedFromCloudEmails = <String>{};

  /// `syncChains` — one settled future per account, in initiation order.
  final Map<String, Future<void>> syncChains = <String, Future<void>>{};

  /// `clearSyncedStatesCache` (`:28-30`).
  void clearSyncedStatesCache() => lastSyncedStatesCache.clear();

  /// `markEmailAsLoadedFromCloud` (`:35-37`).
  void markEmailAsLoadedFromCloud(String email) =>
      loadedFromCloudEmails.add(StateStorage.ownerKey(email));

  /// `isEmailLoadedFromCloud` (`:39-41`).
  bool isEmailLoadedFromCloud(String email) =>
      loadedFromCloudEmails.contains(StateStorage.ownerKey(email));

  /// `resetLoadedFromCloud` (`:43-45`). Called on sign-out, so the next account cannot
  /// inherit this one's permission to push.
  void resetLoadedFromCloud() => loadedFromCloudEmails.clear();

  void _log(String message) => onLog?.call(message);

  // ---------------------------------------------------------------------------
  // Push (`syncStateToSupabase`, `:526-853`)
  // ---------------------------------------------------------------------------

  /// The result of a sync attempt: the web's `{ success, error? }`.
  Future<SyncOutcome> syncStateToSupabase(
    String email,
    AppState state, {
    bool bypassSafetyGuard = false,
  }) async {
    // 0. Safety check: never overwrite the database with a state this session has not
    // read (`:531-537`).
    if (!bypassSafetyGuard && !isEmailLoadedFromCloud(email)) {
      _log(
        '[SYNC SAFETY GUARD] Aborted push/auto-sync because the database state has not '
        'been successfully pulled or synchronized in this session yet. This prevents '
        'blank local state from destroying existing user data.',
      );
      return (
        success: false,
        error:
            'Database state has not been successfully fetched in this session.',
      );
    }

    final String currentStateString = canonicalStateJson(state);
    final String cacheKey = StateStorage.ownerKey(email);
    if (lastSyncedStatesCache[cacheKey] == currentStateString) {
      // This exact state already reached the server in this session, so the cloud is
      // not behind it and the durable marker can be released (`:546-552`).
      await storage.clearStateDirty(email);
      await storage.clearTombstones(email);
      return (success: true, error: null);
    }

    // The client holds data the server has not confirmed. Marked **before** the attempt
    // so an interrupted push leaves a trail for the next boot (`:554-557`).
    await storage.markStateDirty(email);

    Future<SyncOutcome> doPush() =>
        _pushOnce(email, state, cacheKey, currentStateString);

    // Serialize per-email, so the most recent state is always the last committed
    // (`:841-851`).
    final Future<SyncOutcome> run = (syncChains[cacheKey] ?? _settled).then(
      (_) => retryWithBackoff<SyncOutcome>(
        doPush,
        budget: RetryBudget.syncRoundTrip,
        sleep: retrySleep,
      ),
    );
    // The chain must never be poisoned by a rejected prior sync.
    syncChains[cacheKey] = run.then<void>(
      (SyncOutcome _) {},
      onError: (Object _) {},
    );
    return run;
  }

  Future<void> get _settled => Future<void>.value();

  Future<SyncOutcome> _pushOnce(
    String email,
    AppState state,
    String cacheKey,
    String currentStateString,
  ) async {
    try {
      final Map<String, Object?> payload = buildSyncRpcPayload(
        state,
        email,
        now: _now,
      );

      // `src/supabase.ts:787-812`. Only a throw retries, which is why the gateway throws
      // and the result is not inspected.
      try {
        await retryWithBackoff<void>(
          () => gateway.syncCompleteLedger(payload),
          budget: RetryBudget.syncRpc,
          sleep: retrySleep,
          onRetry: (int attempt, Object error) => _log(
            '[TRANSACTIONAL SYNC ENGINE] sync_complete_ledger attempt $attempt '
            'failed (${_messageOf(error)}); retrying...',
          ),
        );
      } on Object catch (rpcErr) {
        final String rpcErrorMsg = _messageOf(rpcErr);
        _log(
          '[TRANSACTIONAL SYNC ENGINE] sync_complete_ledger failed after retries: '
          '$rpcErrorMsg',
        );
        return (success: false, error: rpcErrorMsg);
      }

      lastSyncedStatesCache[cacheKey] = currentStateString;
      // Server-confirmed: the cloud holds this state, so the durable marker is released
      // and a later boot may accept the cloud copy over the local mirror (`:814-819`).
      await storage.clearStateDirty(email);
      await storage.clearTombstones(email);

      // Always rewrite the full JSON snapshot even though the RPC succeeded: the app
      // falls back to it when the relational read is blocked by RLS, so subscriptions
      // can be lost from the restored view if it goes stale (`:820-833`).
      try {
        await gateway.upsertLedgerSnapshot(
          email: email,
          state: state.toJsonForPush(),
          updatedAtIso: _nowIso,
        );
      } on Object catch (jsonErr) {
        _log('[SYNC] ledger_states snapshot upsert failed after RPC: $jsonErr');
      }
      return (success: true, error: null);
    } on Object catch (err) {
      // `:835-838` — the outer catch. `err instanceof Error ? err.message :
      // 'Database transaction error.'` is a *fixed* fallback here, unlike the RPC catch,
      // so a non-Error throw loses its detail on the web too.
      _log('Supabase State Push Error: $err');
      return (
        success: false,
        error: err is LedgerErrorException
            ? err.message
            : (err is Exception || err is Error
                  ? err.toString()
                  : 'Database transaction error.'),
      );
    }
  }

  /// `JSON.stringify(state)` as the phone can write it: the typed model's own
  /// canonical form, key order fixed by `toJson`.
  ///
  /// Both sides of [lastSyncedStatesCache] are produced here, so the skip test means
  /// "nothing the model can hold has changed". That is why the seven pull timestamps
  /// could not be dropped from the entities: a model that forgets `updatedAt` makes two
  /// different states compare equal, and the skip path then clears the tombstones for a
  /// state the server has never seen.
  static String canonicalStateJson(AppState state) {
    // `jsonEncode` of the same map is byte-stable, because `toJson` writes its keys in
    // declaration order and every collection keeps its list order.
    return _jsonEncode(state.toJson());
  }

  // ---------------------------------------------------------------------------
  // Pull (`syncStateFromSupabase`, `:914-1172`)
  // ---------------------------------------------------------------------------

  /// Reads the ledger back and rebuilds [AppState] from the relational tables, the
  /// `ledger_states` JSON and the profile row.
  ///
  /// Fails **by value**, not by exception, for anything the web catches — but the
  /// 15-second wall sits *outside* the try, so a timeout escapes as a rejected
  /// [JsError] carrying the web's own `syncStateFromSupabase timed out after 15000ms`,
  /// exactly as the rejected promise does for `App.tsx:599`.
  Future<PullOutcome> syncStateFromSupabase(String email) {
    return withTimeout<PullOutcome>(
      retryWithBackoff<PullOutcome>(
        () => _pullOnce(email),
        budget: RetryBudget.syncRoundTrip,
        sleep: retrySleep,
      ),
      pullTimeout,
      label: 'syncStateFromSupabase',
    );
  }

  Future<PullOutcome> _pullOnce(String email) async {
    try {
      // 1. The ten relational reads, concurrently as `Promise.all` runs them
      // (`:927-954`), in the web's order so the indices below line up. A missing table
      // means "no rows"; any other failure aborts the whole pull, because `Promise.all`
      // rejects on the first one.
      const List<String> tableNames = <String>[
        'bank_cards',
        'cash_accounts',
        'transactions',
        'debts',
        'incomes',
        'expenses',
        'notifications',
        'spending_envelopes',
        'credit_card_installments',
        'credit_card_installment_payments',
      ];
      final List<List<Map<String, Object?>>> tables = await Future.wait(
        tableNames.map(_fetchTable),
      );
      final List<Map<String, Object?>> cards = tables[0];
      final List<Map<String, Object?>> cash = tables[1];
      final List<Map<String, Object?>> transactions = tables[2];
      final List<Map<String, Object?>> debts = tables[3];
      final List<Map<String, Object?>> incomes = tables[4];
      final List<Map<String, Object?>> expenses = tables[5];
      final List<Map<String, Object?>> notifications = tables[6];
      final List<Map<String, Object?>> envelopes = tables[7];
      final List<Map<String, Object?>> installments = tables[8];
      final List<Map<String, Object?>> instPayments = tables[9];

      // 2. The four parallel reads, each of which swallows its own error (`:980-1072`).
      final _Results side = await _readSideTables(email);

      final Map<String, Object?>? snapshot = side.snapshot;
      List<Object?> stagedEntries(String key) {
        final Object? value = snapshot?[key];
        return value is List ? value : const <Object?>[];
      }

      // `profileName = 'User'` then `if (authAcc.name)` — an empty or absent name leaves
      // the placeholder, which is why the gate is truthiness and not nullness.
      final String profileName = side.profileName ?? 'User';
      final Object? avatarUrl = jsFirstTruthy(<Object?>[
        side.profileAvatarUrl,
        side.snapshotAvatarUrl,
      ]);

      // "Does this user have a real database setup" — differentiates a new account from
      // a loaded empty one (`:1076-1078`).
      final bool hasUserDatabaseRecords =
          side.hasLedgerStateRecord ||
          cards.isNotEmpty ||
          cash.isNotEmpty ||
          transactions.isNotEmpty ||
          debts.isNotEmpty;

      final List<BankCard> mergedCards = _getListField<BankCard>(
        cards,
        snapshot?['cards'],
        BankCard.fromJson,
      );
      final List<CashAccount> mergedCash = _getListField<CashAccount>(
        cash,
        snapshot?['cashAccounts'],
        CashAccount.fromJson,
      );

      final AppState reconstructed = AppState(
        userProfile: UserProfile(
          name: profileName,
          email: email,
          avatarUrl: avatarUrl as String?,
        ),
        cashAccounts: mergedCash,
        cards: mergedCards,
        // **`creditCards` and `creditCardPurchases` are in no fetch and in no RPC
        // parameter.** `reconstructedState` starts from `...DEFAULT_APP_STATE` and never
        // sets either key. `creditCards` is harmless: the screens filter `state.cards`
        // instead (`App.tsx:4495`) and nothing writes the field, so the phone keeps the
        // seed. `creditCardPurchases` was not: the installment flows write it
        // (`App.tsx:2374`, `:3306`), `CreditCardManagement.tsx:814` renders it, every push
        // copies it into the snapshot, and the pull used to ignore the snapshot's copy — so
        // a re-hydration emptied it and the next push destroyed the only cloud copy. B-23.
        // Ruled a **web-side fix**, then ported: this line is now the Dart twin of
        // `src/supabase.ts:1155-1158`, and the snapshot's array wins whenever it is one,
        // including when it is empty.
        creditCards: AppState.defaultValue().creditCards,
        creditCardPurchases: _snapshotPurchases(
          snapshot?['creditCardPurchases'],
        ),
        creditCardInstallments: _getListField<CreditCardInstallment>(
          installments,
          snapshot?['creditCardInstallments'],
          CreditCardInstallment.fromJson,
        ),
        creditCardInstallmentPayments:
            _getListField<CreditCardInstallmentPayment>(
              instPayments,
              snapshot?['creditCardInstallmentPayments'],
              CreditCardInstallmentPayment.fromJson,
            ),
        incomes: _getListField<Income>(
          incomes,
          snapshot?['incomes'],
          Income.fromJson,
        ),
        expenses: _getListField<Expense>(
          expenses,
          snapshot?['expenses'],
          Expense.fromJson,
        ),
        debts: _getListField<Debt>(debts, snapshot?['debts'], Debt.fromJson),
        transactions: _getListField<Transaction>(
          transactions,
          snapshot?['transactions'],
          Transaction.fromJson,
        ),
        notifications: _getListField<AppNotification>(
          notifications,
          snapshot?['notifications'],
          AppNotification.fromJson,
        ),
        subscriptions: _mergeSubscriptions(
          side.subscriptions,
          snapshot?['subscriptions'],
        ),
        loansGiven: _preferRelationalThenJson<LoanGiven>(
          side.loansGiven,
          stagedEntries('loansGiven'),
          LoanGiven.fromJson,
        ),
        budgets: _pickBudgets(
          envelopes,
          stagedEntries('budgets'),
          hasUserDatabaseRecords,
        ),
        savingsGoals: _pickSavingsGoals(
          stagedEntries('savingsGoals'),
          hasUserDatabaseRecords,
        ),
        pinCode: _typedString(snapshot?['pinCode']) ?? '',
        pinEnabled: _typedBool(snapshot?['pinEnabled']) ?? false,
        currency: _typedString(snapshot?['currency']) ?? 'Rs.',
      );

      final String cacheKey = StateStorage.ownerKey(email);
      lastSyncedStatesCache[cacheKey] = canonicalStateJson(reconstructed);
      markEmailAsLoadedFromCloud(email);

      return (success: true, state: reconstructed, error: null);
    } on Object catch (err) {
      _log('Supabase State Pull Error: $err');
      return (
        success: false,
        state: null,
        error: err is LedgerErrorException
            ? err.message
            : (err is Exception || err is Error
                  ? err.toString()
                  : 'Database transaction error.'),
      );
    }
  }

  Future<_Results> _readSideTables(String email) async {
    final Future<List<Map<String, Object?>>> subs = _guardedList(
      () => gateway.fetchSubscriptions(email),
      'Subscriptions fetch skipped:',
    );
    final Future<Map<String, Object?>?> profile = _guardedRow(
      () => gateway.fetchAuthAccount(email),
      'Profile fetch skipped:',
    );
    // `fetchLedger` (`:1020-1055`) is the one side read whose failure is *partial*:
    // `hasLedgerStateRecord` is set at `:1036`, **before** the JSON body is looked at,
    // so a row holding an unparseable string still tells the pull this account has a
    // database — and its envelopes and jars then do not fall back to the seed. The
    // warning the web logs comes from `JSON.parse` throwing inside that same `try`.
    // The two mutable locals are the web's own `let`s, written from the concurrent read.
    bool hasLedgerStateRecord = false;
    Map<String, Object?>? snapshotJson;
    final Future<void> ledger = () async {
      try {
        final LedgerSnapshot row = await gateway.fetchLedgerSnapshot(email);
        if (!row.exists) {
          return;
        }
        hasLedgerStateRecord = true;
        final Object? decoded = row.decode();
        // `if (fullJsonStateStr)` then property reads on it — an array or a scalar
        // decodes to something with no fields, which is "no snapshot", not an error.
        if (decoded is Map<String, Object?>) {
          snapshotJson = decoded;
        }
      } on Object catch (e) {
        _log('Ledger state fetch skipped: $e');
      }
    }();

    // The four reads are started in the web's `Promise.all` order (`:1072`), which is
    // also the order their warnings are logged when all four fail at once.
    final Future<List<Map<String, Object?>>> loans = _guardedList(
      () => gateway.fetchLoansGiven(email),
      'Loans given fetch skipped:',
    );

    final List<Object?> done = await Future.wait(<Future<Object?>>[
      subs,
      profile,
      ledger,
      loans,
    ]);

    // `maybeSingle()` — no row is a successful read of `null`, so these come out of
    // the wait as nullable values and must not be force-unwrapped.
    final Map<String, Object?>? authAccount = done[1] as Map<String, Object?>?;

    // `if (authAcc) { if (authAcc.name) … }` — both are truthiness gates, so an empty
    // name leaves the placeholder (`:1011-1014`).
    final Object? rawName = authAccount?['name'];
    final Object? rawAvatar = authAccount?['avatar_url'];

    // `typeof profile === 'object' && !Array.isArray(profile)` and then
    // `typeof avatar === 'string'` (`:1042-1044`). An empty string is read *here* and
    // only dropped later, by the truthiness chain at `:1114`.
    String? snapshotAvatar;
    final Object? profileMap = snapshotJson?['userProfile'];
    if (profileMap is Map<String, Object?> &&
        profileMap['avatarUrl'] is String) {
      snapshotAvatar = profileMap['avatarUrl']! as String;
    }

    return _Results(
      // Raw, as `fetchSubs` leaves them: `mergeSubscriptions` is what maps them, and
      // mapping twice would re-camelCase an already-camelCase key set.
      subscriptions: done[0]! as List<Map<String, Object?>>,
      // `fetchLoans` maps in place (`:1065`), so the rows arrive already converted.
      loansGiven: (done[3]! as List<Map<String, Object?>>)
          .map(mapDatabaseResultToState)
          .toList(),
      profileName: jsTruthy(rawName) ? rawName.toString() : null,
      profileAvatarUrl: jsTruthy(rawAvatar) ? rawAvatar.toString() : null,
      hasLedgerStateRecord: hasLedgerStateRecord,
      snapshot: snapshotJson,
      snapshotAvatarUrl: snapshotAvatar,
    );
  }

  Future<List<Map<String, Object?>>> _fetchTable(String table) async {
    try {
      final List<Map<String, Object?>> rows = await gateway.fetchTable(table);
      return rows;
    } on LedgerErrorException catch (e) {
      if (e.isMissingTable) return const <Map<String, Object?>>[];
      rethrow;
    }
  }

  Future<List<Map<String, Object?>>> _guardedList(
    Future<List<Map<String, Object?>>> Function() read,
    String warning,
  ) async {
    try {
      return await read();
    } on Object catch (e) {
      _log('$warning $e');
      return const <Map<String, Object?>>[];
    }
  }

  Future<Map<String, Object?>?> _guardedRow(
    Future<Map<String, Object?>?> Function() read,
    String warning,
  ) async {
    try {
      return await read();
    } on Object catch (e) {
      _log('$warning $e');
      return null;
    }
  }

  /// `getListField` (`:1081-1089`): the table wins if it returned anything, otherwise
  /// the JSON snapshot, otherwise nothing.
  List<T> _getListField<T>(
    List<Map<String, Object?>> tableData,
    Object? jsonField,
    T Function(Map<String, Object?>) parse,
  ) {
    if (tableData.isNotEmpty) {
      return tableData
          .map(
            (Map<String, Object?> row) => parse(mapDatabaseResultToState(row)),
          )
          .toList();
    }
    if (jsonField is List && jsonField.isNotEmpty) {
      return _parseJsonEntries<T>(jsonField, parse);
    }
    return <T>[];
  }

  /// The web casts the JSON array straight to the entity type and never re-maps it, so a
  /// snapshot written by this same model parses back unchanged. An entry that is not an
  /// object is a corrupt snapshot: the phone drops it, the browser keeps a row of
  /// `undefined`s that only shows up when something reads it.
  List<T> _parseJsonEntries<T>(
    List<Object?> entries,
    T Function(Map<String, Object?>) parse,
  ) {
    final List<T> out = <T>[];
    for (final Object? entry in entries) {
      if (entry is Map<String, Object?>) out.add(parse(entry));
    }
    return out;
  }

  /// B-23 — the Dart twin of `Array.isArray(jsonState.creditCardPurchases) ? … :
  /// DEFAULT_APP_STATE.creditCardPurchases` (`src/supabase.ts:1155-1158`, added by the
  /// web-side fix on `bugfix/b23-credit-card-purchases`). `credit_card_purchases` has no
  /// relational table and is not a `sync_complete_ledger` parameter, so the snapshot is
  /// this collection's only cloud copy and this is its only read: returning the seed here
  /// is what let a re-hydration push `[]` over it.
  ///
  /// An **empty** snapshot array is honoured, not treated as absent — that is what a user
  /// who deleted every purchase pushed. Today the two branches agree (`defaultValue()` is
  /// `const []`, `app_state.dart:70`), so this is structural parity with the web rather
  /// than a behaviour difference; it is written as the web is written so the two cannot
  /// drift if the seed ever stops being empty.
  List<CreditCardPurchase> _snapshotPurchases(Object? jsonField) {
    if (jsonField is! List) {
      return AppState.defaultValue().creditCardPurchases;
    }
    return _parseJsonEntries<CreditCardPurchase>(
      jsonField,
      CreditCardPurchase.fromJson,
    );
  }

  /// `mergeSubscriptions` (`:1091-1107`) — **and the finding it carries.** The comment
  /// says the relational read wins ("union both by id"), the code gives the JSON copy
  /// the last word: the loop runs relational first, so a shared id is already present
  /// when the JSON entry arrives, and `else if (relationalMapped.some(… id …))` is
  /// true *because* the relational table had it — overwriting with the snapshot. B-24.
  List<Subscription> _mergeSubscriptions(
    List<Map<String, Object?>> relational,
    Object? jsonField,
  ) {
    final List<Map<String, Object?>> relationalMapped = relational
        .map(mapDatabaseResultToState)
        .toList();
    final Set<Object?> relationalIds = relationalMapped
        .map((Map<String, Object?> r) => r['id'])
        .where(jsTruthy)
        .toSet();
    final List<Object?> jsonArr = jsonField is List
        ? jsonField
        : const <Object?>[];
    final Map<Object, Map<String, Object?>> byId =
        <Object, Map<String, Object?>>{};
    // One loop over the concatenation, as the web writes it — a **duplicate id inside
    // the relational result is resolved last-wins** by the `else if` branch, which a
    // `putIfAbsent`-style merge would silently turn into first-wins.
    for (final Map<String, Object?> entry in <Map<String, Object?>>[
      ...relationalMapped,
      ...jsonArr.whereType<Map<String, Object?>>(),
    ]) {
      final Object? id = entry['id'];
      if (!jsTruthy(id)) continue;
      if (!byId.containsKey(id)) {
        byId[id!] = entry;
      } else if (relationalIds.contains(id)) {
        byId[id!] = entry;
      }
    }
    // `Array.from(byId.values())` keeps insertion order, and re-`set`ting an existing
    // key does not move it in either a JS `Map` or a Dart one, so the row order matches.
    return byId.values.map(Subscription.fromJson).toList();
  }

  /// `loansGiven` / `budgets` / `savingsGoals` chains (`:1124-1147`): the relational
  /// table, then the snapshot fields the pull already staged, then the snapshot proper,
  /// then — for the last two — the empty seed.
  List<T> _preferRelationalThenJson<T>(
    List<Map<String, Object?>> relational,
    List<Object?> jsonEntries,
    T Function(Map<String, Object?>) parse,
  ) {
    if (relational.isNotEmpty) {
      return relational.map(parse).toList();
    }
    if (jsonEntries.isNotEmpty) return _parseJsonEntries<T>(jsonEntries, parse);
    return <T>[];
  }

  List<Budget> _pickBudgets(
    List<Map<String, Object?>> envelopes,
    List<Object?> stagedBudgets,
    bool hasUserDatabaseRecords,
  ) {
    if (envelopes.isNotEmpty) {
      return envelopes
          .map(
            (Map<String, Object?> r) =>
                Budget.fromJson(mapDatabaseResultToState(r)),
          )
          .toList();
    }
    if (stagedBudgets.isNotEmpty) {
      return _parseJsonEntries<Budget>(stagedBudgets, Budget.fromJson);
    }
    if (hasUserDatabaseRecords) return <Budget>[];
    // `DEFAULT_APP_STATE.budgets` is `[]` today (`src/initialData.ts:46`), so this
    // branch is currently indistinguishable from the one above. Kept because the seed
    // is what makes it differ if it ever stops being empty.
    return AppState.defaultValue().budgets;
  }

  List<SavingsGoal> _pickSavingsGoals(
    List<Object?> stagedGoals,
    bool hasUserDatabaseRecords,
  ) {
    if (stagedGoals.isNotEmpty) {
      return _parseJsonEntries<SavingsGoal>(stagedGoals, SavingsGoal.fromJson);
    }
    if (hasUserDatabaseRecords) return <SavingsGoal>[];
    return AppState.defaultValue().savingsGoals;
  }

  /// `typeof x === 'string' ? x : DEFAULT` (`:1150-1153`) — a number in the JSON is not
  /// a string, and a `null` is not either.
  static String? _typedString(Object? value) => value is String ? value : null;

  /// `typeof x === 'boolean' ? x : DEFAULT`.
  static bool? _typedBool(Object? value) => value is bool ? value : null;

  static String _messageOf(Object err) =>
      err is LedgerErrorException ? err.message : err.toString();
}

/// `JSON.stringify` with the web's key order preserved: `toJson()` already builds the
/// map in declaration order, and `jsonEncode` writes a `Map` in iteration order.
String _jsonEncode(Object? value) => const JsonEncoder().convert(value);

/// The four side-table reads of the pull path, after each has been defaulted by its own
/// `catch`.
class _Results {
  _Results({
    required this.subscriptions,
    required this.loansGiven,
    required this.hasLedgerStateRecord,
    required this.profileName,
    required this.profileAvatarUrl,
    required this.snapshot,
    required this.snapshotAvatarUrl,
  });

  final List<Map<String, Object?>> subscriptions;
  final List<Map<String, Object?>> loansGiven;
  final bool hasLedgerStateRecord;
  final String? profileName;
  final String? profileAvatarUrl;
  final Map<String, Object?>? snapshot;
  final String? snapshotAvatarUrl;
}

/// The web's `{ success, error? }` from `syncStateToSupabase`.
typedef SyncOutcome = ({bool success, String? error});

/// The web's `{ success, state?, error? }` from `syncStateFromSupabase`.
typedef PullOutcome = ({bool success, AppState? state, String? error});
