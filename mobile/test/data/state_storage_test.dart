import 'dart:convert';

import 'package:em_budget/data/dates_local.dart';
import 'package:em_budget/data/key_value_store.dart';
import 'package:em_budget/data/state_storage.dart';
import 'package:em_budget/models/app_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// The durability layer of `src/utils.ts:85-303`, replayed against the same store the
/// widget layer will use.
///
/// These tests exist because this is the code that decides whether a sync destroys data
/// or not, and because three of its behaviours are invisible in the happy path:
///
/// - the **owner is normalised on both ends** — a marker or a tag that came back with
///   different casing is still this account's, and treating it as a stranger's would
///   delete the mirror (`isStateDirty :119`, the guard at `:264`);
/// - **absence is a decision, not a default** — `recordDeletions([])` writes nothing at
///   all, `clearTombstones` returns before writing when the owner has no entry, and a
///   "harmless" rewrite in either place would reorder or resurrect ids the cloud has
///   already been told about;
/// - the **two discard branches are different** — a mirror owned by someone else loses
///   both keys, a mirror holding the retired seed data loses only the blob.
///
/// `parity/fixtures/` has no file for this unit: every value here is a string the web
/// wrote, so the store contents are asserted as JSON text rather than as a fixture
/// replay. The date-window cases use the same pinned clock as
/// `parity/fixtures/dates-local.json` (`_provenance.pinnedNow`).
void main() {
  /// `2026-10-04T04:30:00.000Z` — the fixture's pinned instant, so `todayLocal()` here
  /// and `isAlertDayRecent()` in the replayed suite agree about what "today" is.
  final int pinnedMs = DateTime.utc(2026, 10, 4, 4, 30).millisecondsSinceEpoch;

  /// [today] plus [days], on the device's own calendar. Expressed relative to the clock
  /// rather than as `2026-10-03` so the window tests hold on a runner in any zone.
  String day(int days) {
    final DateTime local = DateTime.fromMillisecondsSinceEpoch(pinnedMs);
    return localDayKey(DateTime(local.year, local.month, local.day + days));
  }

  late InMemoryKeyValueStore store;
  late StateStorage storage;

  setUp(() {
    store = InMemoryKeyValueStore();
    storage = StateStorage(store, clock: () => pinnedMs);
  });

  Map<String, Object?> seededJson([
    Map<String, Object?> override = const <String, Object?>{},
  ]) {
    return <String, Object?>{
      'cashAccounts': <Map<String, Object?>>[
        <String, Object?>{'id': 'ca-1', 'name': 'Cash', 'balance': 1500.5},
      ],
      'currency': r'Rs.',
      ...override,
    };
  }

  // --------------------------------------------------------------------------
  group('the dirty marker (:89-124)', () {
    test('the owner is normalised on the way in', () async {
      await storage.markStateDirty('  Admin@Example.COM ');
      expect(store.backing[StateStorage.dirtyOwnerKey], 'admin@example.com');
    });

    test('no owner means no marker', () async {
      await storage.markStateDirty(null);
      await storage.markStateDirty('');
      expect(store.log, isEmpty);
      expect(store.backing, isEmpty);
    });

    test('a marker naming this owner is dirty in any spelling', () async {
      await storage.markStateDirty('admin@example.com');
      expect(await storage.isStateDirty('  ADMIN@example.com '), isTrue);
      expect(await storage.isStateDirty('other@example.com'), isFalse);
    });

    test('a marker stored un-normalised is still honoured', () async {
      // `localStorage.getItem(KEY) || '').trim().toLowerCase()` — the web normalises
      // what it *read*, not only what it was given. A phone that compared raw would
      // call a legacy marker someone else's, drop the flag, and let the hydration path
      // replace local state with the cloud copy.
      store.backing[StateStorage.dirtyOwnerKey] = '  ADMIN@example.com ';
      expect(await storage.isStateDirty('admin@example.com'), isTrue);
      await storage.clearStateDirty('admin@example.com');
      expect(store.backing.containsKey(StateStorage.dirtyOwnerKey), isFalse);
    });

    test('an empty marker is not dirty', () async {
      store.backing[StateStorage.dirtyOwnerKey] = '';
      expect(await storage.isStateDirty('admin@example.com'), isFalse);
    });

    test('clearing is owner-scoped', () async {
      await storage.markStateDirty('admin@example.com');
      store.log.clear();
      await storage.clearStateDirty('other@example.com');
      expect(store.log, isEmpty);
      expect(await storage.isStateDirty('admin@example.com'), isTrue);

      await storage.clearStateDirty('admin@example.com');
      expect(store.log, <String>['remove ${StateStorage.dirtyOwnerKey}']);
      expect(await storage.isStateDirty('admin@example.com'), isFalse);
    });

    test('clearing without an owner is a no-op', () async {
      await storage.markStateDirty('admin@example.com');
      store.log.clear();
      await storage.clearStateDirty(null);
      expect(store.log, isEmpty);
    });
  });

  // --------------------------------------------------------------------------
  group('deletion tombstones (:126-181)', () {
    test('ids union, deduplicate, and keep first-seen order', () async {
      await storage.recordDeletions('a@x.com', <String>['x', 'y', 'x']);
      expect(
        jsonDecode(store.backing[StateStorage.deletedIdsKey]!),
        <String, Object?>{
          'a@x.com': <String>['x', 'y'],
        },
      );
      await storage.recordDeletions('a@x.com', <String>['y', 'z']);
      expect(
        jsonDecode(store.backing[StateStorage.deletedIdsKey]!),
        <String, Object?>{
          'a@x.com': <String>['x', 'y', 'z'],
        },
      );
    });

    test('an empty id list writes nothing at all', () async {
      await storage.recordDeletions('a@x.com', <String>[]);
      expect(store.log, isEmpty);
      expect(store.backing.containsKey(StateStorage.deletedIdsKey), isFalse);
    });

    test('owners keep separate entries', () async {
      await storage.recordDeletions('A@X.com', <String>['x']);
      await storage.recordDeletions('b@x.com', <String>['y']);
      expect(
        jsonDecode(store.backing[StateStorage.deletedIdsKey]!),
        <String, Object?>{
          'a@x.com': <String>['x'],
          'b@x.com': <String>['y'],
        },
      );
      expect(await storage.getTombstonedIds('a@x.com'), <String>{'x'});
    });

    test('no owner means no tombstones, not all of them', () async {
      await storage.recordDeletions('a@x.com', <String>['x']);
      expect(await storage.getTombstonedIds(null), isEmpty);
      expect(await storage.getTombstonedIds(''), isEmpty);
      expect(await storage.getTombstonedIds('c@x.com'), isEmpty);
    });

    test('a tombstone is never pruned by age', () async {
      // Unlike a dismissed alert, a tombstone outlives every window: the point is that
      // the cloud must not resurrect the row, and it can arrive months later.
      store.backing[StateStorage.deletedIdsKey] = jsonEncode(<String, Object?>{
        'a@x.com': <String>['old'],
      });
      await storage.recordDeletions('a@x.com', <String>['new']);
      expect(await storage.getTombstonedIds('a@x.com'), <String>{'old', 'new'});
    });

    test(
      'clearing an owner who has no entry does not rewrite the file',
      () async {
        await storage.recordDeletions('a@x.com', <String>['x']);
        store.log.clear();
        await storage.clearTombstones('c@x.com');
        expect(store.log, isEmpty);
        expect(await storage.getTombstonedIds('a@x.com'), <String>{'x'});
      },
    );

    test('clearing removes one owner and leaves the rest', () async {
      await storage.recordDeletions('a@x.com', <String>['x']);
      await storage.recordDeletions('b@x.com', <String>['y']);
      store.log.clear();
      await storage.clearTombstones('  A@X.com ');
      expect(store.log, <String>['set ${StateStorage.deletedIdsKey}']);
      expect(
        jsonDecode(store.backing[StateStorage.deletedIdsKey]!),
        <String, Object?>{
          'b@x.com': <String>['y'],
        },
      );
      expect(await storage.getTombstonedIds('a@x.com'), isEmpty);
    });

    test('a body that is not an object reads as empty', () async {
      for (final String body in <String>[
        '[]',
        'null',
        '"a string"',
        'not json at all',
        '',
      ]) {
        store.backing[StateStorage.deletedIdsKey] = body;
        expect(
          await storage.getTombstonedIds('a@x.com'),
          isEmpty,
          reason: 'body: $body',
        );
      }
    });

    test('a non-array value is dropped per entry, not fatal', () async {
      store.backing[StateStorage.deletedIdsKey] = jsonEncode(<String, Object?>{
        'a@x.com': 'x',
        'b@x.com': <Object?>['y', 7, null],
      });
      expect(await storage.getTombstonedIds('a@x.com'), isEmpty);
      expect(await storage.getTombstonedIds('b@x.com'), <String>{'y'});
      // …and the next write rebuilds the file from what survived, as `readTombstones`
      // + `setItem` does on the web.
      await storage.recordDeletions('a@x.com', <String>['z']);
      expect(
        jsonDecode(store.backing[StateStorage.deletedIdsKey]!),
        <String, Object?>{
          'b@x.com': <String>['y'],
          'a@x.com': <String>['z'],
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  group('dismissed alerts (:183-242)', () {
    test('a dismissal is stamped with today', () async {
      await storage.recordDismissedAlerts('  A@X.com ', <String>['al-1']);
      expect(
        jsonDecode(store.backing[StateStorage.dismissedAlertsKey]!),
        <String, Object?>{
          'a@x.com': <String, String>{'al-1': day(0)},
        },
      );
    });

    test('an empty id list writes nothing, and prunes nothing', () async {
      store.backing[StateStorage.dismissedAlertsKey] = jsonEncode(
        <String, Object?>{
          'a@x.com': <String, String>{'stale': day(-30)},
        },
      );
      await storage.recordDismissedAlerts('a@x.com', <String>[]);
      expect(store.log, isEmpty);
      expect(
        store.backing[StateStorage.dismissedAlertsKey],
        contains('stale'),
        reason: 'the web prunes only when something new arrives',
      );
    });

    test('recording prunes what has fallen outside the window', () async {
      store.backing[StateStorage.dismissedAlertsKey] = jsonEncode(
        <String, Object?>{
          'a@x.com': <String, String>{
            'today': day(0),
            'yesterday': day(-1),
            'twoDaysAgo': day(-2),
            'garbage': 'not-a-date',
          },
        },
      );
      await storage.recordDismissedAlerts('a@x.com', <String>['fresh']);
      expect(
        jsonDecode(store.backing[StateStorage.dismissedAlertsKey]!),
        <String, Object?>{
          'a@x.com': <String, String>{
            'today': day(0),
            'yesterday': day(-1),
            'fresh': day(0),
          },
        },
      );
    });

    test('the read window is today or yesterday, and not tomorrow', () async {
      store.backing[StateStorage.dismissedAlertsKey] = jsonEncode(
        <String, Object?>{
          'A@X.com': <String, Object?>{
            'today': day(0),
            'yesterday': day(-1),
            'older': day(-2),
            'future': day(1),
            'numeric': 7,
          },
        },
      );
      expect(
        await storage.getDismissedAlertIds('a@x.com', nowMs: pinnedMs),
        <String>{'today', 'yesterday'},
        reason: 'the owner key is normalised on read too',
      );
    });

    test('no owner reads empty even when the file is full', () async {
      await storage.recordDismissedAlerts('a@x.com', <String>['x']);
      expect(await storage.getDismissedAlertIds(null), isEmpty);
      expect(await storage.getDismissedAlertIds(''), isEmpty);
    });

    test('a body that is not an object reads as empty', () async {
      for (final String body in <String>['[]', 'null', '42', 'garbage', '']) {
        store.backing[StateStorage.dismissedAlertsKey] = body;
        expect(
          await storage.getDismissedAlertIds('a@x.com'),
          isEmpty,
          reason: 'body: $body',
        );
      }
    });

    test('a non-object value for an owner is dropped per entry', () async {
      store.backing[StateStorage.dismissedAlertsKey] = jsonEncode(
        <String, Object?>{
          'a@x.com': <String>['not', 'a', 'map'],
          'b@x.com': <String, Object?>{'al': day(0)},
        },
      );
      expect(await storage.getDismissedAlertIds('a@x.com'), isEmpty);
      expect(await storage.getDismissedAlertIds('b@x.com'), <String>{'al'});
    });
  });

  // --------------------------------------------------------------------------
  group('the state mirror (:244-303)', () {
    test('saving writes the blob, then the owner tag', () async {
      final AppState state = AppState.fromJson(seededJson());
      await storage.saveStateToStorage(state, ownerEmail: ' A@X.com ');
      expect(store.log, <String>[
        'set ${StateStorage.stateKey}',
        'set ${StateStorage.stateOwnerKey}',
      ]);
      expect(store.backing[StateStorage.stateOwnerKey], 'a@x.com');
      expect(jsonDecode(store.backing[StateStorage.stateKey]!), state.toJson());

      final AppState loaded = await storage.loadStateFromStorage(
        AppState.defaultValue(),
        ownerEmail: 'a@x.com',
      );
      expect(loaded.currency, r'Rs.');
      expect(loaded.cashAccounts.single.id, 'ca-1');
      expect(loaded.cashAccounts.single.balance, 1500.5);
    });

    test('saving without an owner leaves the previous tag alone', () async {
      await storage.saveStateToStorage(
        AppState.fromJson(seededJson()),
        ownerEmail: 'a@x.com',
      );
      store.log.clear();
      await storage.saveStateToStorage(AppState.fromJson(seededJson()));
      expect(store.log, <String>['set ${StateStorage.stateKey}']);
      expect(store.backing[StateStorage.stateOwnerKey], 'a@x.com');
    });

    test('no mirror is the default state', () async {
      final AppState fallback = AppState.defaultValue();
      expect(await storage.loadStateFromStorage(fallback), same(fallback));
    });

    test('an empty mirror is the default state', () async {
      store.backing[StateStorage.stateKey] = '';
      final AppState fallback = AppState.defaultValue();
      expect(
        await storage.loadStateFromStorage(fallback),
        same(fallback),
        reason: '`if (!serialized) return defaultState`',
      );
    });

    test(
      'unparseable, null and non-object bodies are the default state',
      () async {
        for (final String body in <String>[
          '{oops',
          'null',
          '[]',
          '"text"',
          '7',
        ]) {
          store.backing[StateStorage.stateKey] = body;
          final AppState fallback = AppState.defaultValue();
          expect(
            await storage.loadStateFromStorage(fallback, ownerEmail: 'a@x.com'),
            same(fallback),
            reason: 'body: $body',
          );
          expect(
            store.log,
            isEmpty,
            reason: 'a bad body is never deleted, only ignored',
          );
        }
      },
    );

    test('a mirror owned by someone else loses both keys', () async {
      await storage.saveStateToStorage(
        AppState.fromJson(seededJson()),
        ownerEmail: 'a@x.com',
      );
      store.log.clear();
      final AppState fallback = AppState.defaultValue();
      final AppState loaded = await storage.loadStateFromStorage(
        fallback,
        ownerEmail: 'b@x.com',
      );
      expect(loaded, same(fallback));
      expect(store.log, <String>[
        'remove ${StateStorage.stateKey}',
        'remove ${StateStorage.stateOwnerKey}',
      ]);
      expect(store.backing, isEmpty);
    });

    test('a tag stored un-normalised is not a different owner', () async {
      // `(getItem(STORAGE_OWNER_KEY) || '').trim().toLowerCase()` — the web compares
      // normalised to normalised. A phone that compared raw would treat its own mirror
      // as another user's and delete it.
      store.backing[StateStorage.stateKey] = jsonEncode(seededJson());
      store.backing[StateStorage.stateOwnerKey] = '  A@X.COM ';
      final AppState loaded = await storage.loadStateFromStorage(
        AppState.defaultValue(),
        ownerEmail: 'a@x.com',
      );
      expect(loaded.cashAccounts.single.id, 'ca-1');
      expect(store.log, isEmpty);
    });

    test('an unowned read paints whatever mirror is there', () async {
      // `if (ownerEmail && owner && owner !== …)` — with no signed-in email the guard
      // does not fire, which is the web's boot fast-path before identity is known.
      store.backing[StateStorage.stateKey] = jsonEncode(seededJson());
      store.backing[StateStorage.stateOwnerKey] = 'someone@else.com';
      final AppState loaded = await storage.loadStateFromStorage(
        AppState.defaultValue(),
      );
      expect(loaded.cashAccounts.single.id, 'ca-1');
      expect(store.log, isEmpty);
    });

    test(
      'the retired seed rows are discarded, and only the blob is removed',
      () async {
        for (final Map<String, Object?> seed in <Map<String, Object?>>[
          <String, Object?>{
            'cashAccounts': <Object?>[
              <String, Object?>{'id': 'cash-wallet', 'name': 'W', 'balance': 0},
            ],
          },
          <String, Object?>{
            'cards': <Object?>[
              <String, Object?>{'id': 'card-hnb', 'name': 'HNB', 'balance': 0},
            ],
          },
        ]) {
          store.backing[StateStorage.stateKey] = jsonEncode(seed);
          store.backing[StateStorage.stateOwnerKey] = 'a@x.com';
          store.log.clear();
          final AppState loaded = await storage.loadStateFromStorage(
            AppState.defaultValue(),
            ownerEmail: 'a@x.com',
          );
          expect(loaded.currency, r'Rs.');
          expect(loaded.cashAccounts, isEmpty);
          expect(store.log, <String>[
            'remove ${StateStorage.stateKey}',
          ], reason: 'the owner tag survives the seed discard');
          expect(store.backing.containsKey(StateStorage.stateOwnerKey), isTrue);
        }
      },
    );

    test('a mirror missing collections is filled from the default', () async {
      // The "ensure vital nodes exist" pass; `currency` is a scalar the web copies
      // verbatim, so a stored one wins and an absent one takes the seed.
      store.backing[StateStorage.stateKey] = jsonEncode(<String, Object?>{
        'currency': r'$',
        'expenses': null,
      });
      final AppState loaded = await storage.loadStateFromStorage(
        AppState.defaultValue(),
      );
      expect(loaded.currency, r'$');
      expect(loaded.expenses, isEmpty);
      expect(loaded.pinCode, isEmpty);
      expect(loaded.pinEnabled, isFalse);
    });

    test(
      'the pre-restore backup is an un-tagged copy of the whole state',
      () async {
        final AppState state = AppState.fromJson(seededJson());
        await storage.savePreRestoreBackup(state);
        expect(
          jsonDecode(store.backing[StateStorage.restoreBackupKey]!),
          state.toJson(),
        );
        expect(store.backing.containsKey(StateStorage.stateOwnerKey), isFalse);
      },
    );
  });

  // --------------------------------------------------------------------------
  group('a store that fails (:catch + logger.error)', () {
    test('every write is swallowed, and every read degrades', () async {
      final StateStorage broken = StateStorage(
        _ThrowingStore(),
        clock: () => pinnedMs,
      );
      await broken.markStateDirty('a@x.com');
      await broken.clearStateDirty('a@x.com');
      expect(await broken.isStateDirty('a@x.com'), isFalse);
      await broken.recordDeletions('a@x.com', <String>['x']);
      expect(await broken.getTombstonedIds('a@x.com'), isEmpty);
      await broken.clearTombstones('a@x.com');
      await broken.recordDismissedAlerts('a@x.com', <String>['al']);
      expect(await broken.getDismissedAlertIds('a@x.com'), isEmpty);

      final AppState fallback = AppState.defaultValue();
      expect(
        await broken.loadStateFromStorage(fallback, ownerEmail: 'a@x.com'),
        same(fallback),
      );
      // Saving must not throw either: the user is looking at the ledger screen.
      await broken.saveStateToStorage(fallback, ownerEmail: 'a@x.com');
      await broken.savePreRestoreBackup(fallback);
    });
  });
}

/// `localStorage` with a quota error on every access.
class _ThrowingStore implements KeyValueStore {
  @override
  Future<String?> read(String key) async => throw StateError('QuotaExceeded');

  @override
  Future<void> write(String key, String value) async =>
      throw StateError('QuotaExceeded');

  @override
  Future<void> remove(String key) async => throw StateError('QuotaExceeded');
}
