import 'secure_key_value_store.dart';
import 'session_token.dart';

/// The signed-in credential set, and the only object on the phone that answers
/// "who is signed in".
///
/// This type is the resolution of landmine 9 (`INVENTORY.md` §5) and of bugs B-06/B-07:
/// the web has three — `src/services/authSession.ts` (memory, the real authority, used by
/// `supabase.ts` and `App.tsx`), `src/lib/authSession.ts` (memory, only `getSessionToken`
/// is reachable from `lib/appLock.ts:9`; the rest of the module is dead) and
/// `localStorage.auth_session_token` (`App.tsx:4201`, read by `ReceiptScanner.tsx:211`).
/// Ruling 3 collapses all three into this holder. Nothing else may persist an email or a
/// token, which is what `test/auth/identity_store_test.dart` asserts.
class Identity {
  const Identity({required this.email, required this.token, this.deviceToken});

  /// Stored exactly as the server returned it. The server is the normaliser —
  /// `server.ts:1917` `email.trim().toLowerCase()` on login and `verify-session` hands back
  /// that same value (`server.ts:3185`) — so re-lowercasing here would hide a server fault
  /// behind a client fix. `App.tsx:4198` stores the raw response for the same reason.
  final String email;
  final String token;

  /// Present only when the user logged in with remember-me. Not a server decision: every
  /// auth route returns a fresh `deviceToken` unconditionally
  /// (`server.ts:1967-1968`, `:1823-1824`, `:1888-1889`) and it is `App.tsx:4202-4204`
  /// that keeps it only `if (rememberMe && deviceToken)`. That asymmetry is ported, not
  /// tidied.
  final String? deviceToken;

  /// Parsed view of [token], for expiry only. The phone cannot verify the signature —
  /// see `session_token.dart`.
  SessionToken? get session => SessionToken.tryParse(token);
}

/// Stores [Identity] in a [SecureKeyValueStore] and keeps it in memory while running.
class IdentityStore {
  IdentityStore({required this.store});

  /// Key names copied from the web's localStorage keys (`App.tsx:4200-4203`) so each pair
  /// of readers can be matched line for line during review.
  static const String emailKey = 'auth_user_email';
  static const String tokenKey = 'auth_session_token';
  static const String deviceTokenKey = 'auth_device_token';

  final SecureKeyValueStore store;
  Identity? _current;

  Identity? get current => _current;

  /// Cold start. Returns null when there is no usable session, and **drops the persisted
  /// token when it cannot be parsed** — a half-written credential is worse than none,
  /// because every later call would send it and get a 401 the UI has no message for.
  Future<Identity?> restore() async {
    final token = await store.read(tokenKey);
    if (token == null || token.isEmpty) {
      _current = null;
      return null;
    }
    final email = await store.read(emailKey);
    if (email == null || email.isEmpty) {
      await clear();
      _current = null;
      return null;
    }
    if (SessionToken.tryParse(token) == null) {
      await clear();
      _current = null;
      return null;
    }
    final device = await store.read(deviceTokenKey);
    _current = Identity(email: email, token: token, deviceToken: device);
    return _current;
  }

  /// Writes through to secure storage before returning, so a crash immediately after login
  /// cannot leave memory holding a session the disk never learned about. `App.tsx:4198-4204`
  /// has the same ordering property by construction (synchronous localStorage, then state).
  Future<Identity> save({
    required String email,
    required String token,
    String? deviceToken,
    bool rememberMe = false,
  }) async {
    await store.write(emailKey, email);
    await store.write(tokenKey, token);
    // Mirrors `App.tsx:4202`: the device token is persisted for remember-me logins only.
    if (rememberMe && deviceToken != null && deviceToken.isNotEmpty) {
      await store.write(deviceTokenKey, deviceToken);
    } else {
      await store.remove(deviceTokenKey);
    }
    _current = Identity(
      email: email,
      token: token,
      deviceToken: rememberMe ? deviceToken : null,
    );
    return _current!;
  }

  /// Adopt the identity a `verify-session` answer handed back — the email and the token, and
  /// nothing else. This is `App.tsx:563-564`, which sets exactly `setToken(activeToken)` and
  /// `setEmail(email)` and leaves the device token alone: the route is the one place the
  /// server tells the client who it thinks the caller is (`server.ts:3181-3184`), so the
  /// answer replaces what was on disk, while a credential unrelated to the session check
  /// keeps its value.
  Future<void> adoptSession({
    required String email,
    required String token,
  }) async {
    await store.write(emailKey, email);
    await store.write(tokenKey, token);
    _current = Identity(
      email: email,
      token: token,
      deviceToken: _current?.deviceToken,
    );
  }

  /// Logout. Removes all three keys and the in-memory copy. There is no partial version of
  /// this on purpose: `performLogout` (`App.tsx:495-518`) removes three localStorage keys
  /// and calls `authSession.clear()`, and a port that forgot one would silently re-login
  /// the user on the next cold start — the exact failure the comment at `App.tsx:492-494`
  /// warns about.
  Future<void> clear() async {
    await store.remove(emailKey);
    await store.remove(tokenKey);
    await store.remove(deviceTokenKey);
    _current = null;
  }
}
