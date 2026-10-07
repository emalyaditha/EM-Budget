import 'package:cookie_jar/cookie_jar.dart';

import 'api_client.dart';
import 'identity_store.dart';

/// One server answer that carries a session.
class AuthSessionResult {
  const AuthSessionResult({
    required this.status,
    required this.success,
    this.token = '',
    this.deviceToken,
    this.json,
    this.transportError,
  });

  final int? status;
  final bool success;

  /// `data.token || ''` (`EmailLogin.tsx:345`). The web tolerates a missing token by
  /// handing over the empty string rather than failing the login, and that is ported —
  /// see B-18 in `parity/BUGS_FOUND.md`.
  final String token;
  final String? deviceToken;
  final Map<String, dynamic>? json;
  final String? transportError;

  /// The four fields the login UI needs to build its exact messages: it branches on
  /// `resp.status === 429 && data?.retryAfter`, and on a bad credential it shows
  /// `data.error` with `data.attemptsRemaining` / `data.retryAfter` alongside
  /// (`server.ts:1954-1960`). Those strings are Phase 5's job; the facts are taken
  /// faithfully here.
  int? get retryAfter {
    final value = json?['retryAfter'];
    return value is num ? value.toInt() : null;
  }

  int? get attemptsRemaining {
    final value = json?['attemptsRemaining'];
    return value is num ? value.toInt() : null;
  }

  String? get code {
    final value = json?['code'];
    return value is String ? value : null;
  }

  String? get error =>
      json?['error'] is String ? json!['error'] as String : null;
}

/// The `verify-session` answer, which is unlike every other auth answer.
class VerifySessionResult {
  const VerifySessionResult({
    required this.status,
    required this.success,
    this.email,
    this.token,
    this.error,
    this.transportError,
  });

  final int? status;
  final bool success;
  final String? email;
  final String? token;
  final String? error;
  final String? transportError;

  /// True when the server rotated a long-lived session forward
  /// (`server.ts:3176-3180`): the response carries a *new* token and a new cookie.
  bool get wasRotated => success && token != null && token!.isNotEmpty;
}

/// `send-otp`, including the developer bypass the server only answers with when
/// `DEV_OTP_RESPONSE=true` outside production (`server.ts:1752-1759`).
class OtpResult {
  const OtpResult({
    required this.status,
    required this.success,
    this.emailSent = false,
    this.devOtp,
    this.info,
    this.retryAfter,
    this.error,
    this.transportError,
  });

  final int? status;
  final bool success;
  final bool emailSent;
  final String? devOtp;
  final String? info;
  final int? retryAfter;
  final String? error;
  final String? transportError;
}

/// The `/api/auth` contract, ported from `src/components/EmailLogin.tsx` and
/// `src/App.tsx` against an unchanged server. Spike A proved every one of these calls works
/// from a native client (`parity/INVENTORY.md` §13f), so no route needed editing.
///
/// Deliberately **not** reproduced from the web: the `x-supabase-url` / `x-supabase-key`
/// headers that `EmailLogin.tsx:167-174` and `appLock.ts:19-20` attach to these requests.
/// `server.ts` never reads either — `getSupabase(_req)` discards its argument
/// (`server.ts:433`) and takes the URL and the service-role key from the environment — so
/// the headers are dead weight that would put a public anon key in yet one more place.
/// Recorded as B-17 in `parity/BUGS_FOUND.md`.
class AuthRepository {
  AuthRepository({
    required this.identity,
    required this.api,
    required this.cookieJar,
  });

  final IdentityStore identity;
  final ApiClient api;
  final PersistCookieJar cookieJar;

  static const String checkEmailPath = '/api/auth/check-email';
  static const String sendOtpPath = '/api/auth/send-otp';
  static const String verifyOtpPath = '/api/auth/verify-otp';
  static const String registerPath = '/api/auth/register';
  static const String loginPasswordPath = '/api/auth/login-password';
  static const String resetPasswordPath = '/api/auth/reset-password';
  static const String googlePath = '/api/auth/google';
  static const String verifySessionPath = '/api/auth/verify-session';
  static const String logoutPath = '/api/auth/logout';

  /// `EmailLogin.tsx:204-206`. The server answers `{ success: true, exists }` after a
  /// 60–200 ms jitter on **every** branch, including the error ones (`server.ts:1668-1670`),
  /// because a fast "no such account" would be an account-enumeration oracle. Nothing here
  /// may cache the answer or race it.
  Future<({bool responseReceived, bool exists, ApiResponse response})>
  checkEmail(String email) async {
    final response = await api.post(checkEmailPath, {'email': email.trim()});
    return (
      responseReceived: response.json != null,
      exists: response.json?['exists'] == true,
      response: response,
    );
  }

  Future<OtpResult> sendOtp(String email) async {
    final response = await api.post(sendOtpPath, {'email': email.trim()});
    final json = response.json;
    return OtpResult(
      status: response.status,
      success: response.ok && json?['success'] == true,
      emailSent: json?['emailSent'] == true,
      devOtp: json?['devOtp'] is String ? json!['devOtp'] as String : null,
      info: json?['info'] is String ? json!['info'] as String : null,
      retryAfter: json?['retryAfter'] is num
          ? (json!['retryAfter'] as num).toInt()
          : null,
      error: response.serverError,
      transportError: response.transportError,
    );
  }

  /// `EmailLogin.tsx:286-296`. Note `forRegistrationOrReset: true` — the login screen always
  /// sends it, and the route mints a 24 h session regardless of remember-me
  /// (`server.ts:1823-1824`): remember-me only reaches the TTL on login, register and
  /// reset, never on the OTP path. Ported as-is.
  Future<AuthSessionResult> verifyOtp({
    required String email,
    required String otp,
  }) async {
    final response = await api.post(verifyOtpPath, {
      'email': email.trim(),
      'otp': otp.trim(),
      'forRegistrationOrReset': true,
    });
    return _sessionResult(response);
  }

  /// `EmailLogin.tsx:367-379`. The body carries `otp`, because the route re-checks the OTP
  /// rather than trusting that `verify-otp` already ran (`server.ts:1853-1858`).
  Future<AuthSessionResult> register({
    required String email,
    required String password,
    required String otp,
    bool rememberMe = false,
  }) async {
    final response = await api.post(registerPath, {
      'email': email.trim(),
      'password': password,
      'otp': otp.trim(),
      'rememberMe': rememberMe,
    });
    return _persist(
      _sessionResult(response),
      email: email,
      rememberMe: rememberMe,
    );
  }

  /// `EmailLogin.tsx:326-330`. `email.trim()` on the wire, `email.trim().toLowerCase()` for
  /// the local identity (`:345`) — the server normalises independently (`server.ts:1917`).
  Future<AuthSessionResult> loginPassword({
    required String email,
    required String password,
    bool rememberMe = false,
  }) async {
    final response = await api.post(loginPasswordPath, {
      'email': email.trim(),
      'password': password,
      'rememberMe': rememberMe,
    });
    return _persist(
      _sessionResult(response),
      email: email,
      rememberMe: rememberMe,
    );
  }

  Future<AuthSessionResult> resetPassword({
    required String email,
    required String password,
    required String otp,
    bool rememberMe = false,
  }) async {
    final response = await api.post(resetPasswordPath, {
      'email': email.trim(),
      'password': password,
      'otp': otp.trim(),
      'rememberMe': rememberMe,
    });
    return _persist(
      _sessionResult(response),
      email: email,
      rememberMe: rememberMe,
    );
  }

  /// `server.ts:2000-2062`. The phone gets `credential` from a native Google ID token in
  /// Phase 5/7 (audience match is an open question there); the wire shape is already proven
  /// by this contract and needs no server change.
  Future<AuthSessionResult> signInWithGoogle({
    required String credential,
    required String email,
    bool rememberMe = false,
  }) async {
    final response = await api.post(googlePath, {
      'credential': credential,
      'rememberMe': rememberMe,
    });
    return _persist(
      _sessionResult(response),
      email: email,
      rememberMe: rememberMe,
    );
  }

  /// Cold-start session check. Two things here look wrong and are not.
  ///
  /// * **`sendBearer: false`.** `App.tsx:540-550` posts `{}` with no `Authorization` and
  ///   lets the httpOnly cookie speak. That matters whenever the persisted token is older
  ///   than the cookie: `getTokenFromRequest` (`server.ts:1342-1348`) prefers Bearer, so
  ///   sending a stale token would 401 a session the cookie could still have refreshed.
  ///   Sending no Bearer keeps the phone on exactly the web's recovery path.
  /// * **A `200` can mean failure.** Every rejection branch on this route is
  ///   `res.json({ success: false, … })` with no status code (`server.ts:3149-3168`), so
  ///   `resp.ok` is true for an expired session. `App.tsx:554-559` therefore tests
  ///   `data.success`, and so does this.
  /// * **No answer at all is not a failure of the session.** The web separates the two:
  ///   the `else` at `App.tsx:640-647` clears the session, while the `catch` at
  ///   `:649-652` only drops the spinner and leaves the credential on disk. A phone that
  ///   cold-started in a tunnel would otherwise lose its own session.
  ///
  /// On success the returned token replaces the held one (`server.ts:3181-3184` always
  /// hands a token back, rotated or not, because the web keeps the session in memory only).
  Future<VerifySessionResult> verifySession() async {
    final response = await api.post(
      verifySessionPath,
      const <String, Object?>{},
      timeout: ApiClient.verifySessionTimeout,
      sendBearer: false,
    );
    if (!response.hasResponse) {
      return VerifySessionResult(
        status: null,
        success: false,
        error: response.serverError,
        transportError: response.transportError,
      );
    }
    final json = response.json;
    final serverReportedSuccess = response.ok && json?['success'] == true;
    final token = json?['token'] is String ? json!['token'] as String : null;
    final email = json?['email'] is String ? json!['email'] as String : null;
    // `App.tsx:554-559` admits the session only when both strings are present, so a
    // `success: true` that carries no token is not a session the phone can hold and takes
    // the same branch as an outright rejection.
    final success =
        serverReportedSuccess &&
        token != null &&
        token.isNotEmpty &&
        email != null &&
        email.isNotEmpty;
    if (success) {
      // The email is the server's normalised one; it replaces whatever was on disk, so a
      // rename or a case fix on the server side cannot leave the phone holding a stale id.
      await identity.adoptSession(email: email, token: token);
    } else {
      // `App.tsx:641-647`: an invalid session clears the in-memory session and drops to the
      // login screen. The persisted copy goes too, because on the phone it is the memory.
      await identity.clear();
    }
    return VerifySessionResult(
      status: response.status,
      success: success,
      email: email,
      token: success ? token : null,
      error: response.serverError,
      transportError: response.transportError,
    );
  }

  /// Logout. The local wipe happens whatever the server says — `App.tsx:496-518` fires the
  /// POST with `.catch(() => {})` and then clears, so an offline "Sign out" still signs you
  /// out. The server side of it is not optional either: only that route expires the
  /// `session_token` and `app_lock_trust` cookies and revokes trusted devices
  /// (`server.ts:3192-3212`), which is why the comment at `App.tsx:492-494` calls
  /// localStorage-clearing alone insufficient. On the phone the same is true of the secure
  /// store, hence the explicit jar wipe after the request, so a dead server cannot leave a
  /// cookie that would silently re-login on next launch.
  Future<void> logout() async {
    try {
      await api.post(logoutPath, const <String, Object?>{});
    } finally {
      await identity.clear();
      await cookieJar.deleteAll();
    }
  }

  AuthSessionResult _sessionResult(ApiResponse response) {
    final json = response.json;
    return AuthSessionResult(
      status: response.status,
      success: response.ok && json?['success'] == true,
      token: json?['token'] is String ? json!['token'] as String : '',
      deviceToken: json?['deviceToken'] is String
          ? json!['deviceToken'] as String
          : null,
      json: json,
      transportError: response.transportError,
    );
  }

  Future<AuthSessionResult> _persist(
    AuthSessionResult result, {
    required String email,
    required bool rememberMe,
  }) async {
    if (!result.success) return result;
    // `App.tsx:4198-4204` stores the email the client typed (lower-cased), not the one the
    // server returned, because these routes return only a token and a device token.
    await identity.save(
      email: email.trim().toLowerCase(),
      token: result.token,
      deviceToken: result.deviceToken,
      rememberMe: rememberMe,
    );
    return result;
  }
}
