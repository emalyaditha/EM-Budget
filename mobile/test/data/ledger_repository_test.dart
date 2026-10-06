import 'dart:async';

import 'package:em_budget/data/api_policy.dart';
import 'package:em_budget/data/key_value_store.dart';
import 'package:em_budget/data/ledger_gateway.dart';
import 'package:em_budget/data/ledger_repository.dart';
import 'package:em_budget/data/state_storage.dart';
import 'package:em_budget/models/app_state.dart';
import 'package:em_budget/models/entities_ledger.dart';
import 'package:flutter_test/flutter_test.dart';

const String email = 'Owner@Example.com';
const String owner = 'owner@example.com';
const String pinned = '2026-10-04T04:30:00.000Z';

Map<String, Object?> tx(String id, Object? amount) => <String, Object?>{
  'id': id,
  'type': 'expense',
  'title': id,
  'amount': amount,
  'date': '2026-10-01',
  'category': 'Groceries',
};

/// A gateway that answers like PostgREST and does nothing else: rows when told to,
/// a [LedgerErrorException] when told to, and a recorded call list either way.
class StubGateway implements LedgerGateway {
  Map<String, Object?> tables = <String, Object?>{};
  Set<String> hang = <String>{};

  List<Map<String, Object?>> subscriptions = <Map<String, Object?>>[];
  Object? subscriptionsError;
  Map<String, Object?>? authAccount;
  Object? authAccountError;
  LedgerSnapshot snapshot = const LedgerSnapshot.none();
  Object? snapshotError;
  List<Map<String, Object?>> loansGiven = <Map<String, Object?>>[];
  Object? loansGivenError;

  final List<String> tableCalls = <String>[];
  final List<Map<String, Object?>> syncPayloads = <Map<String, Object?>>[];

  /// One-shot gates consumed per RPC attempt, so a test can hold a push mid-flight
  /// and release attempts in a chosen order.
  final List<Completer<void>> gates = <Completer<void>>[];
  int syncFailures = 0;
  Object syncError = const LedgerErrorException('rpc exploded');

  int snapshotWrites = 0;
  Map<String, Object?>? lastPushedState;
  String? lastSnapshotUpdatedAt;
  Object? snapshotWriteError;

  int get syncCalls => syncPayloads.length;

  @override
  Future<List<Map<String, Object?>>> fetchTable(String table) async {
    tableCalls.add(table);
    if (hang.contains(table)) {
      await Completer<void>().future;
    }
    final Object? value = tables[table];
    if (value is LedgerErrorException) {
      throw value;
    }
    return value as List<Map<String, Object?>>? ??
        const <Map<String, Object?>>[];
  }

  @override
  Future<List<Map<String, Object?>>> fetchSubscriptions(String _) async {
    final Object? error = subscriptionsError;
    if (error != null) {
      throw error;
    }
    return subscriptions;
  }

  @override
  Future<Map<String, Object?>?> fetchAuthAccount(String _) async {
    final Object? error = authAccountError;
    if (error != null) {
      throw error;
    }
    return authAccount;
  }

  @override
  Future<LedgerSnapshot> fetchLedgerSnapshot(String _) async {
    final Object? error = snapshotError;
    if (error != null) {
      throw error;
    }
    return snapshot;
  }

  @override
  Future<List<Map<String, Object?>>> fetchLoansGiven(String _) async {
    final Object? error = loansGivenError;
    if (error != null) {
      throw error;
    }
    return loansGiven;
  }

  @override
  Future<void> syncCompleteLedger(Map<String, Object?> payload) async {
    syncPayloads.add(payload);
    if (gates.isNotEmpty) {
      await gates.removeAt(0).future;
    }
    if (syncFailures > 0) {
      syncFailures--;
      throw syncError;
    }
  }

  @override
  Future<void> upsertLedgerSnapshot({
    required String email,
    required Map<String, Object?> state,
    required String updatedAtIso,
  }) async {
    snapshotWrites++;
    lastPushedState = state;
    lastSnapshotUpdatedAt = updatedAtIso;
    final Object? error = snapshotWriteError;
    if (error != null) {
      throw error;
    }
  }
}

void main() {
  late StubGateway gateway;
  late InMemoryKeyValueStore store;
  late StateStorage storage;
  late List<String> logs;
  late List<Duration> sleeps;
  late LedgerRepository repo;

  /// `retrySleep` is recorded rather than waited, so the web's back-off schedule is an
  /// assertion instead of a two-second test.
  Future<void> recordSleep(Duration delay) async => sleeps.add(delay);

  void build({Duration pullTimeout = RetryBudget.syncTimeout}) {
    gateway = StubGateway();
    store = InMemoryKeyValueStore();
    storage = StateStorage(store);
    logs = <String>[];
    sleeps = <Duration>[];
    repo = LedgerRepository(
      gateway,
      storage,
      onLog: logs.add,
      retrySleep: recordSleep,
      pullTimeout: pullTimeout,
      now: () => pinned,
    );
  }

  setUp(() => build());

  AppState localLedger([num amount = 100]) =>
      AppState.fromJson(<String, Object?>{
        'currency': 'Rs.',
        'transactions': <Map<String, Object?>>[tx('t1', amount)],
      });

  /// The gate opens on a successful pull; nearly every push test needs it first.
  void allowPush() => repo.markEmailAsLoadedFromCloud(email);

  Future<AppState> pullState() async {
    final PullOutcome pulled = await repo.syncStateFromSupabase(email);
    expect(pulled.success, isTrue, reason: '${pulled.error}');
    return pulled.state!;
  }

  group('the never-push-before-pull gate', () {
    test('refuses the push, says why, and writes nothing', () async {
      final SyncOutcome outcome = await repo.syncStateToSupabase(
        email,
        localLedger(),
      );
      expect(outcome.success, isFalse);
      expect(
        outcome.error,
        'Database state has not been successfully fetched in this session.',
      );
      expect(
        logs.single,
        contains('[SYNC SAFETY GUARD] Aborted push/auto-sync'),
      );
      expect(gateway.syncCalls, 0);
      // Refusing must not leave a dirty marker either — nothing was ever pending.
      expect(store.backing[StateStorage.dirtyOwnerKey], isNull);
      expect(store.log, isEmpty);
    });

    test('the bypass flag is what a manual sync uses', () async {
      final SyncOutcome outcome = await repo.syncStateToSupabase(
        email,
        localLedger(),
        bypassSafetyGuard: true,
      );
      expect(outcome.success, isTrue);
      expect(gateway.syncCalls, 1);
      expect(logs, isEmpty);
    });

    test('a successful pull opens it and a failed one does not', () async {
      await repo.syncStateFromSupabase(email);
      expect(repo.isEmailLoadedFromCloud(email), isTrue);

      build();
      gateway.tables['debts'] = const LedgerErrorException(
        'permission denied for table debts',
        code: '42501',
      );
      expect((await repo.syncStateFromSupabase(email)).success, isFalse);
      expect(repo.isEmailLoadedFromCloud(email), isFalse);
      expect(
        (await repo.syncStateToSupabase(email, localLedger())).success,
        isFalse,
      );
    });

    test('sign-out closes it again', () async {
      allowPush();
      expect(repo.isEmailLoadedFromCloud('  OWNER@example.com  '), isTrue);
      repo.resetLoadedFromCloud();
      expect(repo.isEmailLoadedFromCloud(email), isFalse);
    });

    test('one account cannot push on another\'s permission', () async {
      repo.markEmailAsLoadedFromCloud('someone@example.com');
      expect(
        (await repo.syncStateToSupabase(email, localLedger())).success,
        isFalse,
      );
    });
  });

  group('the equality skip', () {
    test('a state already confirmed this session is not sent again', () async {
      allowPush();
      final AppState state = localLedger();
      expect((await repo.syncStateToSupabase(email, state)).success, isTrue);
      expect(gateway.syncCalls, 1);

      // A pending marker and tombstones from the edit that produced this state: the
      // server already holds the state, so skipping must still release both
      // (`:546-552`).
      await storage.markStateDirty(email);
      await storage.recordDeletions(email, <String>['t0']);
      expect(await storage.isStateDirty(email), isTrue);

      expect((await repo.syncStateToSupabase(email, state)).success, isTrue);
      expect(
        gateway.syncCalls,
        1,
        reason: 'the second push must not reach the RPC',
      );
      expect(await storage.isStateDirty(email), isFalse);
      expect(await storage.getTombstonedIds(email), isEmpty);
    });

    test('a different state is sent', () async {
      allowPush();
      await repo.syncStateToSupabase(email, localLedger());
      await repo.syncStateToSupabase(email, localLedger(101));
      expect(gateway.syncCalls, 2);
    });

    test('emptying the ledger is a change, not a no-op', () async {
      // This is the branch the whole guard exists to protect: a blank state that
      // compared equal to nothing would be pushed over a full cloud ledger.
      allowPush();
      await repo.syncStateToSupabase(email, localLedger());
      await repo.syncStateToSupabase(email, AppState.defaultValue());
      expect(gateway.syncCalls, 2);
      expect(gateway.syncPayloads.last['p_transactions'], isEmpty);
    });

    test('clearing the session cache forces a re-push', () async {
      allowPush();
      final AppState state = localLedger();
      await repo.syncStateToSupabase(email, state);
      repo.clearSyncedStatesCache();
      await repo.syncStateToSupabase(email, state);
      expect(gateway.syncCalls, 2);
    });

    test('the cache is keyed by the normalised address', () async {
      allowPush();
      final AppState state = localLedger();
      await repo.syncStateToSupabase(email, state);
      await repo.syncStateToSupabase('  owner@example.COM ', state);
      expect(gateway.syncCalls, 1);
    });
  });

  group('the durable marker around an attempt', () {
    test(
      'is set before the RPC runs and cleared once it is confirmed',
      () async {
        allowPush();
        final Completer<void> hold = Completer<void>();
        gateway.gates.add(hold);
        final Future<SyncOutcome> pending = repo.syncStateToSupabase(
          email,
          localLedger(),
        );
        await Future<void>.delayed(Duration.zero);
        // `:554-557` — set before the attempt, so a process killed mid-push leaves the
        // trail the next boot reads.
        expect(store.backing[StateStorage.dirtyOwnerKey], owner);
        hold.complete();
        expect((await pending).success, isTrue);
        expect(store.backing[StateStorage.dirtyOwnerKey], isNull);
      },
    );

    test('survives a failed push', () async {
      allowPush();
      gateway.syncFailures = 99;
      expect(
        (await repo.syncStateToSupabase(email, localLedger())).success,
        isFalse,
      );
      expect(await storage.isStateDirty(email), isTrue);
    });

    test(
      'is released by a skipped push even though nothing was sent',
      () async {
        allowPush();
        final AppState state = localLedger();
        await repo.syncStateToSupabase(email, state);
        await storage.markStateDirty(email);
        await repo.syncStateToSupabase(email, state);
        expect(await storage.isStateDirty(email), isFalse);
      },
    );
  });

  group('the per-email chain', () {
    test('commits pushes in the order they were initiated', () async {
      allowPush();
      final Completer<void> first = Completer<void>();
      final Completer<void> second = Completer<void>();
      gateway.gates.addAll(<Completer<void>>[first, second]);

      final AppState a = localLedger();
      final AppState b = localLedger(200);
      final Future<SyncOutcome> runA = repo.syncStateToSupabase(email, a);
      await Future<void>.delayed(Duration.zero);
      final Future<SyncOutcome> runB = repo.syncStateToSupabase(email, b);
      await Future<void>.delayed(Duration.zero);

      // A is still inside the RPC, so B is queued behind it rather than racing it.
      expect(gateway.syncCalls, 1);
      first.complete();
      await Future<void>.delayed(Duration.zero);
      expect(gateway.syncCalls, 2);
      second.complete();

      await runA;
      await runB;
      expect(gateway.syncPayloads[0]['p_state'], a.toJsonForPush());
      expect(gateway.syncPayloads[1]['p_state'], b.toJsonForPush());
    });

    test('a rejected sync does not poison the chain', () async {
      allowPush();
      gateway.syncFailures = 999;
      expect(
        (await repo.syncStateToSupabase(email, localLedger())).success,
        isFalse,
      );
      gateway.syncFailures = 0;
      expect(
        (await repo.syncStateToSupabase(email, localLedger(7))).success,
        isTrue,
      );
    });

    test('two accounts chain independently', () async {
      repo.markEmailAsLoadedFromCloud(owner);
      repo.markEmailAsLoadedFromCloud('second@example.com');
      final Completer<void> hold = Completer<void>();
      gateway.gates.add(hold);
      final Future<SyncOutcome> first = repo.syncStateToSupabase(
        email,
        localLedger(),
      );
      await Future<void>.delayed(Duration.zero);
      final Future<SyncOutcome> other = repo.syncStateToSupabase(
        'second@example.com',
        localLedger(),
      );
      // Different cache keys, so the second is not queued behind the first. It still
      // needs its own turn to get from the durability write to the RPC.
      await Future<void>.delayed(Duration.zero);
      expect(gateway.syncCalls, 2);
      hold.complete();
      expect((await first).success, isTrue);
      expect((await other).success, isTrue);
    });
  });

  group('the RPC retry', () {
    test('fails twice then succeeds, on the web\'s schedule', () async {
      allowPush();
      gateway.syncFailures = 2;
      expect(
        (await repo.syncStateToSupabase(email, localLedger())).success,
        isTrue,
      );
      // `SYNC_RPC_RETRY` is maxRetries 2, base 500 ms, and the delay doubles off the
      // 0-based index of the attempt that failed.
      expect(gateway.syncCalls, 3);
      expect(sleeps, <Duration>[
        const Duration(milliseconds: 500),
        const Duration(milliseconds: 1000),
      ]);
      expect(
        logs,
        containsAllInOrder(<Object>[
          contains('attempt 1 failed (rpc exploded); retrying...'),
          contains('attempt 2 failed (rpc exploded); retrying...'),
        ]),
      );
    });

    test('exhausts at three attempts and reports the last error', () async {
      allowPush();
      gateway.syncFailures = 99;
      gateway.syncError = const LedgerErrorException('still down');
      final SyncOutcome outcome = await repo.syncStateToSupabase(
        email,
        localLedger(),
      );
      expect(outcome.success, isFalse);
      expect(outcome.error, 'still down');
      expect(
        logs,
        contains(
          '[TRANSACTIONAL SYNC ENGINE] sync_complete_ledger failed after retries: '
          'still down',
        ),
      );
    });

    test('the round-trip retry around the push is inert', () async {
      // B-22: `doPush` returns a failure instead of throwing, so the
      // `retryWithBackoff` wrapped around it sees a successful call every time and
      // never sleeps. A push therefore costs three RPC attempts at most, not nine.
      allowPush();
      gateway.syncFailures = 99;
      await repo.syncStateToSupabase(email, localLedger());
      expect(gateway.syncCalls, 3);
      expect(sleeps.length, 2);
    });

    test('a rejected transport is retried, a refused state is not', () async {
      // The equality skip and the safety gate return before the chain, so they never
      // reach the retry at all.
      gateway.syncFailures = 99;
      await repo.syncStateToSupabase(email, localLedger());
      expect(gateway.syncCalls, 0);
      expect(sleeps, isEmpty);
    });
  });

  group('the JSON mirror after a confirmed RPC', () {
    test(
      'is written with the sanitised state and the injected clock',
      () async {
        allowPush();
        await repo.syncStateToSupabase(email, localLedger());
        expect(gateway.snapshotWrites, 1);
        expect(gateway.lastSnapshotUpdatedAt, pinned);
        expect(gateway.lastPushedState!['pinCode'], '');
        expect(
          gateway.syncPayloads.single['p_state'],
          gateway.lastPushedState,
          reason: 'p_state and the mirror are the same sanitised object',
        );
      },
    );

    test('a mirror failure does not fail the push', () async {
      allowPush();
      gateway.snapshotWriteError = const LedgerErrorException(
        'json upsert 500',
      );
      final SyncOutcome outcome = await repo.syncStateToSupabase(
        email,
        localLedger(),
      );
      expect(outcome.success, isTrue);
      expect(
        logs.single,
        contains('[SYNC] ledger_states snapshot upsert failed after RPC:'),
      );
      // The RPC was confirmed, so the marker is released even though the mirror lost.
      expect(await storage.isStateDirty(email), isFalse);
    });

    test('is not written when the RPC itself failed', () async {
      allowPush();
      gateway.syncFailures = 99;
      await repo.syncStateToSupabase(email, localLedger());
      expect(gateway.snapshotWrites, 0);
    });
  });

  group('the pull: relational reads', () {
    test('reads ten tables and rebuilds the typed ledger', () async {
      gateway.tables = <String, Object?>{
        'bank_cards': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'bc-1',
            'card_name': 'HNB',
            'bank_name': 'HNB',
            'card_type': 'Credit',
            'current_balance': '250.00',
          },
        ],
        'transactions': <Map<String, Object?>>[tx('t1', '450.50')],
      };
      final PullOutcome pulled = await repo.syncStateFromSupabase(email);
      expect(pulled.success, isTrue);
      expect(gateway.tableCalls, hasLength(10));
      final AppState state = pulled.state!;
      // `mapDatabaseResultToState` camelCases and coerces the `numeric` strings.
      expect(state.transactions.single.amount, 450.5);
      expect(state.cards.single.currentBalance, 250);
      expect(state.cards.single.cardName, 'HNB');
      expect(state.userProfile.name, 'User');
      expect(state.userProfile.email, email);
    });

    test('a missing table is no rows, not a failed pull', () async {
      gateway.tables['credit_card_installments'] = const LedgerErrorException(
        'relation "public.credit_card_installments" does not exist',
        code: '42P01',
      );
      expect((await repo.syncStateFromSupabase(email)).success, isTrue);
      final AppState state = await pullState();
      expect(state.creditCardInstallments, isEmpty);
    });

    test('a schema-cache miss is the same branch', () async {
      gateway.tables['debts'] = const LedgerErrorException(
        'Could not find the table \'public.debts\' in the schema cache',
      );
      expect((await repo.syncStateFromSupabase(email)).success, isTrue);
    });

    test('any other table error aborts the whole pull', () async {
      gateway.tables['incomes'] = const LedgerErrorException(
        'permission denied for table incomes',
        code: '42501',
      );
      final PullOutcome pulled = await repo.syncStateFromSupabase(email);
      expect(pulled.success, isFalse);
      expect(pulled.state, isNull);
      expect(pulled.error, 'permission denied for table incomes');
      expect(repo.isEmailLoadedFromCloud(email), isFalse);
      expect(gateway.tableCalls, hasLength(10));
      expect(
        sleeps,
        isEmpty,
        reason: 'the pull\'s round-trip retry is inert too',
      );
    });

    test('a missing table with an empty message is NOT tolerated', () async {
      // `error.code === '42P01' || (error.message && …)` — a falsy message cannot
      // match the substring test, so with no SQLSTATE either, the pull aborts.
      gateway.tables['expenses'] = const LedgerErrorException('');
      expect((await repo.syncStateFromSupabase(email)).success, isFalse);
    });

    test('the four side reads swallow their own errors', () async {
      gateway.subscriptionsError = const LedgerErrorException('subs blocked');
      gateway.authAccountError = const LedgerErrorException('profile blocked');
      gateway.snapshotError = const LedgerErrorException('state blocked');
      gateway.loansGivenError = const LedgerErrorException('loans blocked');
      final AppState state = await pullState();
      expect(state.subscriptions, isEmpty);
      expect(state.userProfile.name, 'User');
      expect(state.loansGiven, isEmpty);
      expect(
        logs,
        containsAllInOrder(<Object>[
          contains('Subscriptions fetch skipped:'),
          contains('Profile fetch skipped:'),
          contains('Ledger state fetch skipped:'),
          contains('Loans given fetch skipped:'),
        ]),
      );
    });

    test('the whole pull is bounded by a wall that is not caught', () async {
      build(pullTimeout: const Duration(milliseconds: 40));
      gateway.hang = <String>{'transactions'};
      await expectLater(
        repo.syncStateFromSupabase(email),
        throwsA(
          isA<JsError>().having(
            (JsError e) => e.message,
            'message',
            'syncStateFromSupabase timed out after 40ms',
          ),
        ),
      );
      // The web's rejected promise reaches `App.tsx:599`'s catch, which leaves the gate
      // closed. A port that turned the timeout into `{success: false}` would keep that
      // behaviour by accident, not by test.
      expect(repo.isEmailLoadedFromCloud(email), isFalse);
    });
  });

  group('the pull: profile and snapshot', () {
    test('an empty profile name leaves the placeholder', () async {
      gateway.authAccount = <String, Object?>{'name': '', 'avatar_url': ''};
      final AppState state = await pullState();
      expect(state.userProfile.name, 'User');
      expect(state.userProfile.avatarUrl, isNull);
    });

    test(
      'the profile row beats the snapshot avatar, and the snapshot fills a gap',
      () async {
        gateway.authAccount = <String, Object?>{
          'name': 'K',
          'avatar_url': '/a.png',
        };
        gateway.snapshot = LedgerSnapshot(
          exists: true,
          state: <String, Object?>{
            'userProfile': <String, Object?>{'avatarUrl': '/b.png'},
          },
        );
        expect((await pullState()).userProfile.avatarUrl, '/a.png');

        gateway.authAccount = <String, Object?>{'name': 'K'};
        expect((await pullState()).userProfile.avatarUrl, '/b.png');
      },
    );

    test(
      'a corrupt snapshot string still counts as a record, and logs',
      () async {
        gateway.snapshot = const LedgerSnapshot(
          exists: true,
          state: '{ not json at all',
        );
        final AppState state = await pullState();
        expect(state.currency, 'Rs.');
        expect(state.budgets, isEmpty);
        expect(
          logs.single,
          contains('Ledger state fetch skipped:'),
          reason: 'the throw is inside the same try the web logs from',
        );
      },
    );

    test(
      'a snapshot that decodes to a non-object is an empty state, not an error',
      () async {
        gateway.snapshot = const LedgerSnapshot(exists: true, state: '[1,2,3]');
        final AppState state = await pullState();
        expect(state.budgets, isEmpty);
        expect(logs, isEmpty);
      },
    );

    test('a row whose state column is null still counts', () async {
      gateway.snapshot = const LedgerSnapshot(exists: true, state: null);
      final AppState state = await pullState();
      expect(state.savingsGoals, isEmpty);
      expect(logs, isEmpty);
    });

    test('scalars are read by typeof, not by truthiness', () async {
      gateway.snapshot = LedgerSnapshot(
        exists: true,
        state: <String, Object?>{
          'currency': 5,
          'pinCode': '1234',
          'pinEnabled': 'true',
        },
      );
      final AppState state = await pullState();
      expect(state.currency, 'Rs.');
      expect(state.pinEnabled, isFalse);
      expect(state.pinCode, '1234');
    });

    test(
      'the pull reads creditCardPurchases off the snapshot, never creditCards',
      () async {
        gateway.snapshot = LedgerSnapshot(
          exists: true,
          state: <String, Object?>{
            'creditCards': <Map<String, Object?>>[
              <String, Object?>{'id': 'cc-1', 'name': 'From snapshot'},
            ],
            'creditCardPurchases': <Map<String, Object?>>[
              <String, Object?>{
                'id': 'cp-1',
                'cardId': 'card-1',
                'installmentId': 'inst-1',
                'amount': 4999,
                'description': 'Laptop',
                'merchant': 'Bambalapitiya',
                'date': '2026-09-30',
              },
            ],
          },
        );
        // B-23, ruled a web-side fix then ported. `credit_card_purchases` has no relational
        // table and is not a `sync_complete_ledger` parameter, so the snapshot is its only
        // cloud copy: returning the seed here is what let a re-hydration push `[]` over it.
        // `creditCards` still has no reader at all — the screens filter `state.cards` — so
        // it stays the seed, exactly as on the web.
        final AppState state = await pullState();
        expect(state.creditCards, isEmpty);
        expect(state.creditCardPurchases, hasLength(1));
        expect(state.creditCardPurchases.single.id, 'cp-1');
        expect(state.creditCardPurchases.single.amount, 4999);
        expect(state.creditCardPurchases.single.date, '2026-09-30');
      },
    );

    test(
      'a creditCardPurchases value that is not an array keeps the seed',
      () async {
        gateway.snapshot = LedgerSnapshot(
          exists: true,
          state: <String, Object?>{'creditCardPurchases': 'oops'},
        );
        // `Array.isArray(jsonState.creditCardPurchases) ? … : DEFAULT_APP_STATE.…` — the
        // guard is the array test, not a try/catch, so a hand-edited snapshot cannot throw
        // the pull. An empty array takes the other branch and reads back empty; the seed is
        // empty too, so that case is not observable and is not asserted.
        final AppState state = await pullState();
        expect(state.creditCardPurchases, isEmpty);
      },
    );
  });

  group('the pull: two-source collections', () {
    test('a table wins over the snapshot for a shared id', () async {
      gateway.tables['transactions'] = <Map<String, Object?>>[
        tx('t1', 1)..['title'] = 'From table',
      ];
      gateway.snapshot = LedgerSnapshot(
        exists: true,
        state: <String, Object?>{
          'transactions': <Map<String, Object?>>[tx('t1', 999)],
        },
      );
      final AppState state = await pullState();
      expect(state.transactions.single.title, 'From table');
      expect(state.transactions.single.amount, 1);
    });

    test('the snapshot fills a table that came back empty', () async {
      gateway.snapshot = LedgerSnapshot(
        exists: true,
        state: <String, Object?>{
          'debts': <Map<String, Object?>>[
            <String, Object?>{'id': 'd1', 'name': 'Loan', 'balance': 1000},
          ],
        },
      );
      expect((await pullState()).debts.single.id, 'd1');
    });

    test('subscriptions: the snapshot wins a shared id, whatever the comment claims', () async {
      // B-24. `mergeSubscriptions` says the union guarantees nothing is lost, and then
      // the `else if (relationalMapped.some(…))` branch lets the JSON copy overwrite
      // the relational row it just matched on.
      gateway.subscriptions = <Map<String, Object?>>[
        <String, Object?>{
          'id': 's1',
          'name': 'From table',
          'amount': '100.00',
          'billing_cycle': 'Monthly',
          'due_date': '2026-11-01',
          'category': 'Entertainment',
          'status': 'Active',
        },
        <String, Object?>{'id': 's2', 'name': 'Table only', 'amount': 2},
      ];
      gateway.snapshot = LedgerSnapshot(
        exists: true,
        state: <String, Object?>{
          'subscriptions': <Map<String, Object?>>[
            <String, Object?>{
              'id': 's1',
              'name': 'From snapshot',
              'amount': 1,
              'billingCycle': 'Yearly',
              'dueDate': '2026-12-01',
              'category': 'Entertainment',
              'status': 'Paused',
            },
            <String, Object?>{
              'id': 's3',
              'name': 'Snapshot only',
              'amount': 3,
              'billingCycle': 'Monthly',
              'dueDate': '2026-10-05',
              'category': 'Entertainment',
              'status': 'Active',
            },
          ],
        },
      );
      final AppState state = await pullState();
      expect(state.subscriptions.map((Subscription s) => s.id), <String>[
        's1',
        's2',
        's3',
      ], reason: 'insertion order is relational first, snapshot second');
      expect(state.subscriptions.first.name, 'From snapshot');
      expect(state.subscriptions.first.amount, 1);
      expect(state.subscriptions.first.status, 'Paused');
    });

    test(
      'subscriptions: a duplicate id inside the table is last-wins',
      () async {
        gateway.subscriptions = <Map<String, Object?>>[
          <String, Object?>{'id': 's1', 'name': 'first', 'amount': 1},
          <String, Object?>{'id': 's1', 'name': 'second', 'amount': 2},
        ];
        final AppState state = await pullState();
        // The `else if` fires for a relational entry against its own table too, so the
        // second row replaces the first while keeping its position in the map.
        expect(state.subscriptions, hasLength(1));
        expect(state.subscriptions.single.name, 'second');
      },
    );

    test('subscriptions: a row with no id is dropped', () async {
      gateway.subscriptions = <Map<String, Object?>>[
        <String, Object?>{'name': 'keyless', 'amount': 1},
      ];
      expect((await pullState()).subscriptions, isEmpty);
    });

    test('loansGiven resolves table-first', () async {
      // The web writes the single `fetchedLoansGiven` variable from both the loans
      // table and the snapshot, so its answer depends on which promise lands last; the
      // port resolves it deterministically and lists the deviation at the gate.
      gateway.loansGiven = <Map<String, Object?>>[
        <String, Object?>{
          'id': 'l1',
          'borrower_name': 'From table',
          'total_amount': '500.00',
          'remaining_amount': '500.00',
          'date_given': '2026-09-01',
        },
      ];
      gateway.snapshot = LedgerSnapshot(
        exists: true,
        state: <String, Object?>{
          'loansGiven': <Map<String, Object?>>[
            <String, Object?>{'id': 'l2', 'borrowerName': 'From snapshot'},
          ],
        },
      );
      final AppState state = await pullState();
      expect(state.loansGiven.map((LoanGiven l) => l.id), <String>['l1']);
      expect(state.loansGiven.single.totalAmount, 500);
    });

    test('budgets: the envelope table beats the snapshot', () async {
      gateway.tables['spending_envelopes'] = <Map<String, Object?>>[
        <String, Object?>{
          'id': 'b1',
          'category': 'Groceries',
          'limit': '3000.00',
          'spent': '0',
          'icon': 'cart',
        },
      ];
      gateway.snapshot = LedgerSnapshot(
        exists: true,
        state: <String, Object?>{
          'budgets': <Map<String, Object?>>[
            <String, Object?>{'id': 'b2', 'category': 'Food'},
          ],
        },
      );
      final AppState state = await pullState();
      expect(state.budgets.map((Budget b) => b.id), <String>['b1']);
      expect(state.budgets.single.limit, 3000);
    });

    test(
      'savingsGoals have no table, so the snapshot is the only source',
      () async {
        gateway.snapshot = LedgerSnapshot(
          exists: true,
          state: <String, Object?>{
            'savingsGoals': <Map<String, Object?>>[
              <String, Object?>{
                'id': 'g1',
                'name': 'Holiday',
                'target': 50000,
                'current': 1000,
                'targetDate': '2026-12-20',
              },
            ],
          },
        );
        expect((await pullState()).savingsGoals.single.name, 'Holiday');
      },
    );

    test(
      'a non-object entry in the snapshot is dropped, not typed through',
      () async {
        gateway.snapshot = LedgerSnapshot(
          exists: true,
          state: <String, Object?>{
            'savingsGoals': <Object?>[
              <String, Object?>{'id': 'g1', 'name': 'Kept'},
              'a string',
              null,
            ],
          },
        );
        expect((await pullState()).savingsGoals, hasLength(1));
      },
    );
  });

  group('the cache both paths write', () {
    test('a state that came from the pull is not pushed back', () async {
      gateway.tables['transactions'] = <Map<String, Object?>>[
        tx('t1', '450.50')..['updated_at'] = '2026-10-02T00:00:00.000Z',
      ];
      final AppState pulled = await pullState();
      expect(repo.lastSyncedStatesCache[owner], isNotNull);
      expect((await repo.syncStateToSupabase(email, pulled)).success, isTrue);
      expect(gateway.syncCalls, 0, reason: 'the round trip must compare equal');
    });

    test(
      'a stamp the model forgot would make two states compare equal',
      () async {
        // Task #45's regression: the seven pull timestamps are load-bearing for this
        // equality test, not decoration.
        final AppState stamped = AppState.fromJson(<String, Object?>{
          'transactions': <Map<String, Object?>>[
            <String, Object?>{
              'id': 't1',
              'amount': 450.5,
              'updated_at': pinned,
            },
          ],
        });
        final AppState unstamped = AppState.fromJson(<String, Object?>{
          'transactions': <Map<String, Object?>>[
            <String, Object?>{'id': 't1', 'amount': 450.5},
          ],
        });
        expect(
          LedgerRepository.canonicalStateJson(stamped),
          isNot(LedgerRepository.canonicalStateJson(unstamped)),
        );
        expect(
          LedgerRepository.canonicalStateJson(stamped),
          LedgerRepository.canonicalStateJson(stamped),
          reason: 'jsonEncode of the same model is byte-stable',
        );
      },
    );

    test('a push after a pull stamps each row from itself, not from the clock', () async {
      final AppState pulled = await pullState();
      final AppState edited = AppState.fromJson(<String, Object?>{
        ...pulled.toJson(),
        'transactions': <Map<String, Object?>>[
          tx('t-new', 5),
          <String, Object?>{'id': 't-undated', 'amount': 7},
        ],
      });
      await repo.syncStateToSupabase(email, edited);
      expect(gateway.syncCalls, 1);
      final List<Object?> sent =
          gateway.syncPayloads.single['p_transactions']! as List<Object?>;
      expect(sent, hasLength(2));
      // `getExistingTs` (`:380-388`) reaches the row's own `date` before the clock, so
      // a re-push does not move a row's `updated_at` — and an empty `date` is falsy, so
      // a dateless row is the only one the injected wall clock stamps (`:393`).
      expect(
        (sent[0]! as Map<String, Object?>)['updated_at'],
        '2026-10-01T00:00:00.000Z',
      );
      expect((sent[1]! as Map<String, Object?>)['updated_at'], pinned);
      expect(gateway.lastSnapshotUpdatedAt, pinned);
    });
  });

  group('the payload', () {
    test('is the web\'s fourteen parameters, in the web\'s order', () async {
      allowPush();
      await repo.syncStateToSupabase(email, localLedger());
      expect(gateway.syncPayloads.single.keys.toList(), <String>[
        'p_email',
        'p_state',
        'p_cards',
        'p_cash_accounts',
        'p_transactions',
        'p_debts',
        'p_incomes',
        'p_expenses',
        'p_notifications',
        'p_subscriptions',
        'p_loans_given',
        'p_spending_envelopes',
        'p_installments',
        'p_installment_payments',
      ]);
      expect(gateway.syncPayloads.single['p_email'], email);
    });

    test(
      'blanking the PIN is the only sanitisation the push performs',
      () async {
        allowPush();
        final AppState withPin = AppState.fromJson(<String, Object?>{
          'pinCode': '4321',
          'pinEnabled': true,
        });
        await repo.syncStateToSupabase(email, withPin);
        expect(withPin.pinCode, '4321', reason: 'local state is not mutated');
        final Map<String, Object?> sentState =
            gateway.syncPayloads.single['p_state']! as Map<String, Object?>;
        expect(sentState['pinCode'], '');
        expect(sentState['pinEnabled'], isTrue);
        expect(gateway.lastPushedState!['pinCode'], '');
      },
    );
  });

  group('the error message shape', () {
    test('a transport error that is not a LedgerErrorException', () async {
      allowPush();
      gateway.syncFailures = 99;
      gateway.syncError = StateError('socket hang up');
      final SyncOutcome outcome = await repo.syncStateToSupabase(
        email,
        localLedger(),
      );
      expect(outcome.success, isFalse);
      // `err instanceof Error ? err.message : String(err)` — Dart's `toString()` of a
      // `StateError` carries its prefix, which `parity/DATA_SPEC.md` records as a
      // message-shape divergence, not a bug in the port.
      expect(outcome.error, contains('socket hang up'));
    });

    test(
      'a thrown string is stringified by the RPC catch, not replaced',
      () async {
        allowPush();
        gateway.syncFailures = 99;
        gateway.syncError = 'plain string';
        final SyncOutcome outcome = await repo.syncStateToSupabase(
          email,
          localLedger(),
        );
        // `rpcErr instanceof Error ? rpcErr.message : String(rpcErr)` (`:809`) — the
        // *inner* catch keeps the value. The fixed fallback is the outer catch only.
        expect(outcome.error, 'plain string');
      },
    );

    test('the outer catch replaces anything that is not an Error', () async {
      // The storage layer guards its own writes and the gateway calls each have a
      // nearer catch, so the only thing left inside `doPush`'s try is the payload
      // build. A clock that throws for a dateless row is how that branch is reached,
      // and it is reached with a bare non-Error value — JS's `instanceof Error`
      // false-branch, which is Dart's neither-`Exception`-nor-`Error` false-branch.
      final LedgerRepository broken = LedgerRepository(
        gateway,
        storage,
        onLog: logs.add,
        retrySleep: recordSleep,
        now: () => throw 'not even an error',
      );
      broken.markEmailAsLoadedFromCloud(email);
      final AppState undated = AppState.fromJson(<String, Object?>{
        'transactions': <Map<String, Object?>>[
          <String, Object?>{'id': 't-undated', 'amount': 7},
        ],
      });
      final SyncOutcome outcome = await broken.syncStateToSupabase(
        email,
        undated,
      );
      expect(gateway.syncCalls, 0, reason: 'the payload never completed');
      expect(outcome.success, isFalse);
      expect(outcome.error, 'Database transaction error.');
      expect(
        logs,
        containsAllInOrder(<Object>[contains('Supabase State Push Error')]),
      );
    });
  });
}
