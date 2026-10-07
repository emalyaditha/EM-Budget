import 'dart:convert';

/// The session token, exactly as the server issues it.
///
/// Format (`server/security.ts:16-30`): `base64url({"email":…,"expiresAt":…}) + '.' +
/// hex(HMAC-SHA256(SESSION_SECRET, payload))`. It is **not** a JWT and the phone cannot
/// verify the signature — `SESSION_SECRET` is server-only and must never be bundled.
/// The client reads the payload to know when to stop, and the server and the RLS
/// functions (`20260906000000_fix_verify_functions_vault_secret.sql:19-84`) are the
/// things that actually decide whether a request is authorised.
class SessionToken {
  const SessionToken({
    required this.email,
    required this.expiresAt,
    required this.raw,
  });

  final String email;

  /// UTC milliseconds, matching `expiresAt` in the payload.
  final int expiresAt;
  final String raw;

  static SessionToken? tryParse(String raw) {
    if (raw.isEmpty) return null;
    final dot = raw.lastIndexOf('.');
    if (dot <= 0 || dot == raw.length - 1) return null;
    final payload = raw.substring(0, dot);
    // The server emits base64url without padding; `base64Url.decode` requires it.
    final remainder = payload.length % 4;
    final padded = remainder == 0 ? payload : payload + '=' * (4 - remainder);
    final Object? decoded;
    try {
      decoded = jsonDecode(utf8.decode(base64Url.decode(padded)));
    } on FormatException {
      return null;
    }
    if (decoded is! Map<String, dynamic>) return null;
    final json = decoded;
    final email = json['email'];
    final expiresAt = json['expiresAt'];
    if (email is! String || expiresAt is! int) return null;
    return SessionToken(email: email, expiresAt: expiresAt, raw: raw);
  }

  bool isExpiredAt(int nowMs) => nowMs > expiresAt;

  /// `SESSION_TTL_SHORT` is 24h (`server.ts:231`); the server's own rotation rule
  /// (`server.ts:3175`) treats a token as long-lived only while more than 24h remain.
  bool isLongLivedAt(int nowMs) => expiresAt - nowMs > SessionToken.shortTtlMs;

  static const int shortTtlMs = 24 * 60 * 60 * 1000;
  static const int longTtlMs = 30 * 24 * 60 * 60 * 1000;
}
