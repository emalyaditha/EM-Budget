// -------------------------------------------------------------
// FAIL_OPEN_EXPLICIT — config decision for auth/ledger rate limiting (A4)
// -------------------------------------------------------------
// When the rate-limit database round-trip fails (network, RLS rule, schema
// drift), the system deliberately fails OPEN to a per-instance in-memory
// fallback instead of hard-blocking all authentication.
//
//   * Availability > hardening for auth lockout: a transient Supabase/Postgres
//     error must never brick login for every user of the app.
//   * The in-memory fallback STILL ENFORCES the same limit semantics, but only
//     per Cloud Run instance (no cross-instance sharing) until the window
//     expires.
//   * Fail-open requests fall under the isolated `fallback:` key namespace so
//     they can never collide with, or consume, the primary DB-backed quotas.
//
// Setting this constant to `false` flips the behavior to fail-CLOSED: the
// original error is rethrown and the request is rejected (503) — safer but
// with worse availability. The tests in src/rateLimit.test.ts assert the
// documented fail-open contract.
export const FAIL_OPEN_EXPLICIT = true;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimitRecord {
  key: string;
  count: number;
  reset_time: string;
}

/**
 * Pure in-memory rate-limit decision, shared by the mock-only path and the
 * fail-open fallback in server.ts checkRateLimitInDb().
 *
 * Mutates `store` in place (purge of expired entries, count increments) so
 * callers keep a stable array identity — matching the previous
 * `mockDb.rateLimits` reassignment semantics.
 */
export function applyInMemoryRateLimit(
  store: RateLimitRecord[],
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const resetTimeStr = new Date(now + windowMs).toISOString();

  // Purge expired rate limits periodically.
  for (let i = store.length - 1; i >= 0; i--) {
    if (new Date(store[i].reset_time).getTime() <= now) {
      store.splice(i, 1);
    }
  }

  const foundIndex = store.findIndex((item) => item.key === key);
  if (foundIndex === -1) {
    store.push({ key, count: 1, reset_time: resetTimeStr });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const recordResetTime = new Date(store[foundIndex].reset_time).getTime();
  if (now > recordResetTime) {
    store[foundIndex] = { key, count: 1, reset_time: resetTimeStr };
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (store[foundIndex].count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((recordResetTime - now) / 1000) };
  }

  store[foundIndex].count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}