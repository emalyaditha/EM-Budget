import 'dart:convert';

import 'package:dio/dio.dart';

/// A stand-in for `server.ts`, at the HTTP layer.
///
/// These tests touch no database and no network: the standing rule from the Phase 3 gate is
/// that anything reaching the live database must create its own uniquely-prefixed tenant and
/// delete it in a `finally` block, and an auth unit test has no business being in that
/// category. Everything below is answered locally.
///
/// The stub sits under dio's interceptor chain, so the `CookieManager` and the jar are the
/// real ones — that is the whole reason to fake at this level rather than to hand-build
/// `ApiResponse` objects.
class StubbedServer implements HttpClientAdapter {
  StubbedServer(this._handler);

  final Reply Function(RequestOptions options) _handler;
  final List<RequestOptions> requests = [];

  Iterable<String> get paths => requests.map((r) => r.path);

  /// The headers as the server would have seen them, for the "no Origin" style of check.
  Map<String, dynamic> headersOf(int index) => requests[index].headers;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final reply = _handler(options);
    return ResponseBody.fromString(
      reply.body,
      reply.status,
      headers: reply.headers,
    );
  }
}

class Reply {
  const Reply({
    required this.status,
    required this.body,
    this.headers = const {},
  });

  final int status;
  final String body;
  final Map<String, List<String>> headers;
}

/// The server sets the session cookie on every successful auth route
/// (`server.ts:1319-1326`); `maxAgeSeconds: 0` is the logout clear (`server.ts:1339-1343`).
Reply withSessionCookie({
  int status = 200,
  required Object body,
  required String token,
  int maxAgeSeconds = 86400,
}) {
  return Reply(
    status: status,
    body: jsonEncode(body),
    headers: {
      'set-cookie': [
        'session_token=${Uri.encodeComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=$maxAgeSeconds',
      ],
    },
  );
}

Reply json({int status = 200, required Object body}) =>
    Reply(status: status, body: jsonEncode(body));

Reply empty({int status = 204}) => Reply(status: status, body: '');

Reply html({int status = 500, required String body}) =>
    Reply(status: status, body: body);

/// A token in the shape the server actually issues (`server/security.ts:16-30`): base64url
/// payload, a dot, then a hex signature the client cannot recompute.
String makeToken(String email, int expiresAtMs, {String signature = 'ab'}) {
  final payload = base64Url.encode(
    utf8.encode(jsonEncode({'email': email, 'expiresAt': expiresAtMs})),
  );
  return '${payload.replaceAll('=', '')}.$signature';
}
