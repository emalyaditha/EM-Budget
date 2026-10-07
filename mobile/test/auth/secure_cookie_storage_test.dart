import 'package:cookie_jar/cookie_jar.dart';
import 'package:em_budget/auth/identity_store.dart';
import 'package:em_budget/auth/secure_cookie_storage.dart';
import 'package:em_budget/auth/secure_key_value_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_server.dart';

/// D21: three claims about the session cookie, each with the package that makes it true
/// named in the assertion so a reviewer can check the dependency rather than the prose.
///
/// What is *not* claimed here: that the bytes are encrypted at rest. That is
/// `flutter_secure_storage` delegating to the iOS Keychain and the Android Keystore, and no
/// Dart test can read the platform store to confirm it. What a test can prove — and does,
/// below — is that the plaintext cookie has exactly one sink and it is the secure one, and
/// that nothing else in the app ever receives it. The device-level confirmation is booked
/// for Phase 5 with the Android SDK (#41).
void main() {
  const host = 'api.example.test';
  final uri = Uri.https(host, '/api/auth/login-password');
  const email = 'qa-cookie@example.com';
  final token = makeToken(email, DateTime(2027, 1, 1).millisecondsSinceEpoch);

  late RecordingKeyValueStore store;
  late PersistCookieJar jar;

  /// A fresh jar over the *same* store is how a process restart looks to this code: the
  /// platform store survives, the Dart object does not.
  PersistCookieJar newJar() => PersistCookieJar(
    storage: SecureCookieStorage(store: store),
    persistSession: true,
  );

  setUp(() {
    store = RecordingKeyValueStore();
    jar = newJar();
  });

  /// Exactly the Set-Cookie the server writes (`server.ts:1322-1326`).
  Future<void> receiveSessionCookie({int maxAgeSeconds = 86400}) async {
    await jar.saveFromResponse(uri, [
      Cookie('session_token', Uri.encodeComponent(token))
        ..path = '/'
        ..httpOnly = true
        ..maxAge = maxAgeSeconds,
    ]);
  }

  group('1. it persists across a restart', () {
    test(
      'a jar built after the restart loads the cookie from the store',
      () async {
        await receiveSessionCookie();
        expect(
          store.backing.keys,
          containsAll(<String>[
            '${SecureCookieStorage.defaultKeyPrefix}$host',
            '${SecureCookieStorage.defaultKeyPrefix}.index',
          ]),
        );

        final afterRestart = newJar();
        final sent = await afterRestart.loadForRequest(uri);
        expect(sent, hasLength(1));
        expect(sent.single.name, 'session_token');
        expect(Uri.decodeComponent(sent.single.value), token);
      },
    );

    test('the default FileStorage is never used, so no cookie JSON lands in the documents dir', () async {
      await receiveSessionCookie();
      // The only writes are the jar's, and every one of them went through the injected
      // storage: `SecureCookieStorage` prefixes, `FileStorage` writes files and would leave
      // no trace in `store` at all.
      expect(store.writes, isNotEmpty);
      expect(
        store.backing.keys.every(
          (k) => k.startsWith(SecureCookieStorage.defaultKeyPrefix),
        ),
        isTrue,
        reason:
            'cookie bytes must only ever reach the secure store: ${store.backing.keys}',
      );
    });

    test('a session cookie with no Max-Age still persists, because persistSession is true', () async {
      await jar.saveFromResponse(uri, [
        Cookie('session_token', Uri.encodeComponent(token))..path = '/',
      ]);
      final afterRestart = newJar();
      expect(await afterRestart.loadForRequest(uri), hasLength(1));
    });
  });

  group('2. the plaintext reaches no other store', () {
    test('the cookie is written to the jar namespace only, never to an identity key', () async {
      await receiveSessionCookie();
      await IdentityStore(store: store)
          .save(email: email, token: token, rememberMe: true);

      final leakedToIdentityKeys = <String>[
        for (final key in store.backing.keys)
          if (!key.startsWith(SecureCookieStorage.defaultKeyPrefix) &&
              key != IdentityStore.tokenKey &&
              key != IdentityStore.emailKey)
            key,
      ];
      expect(leakedToIdentityKeys, isEmpty);

      // And the jar's own blob is the only place the cookie value appears besides the
      // identity token — i.e. the cookie is a copy the server asked for, not a second
      // authority the app invented.
      final holders =
          store.backing.entries
              .where((e) => e.value.contains(token))
              .map((e) => e.key)
              .toList()
            ..sort();
      expect(
        holders,
        <String>[
          IdentityStore.tokenKey,
          '${SecureCookieStorage.defaultKeyPrefix}$host',
        ],
        reason: 'exactly two places may hold the token string; found $holders',
      );
    });

    test('cookie-jar keys are namespaced so they cannot collide with the identity keys', () async {
      await store.write(host, 'an identity-shaped key');
      await receiveSessionCookie();
      expect(
        store.backing[host],
        'an identity-shaped key',
        reason: 'the jar must write only prefixed keys',
      );
    });
  });

  group('3. logout deletes it', () {
    test(
      'the Max-Age=0 the server sends on logout removes it from the store',
      () async {
        // `server.ts:1339-1343` `clearSessionCookie` → `Max-Age=0`, and `cookie_jar` drops
        // expired cookies when it re-serialises (`persist.dart:141-154`). This is the path a
        // real logout takes; `deleteAll` below is the belt that fires even if the server was
        // unreachable.
        await receiveSessionCookie();
        expect(await newJar().loadForRequest(uri), hasLength(1));

        await receiveSessionCookie(maxAgeSeconds: 0);
        expect(await newJar().loadForRequest(uri), isEmpty);
      },
    );

    test('deleteAll empties both the store and a freshly built jar', () async {
      await receiveSessionCookie();
      await jar.deleteAll();
      expect(store.backing, isEmpty);
      expect(await newJar().loadForRequest(uri), isEmpty);
    });

    test('deleteAll leaves the identity keys alone, so ordering in logout cannot wipe the wrong thing', () async {
      // `AuthRepository.logout` clears the identity first and the jar second; if the jar
      // wipe reached into `auth_*` keys, the test for "logout clears everything" would pass
      // for the wrong reason.
      await receiveSessionCookie();
      final identity = IdentityStore(store: store);
      await identity.save(email: email, token: token, rememberMe: true);
      await jar.deleteAll();
      expect(
        store.backing.keys,
        containsAll(<String>[IdentityStore.emailKey, IdentityStore.tokenKey]),
      );
      expect(
        store.backing.keys.any(
          (k) => k.startsWith(SecureCookieStorage.defaultKeyPrefix),
        ),
        isFalse,
      );
    });

    test('a jar cleared after a restart cannot resurrect the cookie', () async {
      await receiveSessionCookie();
      final surviving = newJar();
      await surviving.deleteAll();
      expect(await newJar().loadForRequest(uri), isEmpty);
    });
  });

  group('cookie policy is the package\'s, not ours', () {
    test('a cookie for another host is not sent', () async {
      await receiveSessionCookie();
      final other = await newJar().loadForRequest(
        Uri.https('other.example.test', '/api/health'),
      );
      expect(other, isEmpty);
    });

    test('a Path=/ cookie is sent to a deeper API path', () async {
      await receiveSessionCookie();
      expect(
        await newJar().loadForRequest(Uri.https(host, '/api/app-lock/status')),
        hasLength(1),
      );
    });
  });
}
