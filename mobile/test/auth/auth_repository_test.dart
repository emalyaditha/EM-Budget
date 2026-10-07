import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:em_budget/auth/api_client.dart';
import 'package:em_budget/auth/auth_repository.dart';
import 'package:em_budget/auth/identity_store.dart';
import 'package:em_budget/auth/secure_cookie_storage.dart';
import 'package:em_budget/auth/secure_key_value_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_server.dart';

/// The five behaviours the Phase 3 ruling named: login, logout, remember-me, 401 handling,
/// and logout clearing everything. Each is asserted against what the unchanged server
/// actually does, with the route's own line numbers as the reason.
void main() {
  const base = 'https://api.example.test';
  const typedEmail = 'QA-Login@Example.com';
  const servedEmail = 'qa-login@example.com';
  final loginToken = makeToken(
    servedEmail,
    DateTime(2027, 1, 1).millisecondsSinceEpoch,
  );
  final rotatedToken = makeToken(
    servedEmail,
    DateTime(2028, 1, 1).millisecondsSinceEpoch,
  );

  late RecordingKeyValueStore store;
  late IdentityStore identity;
  late PersistCookieJar jar;
  late StubbedServer server;
  late AuthRepository auth;

  void route(Reply Function(RequestOptions) handler) {
    server = StubbedServer(handler);
    auth = AuthRepository(
      identity: identity,
      api: ApiClient(
        identity: identity,
        cookieJar: jar,
        baseUrl: base,
        adapter: server,
      ),
      cookieJar: jar,
    );
  }

  Reply loginRoute(RequestOptions o) {
    final ok =
        o.path.contains('login-password') ||
        o.path.contains('register') ||
        o.path.contains('reset-password');
    if (!ok) return json(body: {'success': true});
    return withSessionCookie(
      body: {'success': true, 'token': loginToken, 'deviceToken': 'device-9'},
      token: loginToken,
    );
  }

  /// The store holds the identity keys and the cookie jar's blob side by side. "Logout
  /// clears everything" means both; "a failed session check clears the session" means only
  /// the first — the cookie is the server's to expire, and it stays until `logout()` deletes
  /// the jar. Assertions pick the one they mean.
  List<String> credentialKeys() => store.backing.keys
      .where((k) => !k.startsWith(SecureCookieStorage.defaultKeyPrefix))
      .toList();

  setUp(() {
    store = RecordingKeyValueStore();
    identity = IdentityStore(store: store);
    jar = PersistCookieJar(storage: SecureCookieStorage(store: store));
    route(loginRoute);
  });

  group('login', () {
    test(
      'a successful password login stores the session and sets the cookie',
      () async {
        final result = await auth.loginPassword(
          email: typedEmail,
          password: 'hunter2Pass1',
        );
        expect(result.success, isTrue);
        expect(
          identity.current!.email,
          servedEmail,
          reason: 'the client lower-cases, EmailLogin.tsx:345',
        );
        expect(identity.current!.token, loginToken);
        expect(
          server.requests.single.headers.containsKey('authorization'),
          isFalse,
          reason: 'no session yet at login',
        );
        // The cookie the server set must already be in the secure store, not in memory only.
        expect(
          await jar.loadForRequest(Uri.parse('$base/api/health')),
          isNotEmpty,
        );
      },
    );

    test(
      'the body is the web body: trimmed email, password, rememberMe',
      () async {
        await auth.loginPassword(
          email: '  $typedEmail  ',
          password: 'x',
          rememberMe: true,
        );
        expect(server.requests.single.data, {
          'email': typedEmail,
          'password': 'x',
          'rememberMe': true,
        });
      },
    );

    test(
      'a 401 does not store a session and keeps the failure fields',
      () async {
        route(
          (_) => json(
            status: 401,
            body: {
              'success': false,
              'error': 'Invalid email or password.',
              'code': 'BAD_CREDENTIALS',
              'attemptsRemaining': 4,
              'retryAfter': 0,
            },
          ),
        );
        final result = await auth.loginPassword(
          email: typedEmail,
          password: 'wrong',
        );
        expect(result.success, isFalse);
        expect(result.status, 401);
        expect(result.code, 'BAD_CREDENTIALS');
        expect(result.attemptsRemaining, 4);
        expect(
          store.backing,
          isEmpty,
          reason: 'a failed login must write nothing anywhere',
        );
      },
    );

    test('a 429 exposes retryAfter so the UI can reproduce its countdown, and writes nothing', () async {
      route(
        (_) => json(
          status: 429,
          body: {'success': false, 'error': 'Too many', 'retryAfter': 42},
        ),
      );
      final result = await auth.loginPassword(email: typedEmail, password: 'x');
      expect(result.retryAfter, 42);
      expect(store.backing, isEmpty);
    });

    test('a success without a token still stores, because that is what the web does', () async {
      // `EmailLogin.tsx:345` passes `data.token || ''` on, so an empty credential becomes
      // the session. B-18 records it; the port reproduces it rather than "fixing" it.
      route((_) => json(body: {'success': true}));
      final result = await auth.loginPassword(email: typedEmail, password: 'x');
      expect(result.success, isTrue);
      expect(store.backing[IdentityStore.tokenKey], '');
      // And the holder's cold start then refuses it, which is the phone's own backstop.
      expect(await IdentityStore(store: store).restore(), isNull);
    });
  });

  group('remember-me', () {
    test('true keeps the device token, false discards it although the server sent one', () async {
      await auth.loginPassword(
        email: typedEmail,
        password: 'x',
        rememberMe: true,
      );
      expect(store.backing[IdentityStore.deviceTokenKey], 'device-9');

      route(loginRoute);
      await auth.loginPassword(
        email: typedEmail,
        password: 'x',
        rememberMe: false,
      );
      expect(store.backing.containsKey(IdentityStore.deviceTokenKey), isFalse);
      expect(identity.current!.deviceToken, isNull);
    });

    test('the register route takes the same flag to the same place', () async {
      await auth.register(
        email: typedEmail,
        password: 'x',
        otp: '123456',
        rememberMe: true,
      );
      expect(server.requests.single.data, {
        'email': typedEmail,
        'password': 'x',
        'otp': '123456',
        'rememberMe': true,
      });
      expect(store.backing[IdentityStore.deviceTokenKey], 'device-9');
    });
  });

  group('401 handling', () {
    test('verify-session answers 200 with success:false, and that still clears the session', () async {
      // `server.ts:3149-3168` uses `res.json(...)` with no status code, so `resp.ok` is
      // true for an expired session. `App.tsx:641-647` reads `data.success` and clears.
      await auth.loginPassword(email: typedEmail, password: 'x');
      expect(identity.current, isNotNull);
      route(
        (_) => json(
          body: {
            'success': false,
            'error': 'Session token is invalid or expired.',
          },
        ),
      );
      final result = await auth.verifySession();
      expect(result.status, 200);
      expect(result.success, isFalse);
      expect(identity.current, isNull);
      expect(
        credentialKeys(),
        isEmpty,
        reason: 'the cookie jar keeps its own keys until logout',
      );
    });

    test(
      'an unrelated 401 from another route does not sign the user out',
      () async {
        // There is no global 401 interceptor on the web — `appLock.ts:65` returns null and
        // `ReceiptScanner.tsx:217` sets a message — so adding one on the phone would be a
        // behaviour change, not a port.
        await auth.loginPassword(email: typedEmail, password: 'x');
        route(
          (_) => json(
            status: 401,
            body: {'success': false, 'error': 'Unauthorized'},
          ),
        );
        final response = await ApiClient(
          identity: identity,
          cookieJar: jar,
          baseUrl: base,
          adapter: StubbedServer(
            (_) => json(
              status: 401,
              body: {'success': false, 'error': 'Unauthorized'},
            ),
          ),
        ).post('/api/app-lock/status', {'email': servedEmail});
        expect(response.isUnauthorized, isTrue);
        expect(
          identity.current,
          isNotNull,
          reason: 'the session survives a 401 it did not cause',
        );
      },
    );

    test('a transport failure is not treated as an expired session', () async {
      // Losing the network on the bus must not wipe the credential: the web's boot path
      // catches and leaves the state alone (`App.tsx:649-652` sets only the spinner).
      await auth.loginPassword(email: typedEmail, password: 'x');
      final before = identity.current!.token;
      route(
        (_) => throw DioException(
          requestOptions: RequestOptions(path: '/x'),
          type: DioExceptionType.connectionTimeout,
          message: 'offline',
        ),
      );
      final result = await auth.verifySession();
      expect(
        result.status,
        isNull,
        reason: 'no HTTP answer at all is not an expired session',
      );
      expect(identity.current!.token, before);
    });
  });

  group('verify-session success', () {
    test('is called with the cookie only — no Bearer — which is the web boot request', () async {
      // A real cold start: the login happened in a previous run, so the credential the
      // phone has is whatever the jar persisted. `App.tsx:540-550` then posts `{}` with no
      // Authorization and lets the cookie speak.
      await auth.loginPassword(email: typedEmail, password: 'x');
      expect(
        await jar.loadForRequest(Uri.parse('$base/api/auth/verify-session')),
        isNotEmpty,
      );

      final stale = makeToken(servedEmail, 1_000);
      await identity.save(email: servedEmail, token: stale, rememberMe: true);
      await identity.restore();

      route(
        (_) => json(
          body: {'success': true, 'token': rotatedToken, 'email': servedEmail},
        ),
      );
      await auth.verifySession();
      final headers = server.requests.single.headers;
      expect(
        headers.containsKey('authorization'),
        isFalse,
        reason: 'a stale Bearer would beat a good cookie (server.ts:1342-1348)',
      );
      expect(server.requests.single.data, <String, Object?>{});
      expect(
        headers['cookie'],
        isNotNull,
        reason: 'the persisted jar is the credential at cold start',
      );
      expect(identity.current!.token, rotatedToken);
    });

    test('adopts the email and token the server returns, and keeps the device token', () async {
      await identity.save(
        email: typedEmail,
        token: makeToken(typedEmail, 1_000),
        deviceToken: 'device-9',
        rememberMe: true,
      );
      await identity.restore();
      route(
        (_) => json(
          body: {'success': true, 'token': rotatedToken, 'email': servedEmail},
        ),
      );
      final result = await auth.verifySession();
      expect(result.success, isTrue);
      expect(result.email, servedEmail);
      expect(identity.current!.email, servedEmail);
      expect(identity.current!.token, rotatedToken);
      expect(store.backing[IdentityStore.deviceTokenKey], 'device-9');
    });

    test(
      'a missing token in the answer counts as failure and clears',
      () async {
        route((_) => json(body: {'success': true, 'email': servedEmail}));
        final result = await auth.verifySession();
        expect(
          result.success,
          isFalse,
          reason: 'App.tsx:554-559 requires both token and email',
        );
        expect(credentialKeys(), isEmpty);
      },
    );

    test('an account that no longer exists clears the local session', () async {
      route(
        (_) => json(
          body: {'success': false, 'error': 'Account no longer exists.'},
        ),
      );
      await identity.save(email: servedEmail, token: loginToken);
      final result = await auth.verifySession();
      expect(result.error, 'Account no longer exists.');
      expect(identity.current, isNull);
    });
  });

  group('logout clears everything', () {
    test(
      'identity and cookies both go, and the request is authenticated',
      () async {
        await auth.loginPassword(
          email: typedEmail,
          password: 'x',
          rememberMe: true,
        );
        expect(store.backing, isNotEmpty);

        route((_) => json(body: {'success': true}));
        await auth.logout();

        expect(
          store.backing,
          isEmpty,
          reason: 'no credential of any kind survives logout',
        );
        expect(identity.current, isNull);
        expect(
          await jar.loadForRequest(Uri.parse('$base/api/health')),
          isEmpty,
        );
        expect(
          server.requests.single.headers['authorization'],
          'Bearer $loginToken',
        );
      },
    );

    test(
      'local state is cleared even when the server is unreachable',
      () async {
        // `App.tsx:496-518` fires the POST with `.catch(() => {})` and clears regardless; the
        // phone has no browser to expire its cookie for it, so the jar wipe is local too.
        await auth.loginPassword(
          email: typedEmail,
          password: 'x',
          rememberMe: true,
        );
        route(
          (_) => throw DioException(
            requestOptions: RequestOptions(path: '/x'),
            type: DioExceptionType.connectionTimeout,
            message: 'offline',
          ),
        );
        await auth.logout();
        expect(store.backing, isEmpty);
        expect(identity.current, isNull);
      },
    );

    test('logout before any login is harmless', () async {
      route((_) => json(body: {'success': true}));
      await auth.logout();
      expect(store.backing, isEmpty);
      expect(
        server.requests.single.headers.containsKey('authorization'),
        isFalse,
      );
    });
  });

  group('otp and the dead headers', () {
    test('send-otp surfaces the dev bypass fields the web reads', () async {
      route(
        (_) => json(
          body: {
            'success': true,
            'emailSent': false,
            'devOtp': '123456',
            'info': 'Dev mode: …',
          },
        ),
      );
      final result = await auth.sendOtp(typedEmail);
      expect(result.emailSent, isFalse);
      expect(result.devOtp, '123456');
      expect(server.requests.single.data, {'email': typedEmail.trim()});
    });

    test(
      'verify-otp always sends forRegistrationOrReset and never a rememberMe',
      () async {
        // `EmailLogin.tsx:292-296`. The route mints a 24 h session regardless
        // (`server.ts:1823-1824`), so sending the flag here would imply a choice the server
        // does not make.
        await auth.verifyOtp(email: typedEmail, otp: ' 123456 ');
        expect(server.requests.single.data, {
          'email': typedEmail,
          'otp': '123456',
          'forRegistrationOrReset': true,
        });
      },
    );

    test('no request carries x-supabase-url or x-supabase-key', () async {
      // `EmailLogin.tsx:167-174` attaches them to every auth call; `getSupabase(_req)`
      // (`server.ts:433`) ignores its argument entirely. B-17.
      await auth.loginPassword(email: typedEmail, password: 'x');
      await auth.sendOtp(typedEmail);
      for (final request in server.requests) {
        expect(request.headers.keys, isNot(contains('x-supabase-url')));
        expect(request.headers.keys, isNot(contains('x-supabase-key')));
      }
    });

    test('check-email reads `exists`, and no cached answer is allowed to skip the jitter', () async {
      route((_) => json(body: {'success': true, 'exists': false}));
      final missing = await auth.checkEmail(typedEmail);
      expect(missing.exists, isFalse);
      expect(missing.responseReceived, isTrue);
      final firstRound = server;
      route((_) => json(body: {'success': true, 'exists': true}));
      expect((await auth.checkEmail(typedEmail)).exists, isTrue);
      // `route()` installs a fresh stub, so the two counts below are two independent proofs
      // that neither answer was reused: both servers saw exactly one request.
      expect(firstRound.requests, hasLength(1));
      expect(server.requests, hasLength(1));
    });
  });
}
