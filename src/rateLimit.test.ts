import { describe, expect, it } from 'vitest';
import { applyInMemoryRateLimit, FAIL_OPEN_EXPLICIT, type RateLimitRecord } from '../api-src/rate-limit';

const WINDOW_MS = 60_000;

describe('FAIL_OPEN_EXPLICIT documented decision (A4)', () => {
  it('keeps fail-open enabled: DB failures must never brick all auth', () => {
    expect(FAIL_OPEN_EXPLICIT).toBe(true);
  });
});

describe('applyInMemoryRateLimit', () => {
  it('allows the first request for a new key and records a count of 1', () => {
    const store: RateLimitRecord[] = [];
    const now = 1_700_000_000_000;
    const result = applyInMemoryRateLimit(store, 'auth:user@example.com', 5, WINDOW_MS, now);
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(store).toHaveLength(1);
    expect(store[0]).toEqual({
      key: 'auth:user@example.com',
      count: 1,
      reset_time: new Date(now + WINDOW_MS).toISOString(),
    });
  });

  it('increments the count up to the limit', () => {
    const store: RateLimitRecord[] = [];
    const now = 1_700_000_000_000;
    for (let i = 0; i < 4; i++) {
      const result = applyInMemoryRateLimit(store, 'auth:flood', 5, WINDOW_MS, now);
      expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    }
    expect(store.find((r) => r.key === 'auth:flood')?.count).toBe(4);
  });

  it('blocks once the limit is reached and reports retryAfterSeconds', () => {
    const store: RateLimitRecord[] = [];
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      applyInMemoryRateLimit(store, 'auth:flood', 5, WINDOW_MS, now);
    }
    const blocked = applyInMemoryRateLimit(store, 'auth:flood', 5, WINDOW_MS, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(WINDOW_MS / 1000);
  });

  it('resets the window after expiration so legitimate users are not locked out forever', () => {
    const store: RateLimitRecord[] = [];
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      applyInMemoryRateLimit(store, 'auth:stale-flood', 5, WINDOW_MS, now);
    }
    expect(applyInMemoryRateLimit(store, 'auth:stale-flood', 5, WINDOW_MS, now).allowed).toBe(false);
    const afterWindow = now + WINDOW_MS + 1;
    expect(applyInMemoryRateLimit(store, 'auth:stale-flood', 5, WINDOW_MS, afterWindow).allowed).toBe(true);
  });

  it('purges expired entries so the fallback table cannot grow unbounded', () => {
    const now = 1_700_000_000_000;
    const store: RateLimitRecord[] = [
      { key: 'stale', count: 9, reset_time: new Date(now - 1).toISOString() },
    ];
    applyInMemoryRateLimit(store, 'fresh', 5, WINDOW_MS, now);
    expect(store.find((r) => r.key === 'stale')).toBeUndefined();
  });

  it('isolates the fail-open fallback key namespace from the primary quota', () => {
    const store: RateLimitRecord[] = [];
    const now = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      applyInMemoryRateLimit(store, 'auth:hot', 5, WINDOW_MS, now);
    }
    expect(applyInMemoryRateLimit(store, 'auth:hot', 5, WINDOW_MS, now).allowed).toBe(false);
    const fallbackResult = applyInMemoryRateLimit(store, 'fallback:auth:hot', 5, WINDOW_MS, now);
    expect(fallbackResult).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(store.filter((r) => r.key.startsWith('fallback:')).length).toBe(1);
  });
});