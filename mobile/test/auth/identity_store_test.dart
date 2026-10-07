import 'package:em_budget/auth/identity_store.dart';
import 'package:em_budget/auth/secure_key_value_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_server.dart';

/// The holder is the answer to B-06/B-07: three web stores claimed to know who was signed
/// in, and the phone may have exactly one. Every test here is a way that could go wrong.
void main() {
  const email = 'qa-holder@example.com';
  final expiry = DateTime(2027, 1, 1).millisecondsSinceEpoch;
  final token = makeToken(email, expiry);

  late RecordingKeyValueStore store;
  late IdentityStore identity;

  setUp(() {
    store = RecordingKeyValueStore();
    identity = IdentityStore(store: store);
  });

  group('cold start', () {
    test('an empty store restores no identity', () async {
      expect(await identity.restore(), isNull);
      expect(identity.current, isNull);
    });

    test('a token with no email is dropped, not half-restored', () async {
      await store.write(IdentityStore.tokenKey, token);
      expect(await identity.restore(), isNull);
      expect(
        store.backing,
        isEmpty,
        reason: 'the orphan token must not survive the failed restore',
      );
    });

    test(
      'an email with no token is left alone — it is not a credential',
      () async {
        await store.write(IdentityStore.emailKey, email);
        expect(await identity.restore(), isNull);
        expect(store.backing[IdentityStore.emailKey], email);
      },
    );

    test(
      'a stored token that cannot be parsed is erased rather than replayed',
      () async {
        // The alternative is worse than it looks: every later call would send the garbage as
        // a Bearer and the server answers 401 with no message the UI has a string for.
        await store.write(
          IdentityStore.tokenKey,
          'truncated-but-not-parseable',
        );
        await store.write(IdentityStore.emailKey, email);
        expect(await identity.restore(), isNull);
        expect(store.backing, isEmpty);
      },
    );

    test('restores all three fields', () async {
      await store.write(IdentityStore.emailKey, email);
      await store.write(IdentityStore.tokenKey, token);
      await store.write(IdentityStore.deviceTokenKey, 'device-1');
      final restored = await identity.restore();
      expect(restored!.email, email);
      expect(restored.token, token);
      expect(restored.deviceToken, 'device-1');
      expect(restored.session!.expiresAt, expiry);
    });
  });

  group('login', () {
    test(
      'uses the web localStorage key names, so a reviewer can pair the lines',
      () async {
        await identity.save(email: email, token: token);
        expect(
          store.backing.keys,
          unorderedEquals(<String>[
            IdentityStore.emailKey,
            IdentityStore.tokenKey,
          ]),
        );
        expect(IdentityStore.emailKey, 'auth_user_email');
        expect(IdentityStore.tokenKey, 'auth_session_token');
        expect(IdentityStore.deviceTokenKey, 'auth_device_token');
      },
    );

    test('remember-me keeps the device token', () async {
      await identity.save(
        email: email,
        token: token,
        deviceToken: 'device-1',
        rememberMe: true,
      );
      expect(store.backing[IdentityStore.deviceTokenKey], 'device-1');
      expect(identity.current!.deviceToken, 'device-1');
    });

    test(
      'a plain login does not, even though the server always sends one',
      () async {
        // Every auth route returns a fresh `deviceToken` (`server.ts:1967-1968`); keeping it
        // is `App.tsx:4202`'s `if (rememberMe && deviceToken)`, and a device token is what
        // makes the trusted-device path skip a step.
        await identity.save(
          email: email,
          token: token,
          deviceToken: 'device-1',
          rememberMe: false,
        );
        expect(
          store.backing.containsKey(IdentityStore.deviceTokenKey),
          isFalse,
        );
        expect(identity.current!.deviceToken, isNull);
      },
    );

    test('a login without remember-me clears a device token left by the previous login', () async {
      await identity.save(
        email: email,
        token: token,
        deviceToken: 'device-1',
        rememberMe: true,
      );
      await identity.save(email: email, token: token, rememberMe: false);
      expect(store.backing.containsKey(IdentityStore.deviceTokenKey), isFalse);
    });

    test(
      'the email is stored as given, because the server is the normaliser',
      () async {
        // `App.tsx:4198` stores what the client typed, lower-cased by the caller at
        // `EmailLogin.tsx:345`, not by this object. Silent re-normalising here would mask a
        // server-side change to `normalizeEmailLower`.
        await identity.save(
          email: 'Mixed.Case@Example.com',
          token: makeToken('Mixed.Case@Example.com', expiry),
        );
        expect(store.backing[IdentityStore.emailKey], 'Mixed.Case@Example.com');
      },
    );
  });

  group('verify-session adoption', () {
    test(
      'replaces email and token and leaves the device token alone',
      () async {
        // `App.tsx:563-564` calls `setToken` and `setEmail` and nothing else.
        await identity.save(
          email: email,
          token: token,
          deviceToken: 'device-1',
          rememberMe: true,
        );
        final newToken = makeToken(email, expiry + 1000);
        await identity.adoptSession(email: email, token: newToken);
        expect(store.backing[IdentityStore.tokenKey], newToken);
        expect(store.backing[IdentityStore.deviceTokenKey], 'device-1');
      },
    );

    test(
      'adoption with no prior identity does not invent a device token',
      () async {
        await identity.adoptSession(email: email, token: token);
        expect(
          store.backing.containsKey(IdentityStore.deviceTokenKey),
          isFalse,
        );
      },
    );
  });

  group('logout', () {
    test('clears every key and the in-memory copy', () async {
      await identity.save(
        email: email,
        token: token,
        deviceToken: 'device-1',
        rememberMe: true,
      );
      await identity.clear();
      expect(store.backing, isEmpty);
      expect(identity.current, isNull);
      expect(await identity.restore(), isNull);
    });
  });

  group('nothing else may hold a session', () {
    test('the only writes are the three identity keys', () async {
      await identity.save(
        email: email,
        token: token,
        deviceToken: 'device-1',
        rememberMe: true,
      );
      await identity.adoptSession(
        email: email,
        token: makeToken(email, expiry + 1),
      );
      await identity.clear();
      expect(store.writes.map((w) => w.split('=').first).toSet(), <String>{
        IdentityStore.emailKey,
        IdentityStore.tokenKey,
        IdentityStore.deviceTokenKey,
      }, reason: 'a fourth key here is B-06 reappearing under another name');
    });
  });
}
