/// The persistence primitive for everything that is **not** a secret.
///
/// `src/utils.ts:85-303` keeps six plain `localStorage` entries: the state mirror, its
/// owner tag, the dirty flag, the deletion tombstones, the dismissed alerts and the
/// pre-restore backup. None of them is a credential, and all of them are read on the
/// boot fast path before the cloud has answered, which is why they stay out of
/// `SecureKeyValueStore` (`lib/auth/secure_key_value_store.dart`) — that one is for the
/// session identity and is deliberately slow.
///
/// Which phone-side store backs this is answered by `file_key_value_store.dart`: one file
/// per key under the app-support directory, which is the shape `localStorage` has and the
/// shape the six entries above need. The interface is what the durability layer is written
/// against, and the tests inject [InMemoryKeyValueStore] when they only need to watch a
/// write; `test/data/durability_restart_test.dart` runs the same assertions against the
/// file store.
abstract class KeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> remove(String key);
}

/// Test double: the map the web's `localStorage` was, with the writes recorded so a
/// test can see a write that should not have happened (the owner-guard branches remove
/// rather than rewrite).
class InMemoryKeyValueStore implements KeyValueStore {
  final Map<String, String> backing = <String, String>{};
  final List<String> log = <String>[];

  @override
  Future<String?> read(String key) async => backing[key];

  @override
  Future<void> write(String key, String value) async {
    backing[key] = value;
    log.add('set $key');
  }

  @override
  Future<void> remove(String key) async {
    if (backing.remove(key) != null) log.add('remove $key');
  }
}
