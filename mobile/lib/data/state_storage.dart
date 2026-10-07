import 'dart:convert';

import '../models/app_state.dart';
import 'dates_local.dart';
import 'key_value_store.dart';

/// The durability layer of `src/utils.ts:85-303`, over [KeyValueStore].
///
/// Three of these six keys are what stops a sync from destroying data, and the playbook
/// rule that they port verbatim rather than "better" is `INVENTORY.md` §6 / R4:
///
/// - **the dirty flag** (`:98-124`) is set the instant state changes and cleared only
///   when the server confirms the push, so an interrupted sync survives the restart.
///   Without it the phone cannot tell a stale mirror from one holding edits the cloud
///   has never seen, and the hydration path replaces local with cloud;
/// - **the tombstones** (`:133-181`) exist because the boot merge unions local and
///   cloud by id, which cannot distinguish "deleted here" from "never seen here" — a
///   cloud copy of a deleted row comes back without them;
/// - **the owner tag** (`:244-268`) is checked before the mirror is painted, so a shared
///   device cannot show one user's ledger to another.
///
/// The web wraps every read and write in `try/catch` and logs, so a quota failure
/// degrades to "no mirror" rather than breaking the UI; that is reproduced, not improved
/// on. The browser's `pagehide`/`beforeunload` flush has no Dart equivalent and moves to
/// `AppLifecycleState.paused` in the widget layer (`INVENTORY.md` §5.3) — this class only
/// owns the storage, not the hook.
class StateStorage {
  StateStorage(this.store, {this.clock});

  final KeyValueStore store;

  /// The clock seam. `null` means the device clock; a test stands in its own epoch.
  final int Function()? clock;

  /// `STORAGE_KEY` and friends (`:85-87`, `:127`, `:186`, `:305`). The names are the
  /// web's, kept byte-for-byte so a future reader can diff the two stores against each
  /// other; nothing on the phone shares a browser's localStorage, so there is no
  /// collision to avoid and no reason to rename.
  static const String stateKey = 'cashflow_manager_state_v1';
  static const String stateOwnerKey = 'cashflow_manager_state_owner_v1';
  static const String dirtyOwnerKey = 'cashflow_manager_state_dirty_owner_v1';
  static const String deletedIdsKey = 'cashflow_manager_deleted_ids_v1';
  static const String dismissedAlertsKey =
      'cashflow_manager_dismissed_alerts_v1';
  static const String restoreBackupKey = 'em_budget_restore_backup_v1';

  /// `ownerEmail.trim().toLowerCase()` — the form every one of these keys is stored
  /// under. The web normalises at every callsite, so two spellings of one address are
  /// one owner here too.
  static String ownerKey(String email) => email.trim().toLowerCase();

  bool _hasOwner(String? ownerEmail) =>
      ownerEmail != null && ownerEmail.isNotEmpty;

  /// The web's `… || '').trim().toLowerCase()` on a value it read back. Normalising
  /// only the *argument* would treat a marker written by an older build — or by hand —
  /// as someone else's, and a lost dirty flag is lost data.
  static String _norm(Object? value) =>
      (value is String ? value : '').trim().toLowerCase();

  /// Every write on the web sits inside `try/catch` + `logger.error`, so a quota or
  /// disk failure degrades to "the marker did not move" instead of breaking the screen
  /// the user is looking at. Reproduced, not improved on.
  Future<void> _guard(Future<void> Function() write) async {
    try {
      await write();
    } on Object {
      // `logger.error('Failed to …:', error)` — the web has no other recovery path.
    }
  }

  // ---------------------------------------------------------------------------
  // The dirty marker (:89-124)
  // ---------------------------------------------------------------------------

  /// `markStateDirty` (`:98-106`). No owner, no marker — an anonymous device cannot
  /// know which cloud account the local edits belong to.
  Future<void> markStateDirty(String? ownerEmail) async {
    if (!_hasOwner(ownerEmail)) return;
    await _guard(() => store.write(dirtyOwnerKey, ownerKey(ownerEmail!)));
  }

  /// `clearStateDirty` (`:108-116`). Only removes when the marker names this owner, so
  /// a confirmation arriving for the wrong account cannot clear another's flag.
  Future<void> clearStateDirty(String? ownerEmail) async {
    if (!_hasOwner(ownerEmail)) return;
    if (await isStateDirty(ownerEmail)) {
      await _guard(() => store.remove(dirtyOwnerKey));
    }
  }

  /// `isStateDirty` (`:118-124`): a marker that is empty, or names someone else, means
  /// not dirty.
  Future<bool> isStateDirty(String? ownerEmail) async {
    if (!_hasOwner(ownerEmail)) return false;
    final String dirty;
    try {
      dirty = _norm(await store.read(dirtyOwnerKey));
    } on Object {
      // `catch { return false }` (`:121-123`) — a store that cannot be read is a store
      // that reports nothing pending, which is what the web does.
      return false;
    }
    return dirty.isNotEmpty && dirty == ownerKey(ownerEmail!);
  }

  // ---------------------------------------------------------------------------
  // Deletion tombstones (:127-181)
  // ---------------------------------------------------------------------------

  /// `readTombstones` (`:139-153`). A body that is not a JSON object — including a JSON
  /// `null`, an array or garbage — yields the empty map, and a value that is not a list
  /// of strings is dropped per entry rather than throwing.
  Future<Map<String, List<String>>> _readTombstones() async {
    try {
      final String? raw = await store.read(deletedIdsKey);
      if (raw == null) return <String, List<String>>{};
      final Object? parsed = jsonDecode(raw);
      if (parsed is! Map<String, Object?>) return <String, List<String>>{};
      final Map<String, List<String>> out = <String, List<String>>{};
      parsed.forEach((String email, Object? ids) {
        if (ids is List) {
          out[ownerKey(email)] = ids.whereType<String>().toList();
        }
      });
      return out;
    } on Object {
      return <String, List<String>>{};
    }
  }

  /// `recordDeletions` (`:155-168`). An empty id list writes nothing at all — including
  /// no pruning — which is the web's behaviour and is why a delete of "nothing" cannot
  /// disturb a pending tombstone set.
  Future<void> recordDeletions(String? ownerEmail, Iterable<String> ids) async {
    if (!_hasOwner(ownerEmail)) return;
    final List<String> newIds = ids.toList();
    if (newIds.isEmpty) return;
    final String key = ownerKey(ownerEmail!);
    final Map<String, List<String>> all = await _readTombstones();
    // `new Set` + spread: union, deduplicated, first-seen order preserved — Dart's
    // default `Set` is a `LinkedHashSet`, so the serialised array matches too.
    final Set<String> existing = (all[key] ?? const <String>[]).toSet();
    existing.addAll(newIds);
    all[key] = existing.toList();
    await _guard(() => store.write(deletedIdsKey, jsonEncode(all)));
  }

  /// `getTombstonedIds` (`:170-172`). No owner means no tombstones, not "all of them".
  Future<Set<String>> getTombstonedIds(String? ownerEmail) async {
    if (!_hasOwner(ownerEmail)) return <String>{};
    final Map<String, List<String>> all = await _readTombstones();
    return (all[ownerKey(ownerEmail!)] ?? const <String>[]).toSet();
  }

  /// `clearTombstones` (`:174-181`). Returns before writing when the owner has no
  /// entry, so a confirmed push that deleted nothing does not rewrite the file.
  Future<void> clearTombstones(String? ownerEmail) async {
    if (!_hasOwner(ownerEmail)) return;
    final String key = ownerKey(ownerEmail!);
    final Map<String, List<String>> all = await _readTombstones();
    if (!all.containsKey(key)) return;
    all.remove(key);
    await _guard(() => store.write(deletedIdsKey, jsonEncode(all)));
  }

  // ---------------------------------------------------------------------------
  // Dismissed alerts (:184-243)
  // ---------------------------------------------------------------------------

  /// `readDismissedAlerts` (`:191-210`): owner → alert id → the local day it was closed.
  Future<Map<String, Map<String, String>>> _readDismissedAlerts() async {
    try {
      final String? raw = await store.read(dismissedAlertsKey);
      if (raw == null) return <String, Map<String, String>>{};
      final Object? parsed = jsonDecode(raw);
      if (parsed is! Map<String, Object?>) {
        return <String, Map<String, String>>{};
      }
      final Map<String, Map<String, String>> out =
          <String, Map<String, String>>{};
      parsed.forEach((String email, Object? byId) {
        if (byId is Map<String, Object?>) {
          final Map<String, String> clean = <String, String>{};
          byId.forEach((String id, Object? day) {
            if (day is String) clean[id] = day;
          });
          out[ownerKey(email)] = clean;
        }
      });
      return out;
    } on Object {
      return <String, Map<String, String>>{};
    }
  }

  /// `recordDismissedAlerts` (`:212-231`).
  ///
  /// Re-reading prunes as it writes: a dismissal is stamped with today and anything
  /// older than the today-or-yesterday window is dropped, so the record cannot grow
  /// without bound on a long-lived device. Unlike [recordDeletions], an empty id list
  /// still returns early — the web prunes only when something new arrives.
  Future<void> recordDismissedAlerts(
    String? ownerEmail,
    Iterable<String> ids,
  ) async {
    if (!_hasOwner(ownerEmail)) return;
    final List<String> newIds = ids.toList();
    if (newIds.isEmpty) return;
    final String key = ownerKey(ownerEmail!);
    final Map<String, Map<String, String>> all = await _readDismissedAlerts();
    final String day = _today();
    final Map<String, String> mine = <String, String>{};
    (all[key] ?? const <String, String>{}).forEach((
      String id,
      String closedDay,
    ) {
      if (isAlertDayRecent(closedDay, nowMs: _nowMs())) mine[id] = closedDay;
    });
    for (final String id in newIds) {
      mine[id] = day;
    }
    all[key] = mine;
    await _guard(() => store.write(dismissedAlertsKey, jsonEncode(all)));
  }

  /// `getDismissedAlertIds` (`:234-242`) — only closings still inside the window.
  /// [nowMs] is a parameter for the same reason it is one on the web: the window is
  /// measured against the device clock, and a test has to be able to stand in it.
  Future<Set<String>> getDismissedAlertIds(
    String? ownerEmail, {
    int? nowMs,
  }) async {
    if (!_hasOwner(ownerEmail)) return <String>{};
    final Map<String, Map<String, String>> all = await _readDismissedAlerts();
    final Map<String, String> mine =
        all[ownerKey(ownerEmail!)] ?? const <String, String>{};
    final int ms = nowMs ?? _nowMs();
    return mine.entries
        .where(
          (MapEntry<String, String> e) => isAlertDayRecent(e.value, nowMs: ms),
        )
        .map((MapEntry<String, String> e) => e.key)
        .toSet();
  }

  // ---------------------------------------------------------------------------
  // The state mirror (:244-303)
  // ---------------------------------------------------------------------------

  /// `saveStateToStorage` (`:248-255`). The blob first, then the owner — the web's
  /// order, which leaves a mirror tagged to the previous owner if the second write
  /// fails. Reproduced because the boot guard reads the tag, not the blob.
  Future<void> saveStateToStorage(AppState state, {String? ownerEmail}) async {
    try {
      await store.write(stateKey, jsonEncode(state.toJson()));
      if (_hasOwner(ownerEmail)) {
        await store.write(stateOwnerKey, ownerKey(ownerEmail!));
      }
    } on Object {
      // `logger.error('Failed to preserve financial state offline:', error)`. A quota
      // or disk failure must not break the ledger screen the user is looking at.
    }
  }

  /// `loadStateFromStorage` (`:257-303`).
  ///
  /// Four branches, in the web's order: no mirror → default; a mirror owned by someone
  /// else → drop **both** keys and return default; the retired seed data → drop the
  /// mirror only (the owner tag stays) and return default; anything unparseable →
  /// default. Then the "ensure vital nodes exist" pass, which lives in
  /// `AppState.fromJson`.
  Future<AppState> loadStateFromStorage(
    AppState defaultState, {
    String? ownerEmail,
  }) async {
    try {
      final String? serialized = await store.read(stateKey);
      if (serialized == null || serialized.isEmpty) return defaultState;

      final String owner = await _readOwner();
      if (_hasOwner(ownerEmail) &&
          owner.isNotEmpty &&
          owner != ownerKey(ownerEmail!)) {
        await store.remove(stateKey);
        await store.remove(stateOwnerKey);
        return defaultState;
      }

      final Object? parsed;
      try {
        parsed = jsonDecode(serialized);
      } on FormatException {
        return defaultState;
      }
      // `JSON.parse` of `null` leaves the web throwing on `parsed.cashAccounts` and
      // landing in the same `return defaultState`; a non-object body is that branch.
      if (parsed is! Map<String, Object?>) return defaultState;

      if (_containsOldSeedData(parsed)) {
        await store.remove(stateKey);
        return defaultState;
      }

      return AppState.fromJson(parsed);
    } on Object {
      return defaultState;
    }
  }

  /// `parsed.cashAccounts.some(a => a.id === 'cash-wallet') || parsed.cards.some(…)
  /// === 'card-hnb'` (`:271-279`). The default seed shipped test rows; a mirror that
  /// still holds them predates the cleanup and is discarded outright.
  bool _containsOldSeedData(Map<String, Object?> parsed) {
    return _anyIdIs(parsed['cashAccounts'], 'cash-wallet') ||
        _anyIdIs(parsed['cards'], 'card-hnb');
  }

  bool _anyIdIs(Object? list, String id) {
    if (list is! List) return false;
    for (final Object? entry in list) {
      if (entry is Map<String, Object?> && entry['id'] == id) return true;
    }
    return false;
  }

  /// `(localStorage.getItem(STORAGE_OWNER_KEY) || '').trim().toLowerCase()` (`:264`).
  /// The tag is normalised on the way *in* as well as on the way out, or a tag written
  /// with different casing would fail the guard and the mirror would be deleted.
  Future<String> _readOwner() async => _norm(await store.read(stateOwnerKey));

  /// `savePreRestoreBackup` (`:307-313`) — the un-tagged copy a destructive restore
  /// keeps so the user can get the previous state back.
  Future<void> savePreRestoreBackup(AppState state) async {
    try {
      await store.write(restoreBackupKey, jsonEncode(state.toJson()));
    } on Object {
      // `logger.error('Failed to preserve pre-restore backup:', error)`.
    }
  }

  int _nowMs() => clock?.call() ?? DateTime.now().millisecondsSinceEpoch;

  String _today() => todayLocal(nowMs: clock == null ? null : _nowMs());
}
