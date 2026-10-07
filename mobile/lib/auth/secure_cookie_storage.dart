import 'package:cookie_jar/cookie_jar.dart';

import 'secure_key_value_store.dart';

/// A `cookie_jar` [Storage] that writes through [SecureKeyValueStore] instead of
/// [FileStorage].
///
/// This exists because of one line in the ruling: the session cookie "must persist across
/// restarts, **be stored encrypted**, and name the package used". The packages named are
/// `dio 5.11.1` + `dio_cookie_manager 3.5.0` + `cookie_jar 4.0.9`, and the plain answer —
/// `PersistCookieJar(dir: …)` — fails that requirement: `FileStorage` puts a
/// human-readable JSON blob of the `session_token` cookie in the app's documents
/// directory, which is readable on a rooted/emulated device and is backed up by iOS.
/// `PersistCookieJar` accepts an injected [Storage], so only the sink is replaced; the
/// cookie policy, expiry filtering and the `.index`/`.domains` bookkeeping stay
/// `cookie_jar`'s own code (`src/jar/persist.dart`), which is what keeps the
/// `Max-Age=0` clear on logout working (`persist.dart:141-154` drops the expired cookie
/// when re-serialising).
///
/// What the tests in `test/auth/` can and cannot prove:
/// * **Proved** — every cookie byte leaves the app through this one object, the only
///   injected sink is the secure one, and nothing else in `lib/` receives the value.
/// * **Not provable in a unit test** — that the Keychain/Keystore encrypted it. That is
///   `flutter_secure_storage`'s claim, not ours, and a Dart test cannot read the raw
///   platform store. The at-rest check that matters is asserted here as
///   "the plaintext went to no other store"; the device-level confirmation is a Phase 5
///   task once the Android SDK lands (D11/#41).
class SecureCookieStorage implements Storage {
  SecureCookieStorage({required this.store, this.keyPrefix = defaultKeyPrefix});

  /// The jar's own keys are hostnames plus `.index` and `.domains`
  /// (`persist.dart:36-37`). They share one namespace with the identity keys, so they are
  /// prefixed rather than trusted not to collide.
  static const String defaultKeyPrefix = 'cookie_jar.';

  final SecureKeyValueStore store;
  final String keyPrefix;

  String _k(String key) => '$keyPrefix$key';

  /// `cookie_jar` asks the storage to prepare itself; the platform store needs no
  /// preparation, and `persistSession`/`ignoreExpires` are honoured by the jar itself
  /// (`persist.dart:141-154`), so there is nothing to configure here.
  @override
  Future<void> init(bool persistSession, bool ignoreExpires) async {}

  @override
  Future<String?> read(String key) => store.read(_k(key));

  @override
  Future<void> write(String key, String value) => store.write(_k(key), value);

  @override
  Future<void> delete(String key) => store.remove(_k(key));

  @override
  Future<void> deleteAll(List<String> keys) async {
    for (final key in keys) {
      await store.remove(_k(key));
    }
  }
}
