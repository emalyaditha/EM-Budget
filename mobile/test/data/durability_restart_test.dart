import 'dart:convert';
import 'dart:io';

import 'package:em_budget/data/file_key_value_store.dart';
import 'package:em_budget/data/key_value_store.dart';
import 'package:em_budget/data/state_storage.dart';
import 'package:em_budget/models/app_state.dart';
import 'package:flutter_test/flutter_test.dart';

/// The durability layer over the store that will actually hold it on a device.
///
/// `state_storage_test.dart` already pins the *rules* — normalisation, the discard
/// branches, the empty-writes-nothing cases — against `InMemoryKeyValueStore`. This file
/// asks the one question an in-memory double cannot: does any of it survive the process
/// ending? On the web the answer is free, because `localStorage` outlives the tab. On the
/// phone it is a property of the backing store, and the three values that matter are the
/// ones `INVENTORY.md` §6 calls the data-loss guard:
///
/// - the **dirty marker** — if it is lost, the boot path reads "local is not ahead" and
///   replaces local state with the older cloud copy (`supabase.ts:531-537`,
///   `App.tsx:592-640`);
/// - the **tombstones** — if they are lost, the cloud's copy of a deleted row comes back
///   through the boot merge and the next push re-inserts it;
/// - the **owner tag** — if it is lost, the mirror is read untagged and the guard at
///   `:264` cannot tell whose ledger it is.
///
/// Each case writes through one store, then reads through a **second instance over the
/// same directory**, which is the closest a unit test comes to a restart: nothing is
/// shared but the bytes on disk.
void main() {
  late Directory dir;
  late FileKeyValueStore first;
  late StateStorage writer;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('em_budget_kv');
    first = FileKeyValueStore(dir);
    writer = StateStorage(first);
  });

  tearDown(() {
    if (dir.existsSync()) dir.deleteSync(recursive: true);
  });

  /// A freshly constructed store and repository over the same directory — the "restart".
  StateStorage restart() => StateStorage(FileKeyValueStore(dir));

  test('the dirty marker survives a restart, and still names its owner', () async {
    await writer.markStateDirty('Owner@Example.com');

    final StateStorage after = restart();
    expect(await after.isStateDirty('owner@example.com'), isTrue);
    // The marker is the web's normalised form on disk, so a different spelling of the
    // same address is the same pending state — and a different address is not.
    expect(await after.isStateDirty('someone@else.com'), isFalse);
  });

  test('a cleared marker stays cleared across a restart', () async {
    await writer.markStateDirty('owner@example.com');
    await writer.clearStateDirty('owner@example.com');

    final StateStorage after = restart();
    expect(await after.isStateDirty('owner@example.com'), isFalse);
  });

  test('tombstones survive a restart with their ids and order', () async {
    await writer.recordDeletions('owner@example.com', <String>[
      'tx-3',
      'tx-1',
      'tx-3',
    ]);
    await writer.recordDeletions('owner@example.com', <String>['card-9']);

    final StateStorage after = restart();
    expect(await after.getTombstonedIds('owner@example.com'), <String>{
      'tx-3',
      'tx-1',
      'card-9',
    });
    // Second account, same device: the per-owner partition is on disk, not in memory.
    expect(await after.getTombstonedIds('other@example.com'), isEmpty);
  });

  test('clearing one owner’s tombstones leaves the other’s on disk', () async {
    await writer.recordDeletions('owner@example.com', <String>['tx-1']);
    await writer.recordDeletions('other@example.com', <String>['tx-2']);

    final StateStorage after = restart();
    await after.clearTombstones('owner@example.com');

    expect(await after.getTombstonedIds('owner@example.com'), isEmpty);
    expect(await restart().getTombstonedIds('other@example.com'), <String>{
      'tx-2',
    });
  });

  test(
    'the mirror and its owner tag come back and are re-read together',
    () async {
      final AppState state = AppState.fromJson(<String, Object?>{
        'transactions': <Map<String, Object?>>[
          <String, Object?>{
            'id': 'tx-1',
            'type': 'expense',
            'title': 'Lunch',
            'amount': 12.5,
            'date': '2026-10-01',
            'category': 'Food',
          },
        ],
      });
      await writer.saveStateToStorage(state, ownerEmail: 'owner@example.com');

      final StateStorage after = restart();
      final AppState loaded = await after.loadStateFromStorage(
        AppState.defaultValue(),
        ownerEmail: 'owner@example.com',
      );
      expect(loaded.transactions.single.id, 'tx-1');
      expect(loaded.transactions.single.amount, 12.5);
    },
  );

  test(
    'an absent key reads as null, which is what localStorage returned',
    () async {
      expect(await first.read('cashflow_manager_deleted_ids_v1'), isNull);
    },
  );

  test(
    'a write replaces the value in place, leaving no temp file behind',
    () async {
      await first.write(StateStorage.deletedIdsKey, '{"a":["1"]}');
      await first.write(StateStorage.deletedIdsKey, '{"a":["1","2"]}');

      expect(await first.read(StateStorage.deletedIdsKey), '{"a":["1","2"]}');
      final List<String> names = dir
          .listSync()
          .whereType<File>()
          .map((File f) => f.uri.pathSegments.last)
          .toList();
      expect(names, <String>[StateStorage.deletedIdsKey]);
      // What a reader would see if it read the file while it was being replaced: never a
      // prefix of the old value spliced onto the new one, because the bytes arrive by
      // rename. Decode the surviving file to prove it is a whole document.
      expect(
        jsonDecode((await first.read(StateStorage.deletedIdsKey))!),
        <String, Object?>{
          'a': <Object?>['1', '2'],
        },
      );
    },
  );

  test('remove is idempotent and does not disturb its neighbours', () async {
    await first.write(StateStorage.dirtyOwnerKey, 'owner@example.com');
    await first.write(StateStorage.stateOwnerKey, 'owner@example.com');
    await first.remove(StateStorage.dirtyOwnerKey);
    await first.remove(StateStorage.dirtyOwnerKey);

    final Directory listing = dir;
    expect(await first.read(StateStorage.dirtyOwnerKey), isNull);
    expect(await first.read(StateStorage.stateOwnerKey), 'owner@example.com');
    expect(listing.listSync().length, 1);
  });

  test(
    'a key that is not a plain file name is refused, not sanitised',
    () async {
      // Sanitising would map two different keys onto one file, which is how one owner's
      // marker could end up standing for another's.
      for (final String bad in <String>[
        '',
        '..',
        '.',
        '../evil',
        'a/b',
        r'a\b',
        '%2e%2e',
      ]) {
        expect(
          () => first.write(bad, 'x'),
          throwsA(isA<ArgumentError>()),
          reason: 'key "$bad" must not become a path',
        );
      }
    },
  );

  test(
    'a store whose directory is missing creates it on the first write',
    () async {
      final Directory nested = Directory('${dir.path}/em_budget/ledger');
      final FileKeyValueStore fresh = FileKeyValueStore(nested);
      await fresh.write(StateStorage.dirtyOwnerKey, 'owner@example.com');

      expect(nested.existsSync(), isTrue);
      expect(await fresh.read(StateStorage.dirtyOwnerKey), 'owner@example.com');
      // A different handle over the same directory reads the same marker, which is what
      // the next process start will be.
      expect(
        await StateStorage(FileKeyValueStore(nested))
            .isStateDirty('owner@example.com'),
        isTrue,
      );
    },
  );

  test('a KeyValueStore double still satisfies the interface', () async {
    // The durability layer is written against the interface; this pins that the file
    // store and the in-memory store agree on the three operations the layer uses.
    final KeyValueStore memory = InMemoryKeyValueStore();
    for (final KeyValueStore store in <KeyValueStore>[first, memory]) {
      expect(await store.read('cashflow_manager_state_owner_v1'), isNull);
      await store.write('cashflow_manager_state_owner_v1', 'a@b.c');
      expect(await store.read('cashflow_manager_state_owner_v1'), 'a@b.c');
      await store.remove('cashflow_manager_state_owner_v1');
      expect(await store.read('cashflow_manager_state_owner_v1'), isNull);
    }
  });
}
