import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'secure_key_value_store.dart';

/// Production [SecureKeyValueStore] — the iOS Keychain and the Android Keystore.
///
/// Ruling 2 and ruling 3 both land here: this is the only place in `lib/` allowed to touch
/// a plugin for persistence, which is what makes `identity_store.dart` and
/// `secure_cookie_storage.dart` testable without a device (`RecordingKeyValueStore`).
///
/// Two constraints from the package are load-bearing and recorded because they shaped the
/// data model rather than being worked around later:
///
/// * A value is capped at roughly 1900 bytes on the Android path, so this store holds
///   *credentials only* — a session token, an email, a device UUID, a serialised cookie
///   blob. The ledger never goes here; the non-secret entries live in the file store
///   behind `lib/data/key_value_store.dart`.
/// * `flutter_secure_storage` is a facade over the platform facility, not an encryption
///   layer of its own. A Dart-side AES envelope would have been unverifiable in a unit
///   test and would have added a key to manage, so the at-rest guarantee is the platform's
///   and the test in `test/auth/` proves only that the plaintext went nowhere else.
class FlutterSecureKeyValueStore implements SecureKeyValueStore {
  FlutterSecureKeyValueStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> remove(String key) => _storage.delete(key: key);

  @override
  Future<void> clear() => _storage.deleteAll();
}
