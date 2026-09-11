// -------------------------------------------------------------
// DatabaseUnavailableError — prod fail-CLOSED guard for auth helpers (A3)
// -------------------------------------------------------------
// The app-lock / login-lockout / WebAuthn / trusted-device DB helpers in
// server.ts intentionally fall back to the in-memory mock on Supabase
// errors so local DEV works without a database. In PRODUCTION that fallback
// is a security hazard: an empty mock read returns `null` / `[]`, which the
// callers interpret as "no app lock", "no login lockout", or "no
// credentials" — silently disabling the security layer instead of failing.
//
//   * failClosedOnDbError(isProduction, err) THROWS DatabaseUnavailableError
//     when running in production, so the calling route maps it to HTTP 503
//     (service unavailable). Callers must NOT swallow this error.
//   * When not in production the guard is a no-op and the caller continues
//     to its mock fallback, preserving current DEV behavior.
//   * The production flag is INJECTED (rather than read from process.env
//     here) so the behavior is unit-testable without mutating NODE_ENV —
//     see src/dbUnavailable.test.ts.
export class DatabaseUnavailableError extends Error {
  constructor(message?: string) {
    super(message || 'Database service is temporarily unavailable. Please try again shortly.');
    this.name = 'DatabaseUnavailableError';
  }
}

/**
 * Fail-closed guard for database-backed security helpers.
 *
 * Pass the injected `IS_PRODUCTION` value from server.ts (derived from
 * NODE_ENV at createApp() time). Throws when production; silent no-op
 * otherwise so the caller can keep its DEV-only mock fallback.
 */
export function failClosedOnDbError(isProduction: boolean, err?: unknown): void {
  if (!isProduction) return;
  const detail = err instanceof Error ? err.message : err != null ? String(err) : undefined;
  throw new DatabaseUnavailableError(detail);
}