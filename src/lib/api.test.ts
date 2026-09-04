import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff, apiUrl, safeJson, fetchWithTimeout, withTimeout } from './api';

// ─── apiUrl ──────────────────────────────────────────────────────────────────
describe('apiUrl', () => {
  it('returns just the path when no base URL is set', () => {
    expect(apiUrl('/api/data')).toBe('/api/data');
  });
});

// ─── safeJson ────────────────────────────────────────────────────────────────
describe('safeJson', () => {
  it('parses valid JSON', async () => {
    const res = new Response(JSON.stringify({ ok: true }));
    const data = await safeJson(res);
    expect(data).toEqual({ ok: true });
  });

  it('returns null for empty body', async () => {
    const res = new Response('');
    const data = await safeJson(res);
    expect(data).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    const res = new Response('not json');
    const data = await safeJson(res);
    expect(data).toBeNull();
  });
});

// ─── withTimeout ─────────────────────────────────────────────────────────────
describe('withTimeout', () => {
  it('resolves if promise completes before timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('rejects if promise times out', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 2000));
    await expect(withTimeout(slow, 50, 'SlowOp')).rejects.toThrow('SlowOp timed out after 50ms');
  });

  it('rejects with original error if promise rejects before timeout', async () => {
    const failing = Promise.reject(new Error('boom'));
    await expect(withTimeout(failing, 1000)).rejects.toThrow('boom');
  });
});

// ─── fetchWithTimeout ────────────────────────────────────────────────────────
describe('fetchWithTimeout', () => {
  it('returns fetch result on success', async () => {
    const mockRes = new Response('ok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes);

    const res = await fetchWithTimeout('/api/test');
    expect(res).toBe(mockRes);

    vi.restoreAllMocks();
  });

  it('calls fetch with abort signal', async () => {
    const mockRes = new Response('ok');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockRes);

    await fetchWithTimeout('/api/test', { method: 'GET' }, 5000);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    vi.restoreAllMocks();
  });

  it('propagates fetch errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network fail'));

    await expect(fetchWithTimeout('/api/test')).rejects.toThrow('network fail');

    vi.restoreAllMocks();
  });
});

// ─── retryWithBackoff ────────────────────────────────────────────────────────
describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first attempt (no retry needed)', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const promise = retryWithBackoff(fn);
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns result after transient failures', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, { baseDelayMs: 100, maxRetries: 3 });
    // Advance through the delays
    await vi.advanceTimersByTimeAsync(100); // attempt 1 retry delay
    await vi.advanceTimersByTimeAsync(200); // attempt 2 retry delay
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'));

    try {
      const promise = retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 10 });
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(20);
      await promise;
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.message).toBe('permanent');
    }
    // attempt 0 (initial) + attempt 1 + attempt 2 = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff delays', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockResolvedValue('done');

    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      baseDelayMs: 100,
      maxRetries: 3,
      onRetry,
    });

    // First retry: delay = min(100 * 2^0, 10000) = 100ms
    expect(onRetry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    // Second retry: delay = min(100 * 2^1, 10000) = 200ms
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('clamps delay to maxDelayMs', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, {
      baseDelayMs: 50000, // would be 50000 * 2^0 = 50000
      maxDelayMs: 5000,
      maxRetries: 1,
    });

    // Delay should be clamped to 5000, not 50000
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result).toBe('ok');
  });

  it('calls onRetry with attempt number and error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValue('recovered');

    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      baseDelayMs: 10,
      maxRetries: 2,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;

    expect(result).toBe('recovered');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.objectContaining({ message: 'first fail' }));
  });

  it('calls onRetry for each failed attempt before success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockRejectedValueOnce(new Error('e3'))
      .mockResolvedValue('finally');

    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      baseDelayMs: 10,
      maxRetries: 5,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(40);
    const result = await promise;

    expect(result).toBe('finally');
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls.map(c => c[0])).toEqual([1, 2, 3]);
  });

  it('wraps non-Error thrown values into Error', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    try {
      await retryWithBackoff(fn, { maxRetries: 0 });
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.message).toBe('string error');
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('does not retry after the last attempt fails', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    try {
      await retryWithBackoff(fn, { maxRetries: 0, baseDelayMs: 10 });
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.message).toBe('fail');
    }
    // Only initial attempt, no retries
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
