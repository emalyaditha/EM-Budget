import 'dart:io';

import 'key_value_store.dart';

/// Production [KeyValueStore] — one file per key under [root].
///
/// This is the answer to the gate question `key_value_store.dart` left open. It is a
/// plain file store rather than a database or a key-value plugin for three reasons:
///
/// * the web's `localStorage` is exactly that — a directory of independent string
///   values, no schema, no rows, no transactions, and the durability layer
///   (`src/utils.ts:85-303`) depends on each key standing alone: the owner-guard branch
///   removes `stateOwnerKey` without touching the mirror;
/// * the six values are whole JSON blobs, written by overwriting, never patched — a
///   relational store would add a schema to maintain for no behaviour the app uses;
/// * it keeps `lib/data/` free of a plugin, so the restart behaviour is testable on the
///   Dart VM with a temp directory instead of a device.
///
/// [root] is injected rather than discovered, because locating the app-support directory
/// needs `path_provider`, which is not yet an approved dependency. The app shell supplies
/// it in Phase 5; until then nothing outside tests constructs this class.
///
/// A write is a create-then-rename, not a truncate-then-write. `dart:io` maps `rename` to
/// `MoveFileExW(… MOVEFILE_REPLACE_EXISTING)` on Windows and `rename(2)` on POSIX, both of
/// which replace without a window in which the key reads as absent. Truncating in place
/// would open exactly that window, and a `null` read of `dirtyOwnerKey` inside it means
/// "nothing pending" to the hydration gate — which is the data-loss path `INVENTORY.md` §6
/// calls R4. The temp file is unlinked if the rename fails, so a write cannot leave a
/// stray file behind.
class FileKeyValueStore implements KeyValueStore {
  FileKeyValueStore(this.root);

  /// The directory holding the keys. Created on first write.
  final Directory root;

  int _tempCounter = 0;

  /// localStorage's contract: an unset key reads as `null`, not as an empty string.
  @override
  Future<String?> read(String key) async {
    final File file = _file(key);
    if (!await file.exists()) return null;
    return file.readAsString();
  }

  @override
  Future<void> write(String key, String value) async {
    final File file = _file(key);
    await root.create(recursive: true);
    final File temp = File('${file.path}.$pid.${_tempCounter++}.tmp');
    await temp.writeAsString(value, flush: true);
    try {
      await temp.rename(file.path);
    } on FileSystemException {
      // A destination that cannot be replaced (a different volume, an open handle on
      // Windows). The previous value stays intact and the write is reported as the
      // failure it is; `StateStorage._guard` turns that into "the marker did not move",
      // which is what the web's `try/catch` around `setItem` does.
      try {
        await temp.delete();
      } on FileSystemException {
        // The stray temp file is cosmetic; the value is what matters.
      }
      rethrow;
    }
  }

  @override
  Future<void> remove(String key) async {
    final File file = _file(key);
    if (await file.exists()) await file.delete();
  }

  /// The key becomes a file name, so it must be a name. Every key this store is used for
  /// is one of the six literals in `state_storage.dart`; anything that could escape
  /// [root] is refused rather than sanitised, because a sanitiser that maps two different
  /// keys onto one file silently merges two owners' markers.
  File _file(String key) {
    if (key.isEmpty) {
      throw ArgumentError.value(key, 'key', 'empty key name');
    }
    if (key == '.' || key == '..' || !_safe.hasMatch(key)) {
      throw ArgumentError.value(key, 'key', 'not a plain file name');
    }
    return File('${root.path}/$key');
  }

  static final RegExp _safe = RegExp(r'^[A-Za-z0-9][A-Za-z0-9_.\-]*$');
}
