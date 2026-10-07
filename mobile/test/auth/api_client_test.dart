import 'dart:convert';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:em_budget/auth/api_client.dart';
import 'package:em_budget/auth/identity_store.dart';
import 'package:em_budget/auth/secure_cookie_storage.dart';
import 'package:em_budget/auth/secure_key_value_store.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fake_server.dart';

void main() {
  const base = 'https://api.example.test';
  const email = 'qa-client@example.com';
  final token = makeToken(email, DateTime(2027, 1, 1).millisecondsSinceEpoch);

  late RecordingKeyValueStore store;
  late IdentityStore identity;
  late PersistCookieJar jar;
  late StubbedServer server;
  late ApiClient api;

  ApiClient build(Reply Function(RequestOptions) handler) {
    server = StubbedServer(handler);
    return ApiClient(
      identity: identity,
      cookieJar: jar,
      baseUrl: base,
      adapter: server,
    );
  }

  setUp(() {
    store = RecordingKeyValueStore();
    identity = IdentityStore(store: store);
    jar = PersistCookieJar(storage: SecureCookieStorage(store: store));
    api = build((_) => json(body: {'success': true}));
  });

  Future<void> signIn() =>
      identity.save(email: email, token: token, rememberMe: true);

  group('the request the server expects', () {
    test('sends no Origin header — the /api guard admits a native client because of it', () async {
      // `server.ts:1384-1405`. If a future interceptor added `Origin`, every call would
      // become a 403 with nothing in the response body to explain it.
      await api.post('/api/auth/login-password', {'email': email});
      expect(server.headersOf(0).containsKey('origin'), isFalse);
    });

    test('attaches Bearer while a session is held, and only then', () async {
      await api.post('/api/auth/check-email', {'email': email});
      expect(server.headersOf(0).containsKey('authorization'), isFalse);

      await signIn();
      await api.post('/api/auth/logout', {});
      expect(server.headersOf(1)['authorization'], 'Bearer $token');
    });

    test('sendBearer: false keeps the header off even with a session — verify-session relies on this', () async {
      await signIn();
      await api.post('/api/auth/verify-session', {}, sendBearer: false);
      expect(server.headersOf(0).containsKey('authorization'), isFalse);
    });

    test(
      'the header is exactly Content-Type: application/json, as fetch sends it',
      () async {
        await api.post('/api/auth/send-otp', {'email': email});
        expect(server.headersOf(0)['content-type'], 'application/json');
      },
    );

    test(
      'a JSON body is encoded, and `{}` stays `{}` rather than being dropped',
      () async {
        // `App.tsx:505` and `:548` both send `JSON.stringify({})`; an empty-map body that dio
        // silently omits would change the request shape the server reads.
        await api.post('/api/auth/verify-session', const {});
        final sent = server.requests.first;
        expect(sent.data, isA<Map<String, Object?>>());
        expect(jsonEncode(sent.data), '{}');
      },
    );

    test(
      'timeouts match the web: 10s default, 6s for the boot session check',
      () async {
        await api.post('/api/auth/login-password', {'email': email});
        expect(server.requests.first.connectTimeout, ApiClient.defaultTimeout);
        expect(server.requests.first.receiveTimeout, ApiClient.defaultTimeout);

        await api.post(
          '/api/auth/verify-session',
          const {},
          timeout: ApiClient.verifySessionTimeout,
        );
        expect(server.requests.last.receiveTimeout, const Duration(seconds: 6));
      },
    );
  });

  group('the cookie jar is wired', () {
    test(
      'a Set-Cookie from the server is stored, and the next request carries it',
      () async {
        api = build(
          (o) => o.path.contains('login')
              ? withSessionCookie(
                  body: {'success': true, 'token': token},
                  token: token,
                )
              : json(body: {'success': true}),
        );
        await api.post('/api/auth/login-password', {'email': email});
        expect(
          store.backing.keys.any(
            (k) => k.startsWith(SecureCookieStorage.defaultKeyPrefix),
          ),
          isTrue,
        );

        await api.post('/api/auth/verify-session', const {}, sendBearer: false);
        final cookie = server.requests.last.headers['cookie'] as String?;
        expect(cookie, isNotNull);
        expect(Uri.decodeComponent(cookie!), contains(token));
      },
    );

    test('a 4xx response still runs the jar, because dio was told to accept every status', () async {
      // `validateStatus: (_) => true` is what lets callsites branch on `resp.status` the way
      // `ReceiptScanner.tsx:217` and `appLock.ts:65` do, instead of throwing first.
      api = build(
        (_) => json(
          status: 401,
          body: {'success': false, 'error': 'Invalid email or password.'},
        ),
      );
      final result = await api.post('/api/auth/login-password', {
        'email': email,
      });
      expect(result.status, 401);
      expect(result.ok, isFalse);
      expect(result.isUnauthorized, isTrue);
      expect(result.serverError, 'Invalid email or password.');
    });
  });

  group('safeJson is the twin of src/lib/api.ts:5-13', () {
    test('an empty body is null, not an exception', () async {
      api = build((_) => empty());
      final result = await api.post('/api/health', const {});
      expect(result.json, isNull);
      expect(result.ok, isTrue);
    });

    test('a non-JSON body is null, which is what makes the fallback strings reachable', () async {
      // `if (!data) throw new Error('Empty response from API …')` (`EmailLogin.tsx:336-340`)
      // only fires because safeJson swallowed the HTML. If parsing threw here, the UI would
      // show a DioException instead of that message.
      api = build((_) => html(body: '<!doctype html><h1>502 Bad Gateway</h1>'));
      final result = await api.post('/api/auth/send-otp', {'email': email});
      expect(result.json, isNull);
      expect(result.status, 500);
    });

    test('a JSON array body is not an object, so `json` stays null', () async {
      api = build((_) => json(body: <String>['a']));
      expect((await api.post('/api/x', const {})).json, isNull);
    });

    test(
      'retryAfter is read as an int when the server sends a number',
      () async {
        api = build(
          (_) => json(
            status: 429,
            body: {'success': false, 'error': 'Too many', 'retryAfter': 37},
          ),
        );
        final result = await api.post('/api/auth/login-password', {
          'email': email,
        });
        expect(result.status, 429);
        expect(result.json!['retryAfter'], 37);
      },
    );
  });

  group('transport failure', () {
    test('is a null status with a message, not a thrown exception', () async {
      api = build(
        (_) => throw DioException(
          requestOptions: RequestOptions(path: '/x'),
          type: DioExceptionType.connectionTimeout,
          message: 'connection timed out',
        ),
      );
      final result = await api.post('/api/auth/login-password', {
        'email': email,
      });
      expect(result.hasResponse, isFalse);
      expect(result.status, isNull);
      expect(result.transportError, contains('timed out'));
    });
  });
}
