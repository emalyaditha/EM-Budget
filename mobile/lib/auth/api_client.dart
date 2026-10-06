import 'dart:convert';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

import '../config/env.dart';
import 'identity_store.dart';

/// The JSON body of a response, the twin of `safeJson` (`src/lib/api.ts:5-13`).
///
/// `safeJson` reads the body as text and returns `null` for an empty body **and for
/// malformed JSON** — it never throws. That is load-bearing: several callsites do
/// `data?.error || 'fallback'`, so a 500 whose body is an HTML error page has to arrive as
/// `null`, not as an exception, or the UI shows a stack instead of the fallback string.
Map<String, dynamic>? safeJson(Object? body) {
  if (body == null) return null;
  if (body is Map<String, dynamic>) return body;
  if (body is String) {
    if (body.isEmpty) return null;
    try {
      final decoded = jsonDecode(body);
      return decoded is Map<String, dynamic> ? decoded : null;
    } on FormatException {
      return null;
    }
  }
  return null;
}

/// Outcome of one `/api` call.
class ApiResponse {
  ApiResponse({required this.status, required this.json, this.transportError});

  /// HTTP status, or null when the request never completed (timeout, DNS, offline).
  final int? status;

  /// Parsed object body, or null — matching `safeJson`.
  final Map<String, dynamic>? json;

  /// The transport failure message, for the callsites that surface `errorMessage(err, …)`.
  final String? transportError;

  bool get hasResponse => status != null;

  /// `response.ok` (`ReceiptScanner.tsx:224`, `appLock.ts:66`).
  bool get ok => status != null && status! >= 200 && status! < 300;

  bool get isUnauthorized => status == 401;

  /// `res.json().error`, with no opinion about whether it is a string.
  String? get serverError {
    final value = json?['error'];
    return value is String ? value : null;
  }
}

/// HTTP client for the unchanged `server.ts`.
///
/// Three properties have to be exactly right here, and each is a deliberate non-choice
/// rather than an oversight:
///
/// 1. **No `Origin` header.** The `/api` guard admits requests with no `Origin` precisely
///    so that native clients work (`server.ts:1384-1405`, proven by spike assertion A3).
///    Dart's HTTP stack does not add one; a test pins that, because a future interceptor
///    that set it would turn every call into a 403 with no obvious cause.
/// 2. **`Authorization: Bearer` when a session exists, cookie always.** That is the web's
///    own split (`App.tsx:503`, `SettingsModal.tsx:241`, `ReceiptScanner.tsx:213`) and the
///    server prefers Bearer over the cookie (`getTokenFromRequest`, `server.ts:1342-1348`).
///    [AuthRepository.verifySession] is the one call that opts out — see there.
/// 3. **No retries.** `retryWithBackoff` exists in this codebase but only wraps the Supabase
///    sync round-trips (`supabase.ts:788`, `:845`), never an auth call. Retrying a login
///    would re-drive the account lockout counter (`server.ts:1946-1960`), so this client
///    does not, and the sync layer gets its own twin in the repository step of this phase.
class ApiClient {
  ApiClient({
    required this.identity,
    required PersistCookieJar cookieJar,
    String? baseUrl,
    HttpClientAdapter? adapter,
  }) : _dio = _build(
         baseUrl: baseUrl ?? Env.apiUrl,
         cookieJar: cookieJar,
         adapter: adapter,
       );

  static const Duration defaultTimeout = Duration(seconds: 10);
  static const Duration verifySessionTimeout = Duration(seconds: 6);

  final Dio _dio;
  final IdentityStore identity;

  static Dio _build({
    required String baseUrl,
    required PersistCookieJar cookieJar,
    HttpClientAdapter? adapter,
  }) {
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        // `fetch` with `Content-Type: application/json` sends exactly this; dio would
        // otherwise append `; charset=utf-8`.
        contentType: Headers.jsonContentType,
        connectTimeout: defaultTimeout,
        receiveTimeout: defaultTimeout,
        sendTimeout: defaultTimeout,
        // The web reads 4xx/5xx bodies and branches on `resp.status`; dio must not
        // swallow them as exceptions before we get to decide.
        validateStatus: (_) => true,
      ),
    )..interceptors.add(CookieManager(cookieJar));
    // The seam the tests use. Injecting a whole Dio would have meant re-wiring this
    // interceptor by hand in every test, which is exactly the wiring a test should not own.
    if (adapter != null) dio.httpClientAdapter = adapter;
    return dio;
  }

  Future<ApiResponse> post(
    String path,
    Map<String, Object?> body, {
    Duration? timeout,
    bool sendBearer = true,
  }) async {
    return _send(
      (options) => _dio.post<Object?>(path, data: body, options: options),
      timeout: timeout,
      sendBearer: sendBearer,
    );
  }

  Future<ApiResponse> get(
    String path, {
    Duration? timeout,
    bool sendBearer = true,
  }) {
    return _send(
      (options) => _dio.get<Object?>(path, options: options),
      timeout: timeout,
      sendBearer: sendBearer,
    );
  }

  Future<ApiResponse> _send(
    Future<Response<Object?>> Function(Options options) send, {
    Duration? timeout,
    bool sendBearer = true,
  }) async {
    final headers = <String, Object?>{};
    final token = sendBearer ? identity.current?.token : null;
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    final ms = timeout ?? defaultTimeout;
    final options = Options(
      contentType: Headers.jsonContentType,
      connectTimeout: ms,
      receiveTimeout: ms,
      sendTimeout: ms,
      validateStatus: (_) => true,
      headers: headers,
    );
    try {
      final response = await send(options);
      return ApiResponse(
        status: response.statusCode,
        json: safeJson(response.data),
      );
    } on DioException catch (err) {
      // A response did arrive but `validateStatus` rejected it — impossible here, since
      // every status is accepted above; kept because dio can still throw on redirect
      // loops and on a body it cannot decode.
      final status = err.response?.statusCode;
      if (status != null) {
        return ApiResponse(status: status, json: safeJson(err.response?.data));
      }
      return ApiResponse(status: null, json: null, transportError: err.message);
    }
  }
}
