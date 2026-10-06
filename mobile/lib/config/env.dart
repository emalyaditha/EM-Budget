/// Compile-time configuration, the mobile twin of the web's `import.meta.env`.
///
/// Only four values exist here and all four are public by design: `INVENTORY.md` §8
/// established that no true secret ever reaches client code on the web, so the same
/// boundary holds on the phone. Nothing may add `SESSION_SECRET`,
/// `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` or `RESEND_API_KEY` to this file —
/// a `--dart-define` is embedded in the binary and is readable by anyone who has it.
///
/// Web equivalent: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`,
/// `VITE_GOOGLE_CLIENT_ID`.
class Env {
  const Env._();

  static String get supabaseUrl => const String.fromEnvironment('SUPABASE_URL');
  static String get supabaseAnonKey =>
      const String.fromEnvironment('SUPABASE_ANON_KEY');
  static String get apiUrl => const String.fromEnvironment('API_URL');
  static String get googleClientId =>
      const String.fromEnvironment('GOOGLE_CLIENT_ID');

  /// Same guard as `src/supabase.ts:160` — a non-https origin is refused rather than
  /// silently downgraded.
  static bool get hasSupabase =>
      supabaseUrl.startsWith('https://') && supabaseAnonKey.isNotEmpty;

  static bool get hasApi =>
      apiUrl.startsWith('https://') || apiUrl.startsWith('http://localhost');
}
