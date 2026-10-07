/// The only persistence primitive the auth layer is allowed to use.
///
/// Landmine 9 in `INVENTORY.md` §5 is that the web app has two different objects claiming
/// to know who is signed in (`src/lib/authSession.ts`, memory only, used by `appLock.ts`;
/// and `src/services/authSession.ts`, used by `supabase.ts`) **plus** a third copy in
/// `localStorage.auth_session_token` (`App.tsx:4201`, read by `ReceiptScanner.tsx:211`).
/// B-06/B-07 are the recorded bugs. Ruling 3 collapses all three into the one holder in
/// `identity_store.dart`, and this interface is what makes that testable: every write goes
/// through it, so a test can prove nothing sensitive escapes to another store.
abstract class SecureKeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> remove(String key);

  /// Removes every key this app owns. `logout` must call it — see
  /// `auth_repository.dart` — because a partial clear leaves a session behind.
  Future<void> clear();
}

/// Test double. Records the exact string each key held, which is how the at-rest tests in
/// `test/auth/` assert that the plaintext token and the raw cookie are never written to any
/// non-secure store.
class RecordingKeyValueStore implements SecureKeyValueStore {
  final Map<String, String> backing = {};
  final List<String> writes = [];

  @override
  Future<String?> read(String key) async => backing[key];

  @override
  Future<void> write(String key, String value) async {
    backing[key] = value;
    writes.add('$key=$value');
  }

  @override
  Future<void> remove(String key) async => backing.remove(key);

  @override
  Future<void> clear() async => backing.clear();
}
