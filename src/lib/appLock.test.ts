import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../supabase', () => ({
  getSupabaseConfig: vi.fn().mockReturnValue({
    url: 'https://test.supabase.co',
    key: 'test-key',
    autoSync: true,
  }),
}));

vi.mock('../lib/api', () => ({
  apiUrl: vi.fn((path: string) => path),
  safeJson: vi.fn(async (res: Response) => {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }),
  fetchWithTimeout: vi.fn(),
}));

// ─── Imports after mocks ─────────────────────────────────────────────────────
import { verifyPin, setPin, disablePin, getAppLockStatus } from './appLock';
import { fetchWithTimeout } from './api';

const mockFetchWithTimeout = fetchWithTimeout as ReturnType<typeof vi.fn>;

function makeResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('appLock.ts — verifyPin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Core verifyPin logic: ok: resp.ok && (!!data.ok || !!data.success) ──

  it('returns ok:true when resp.ok and data.success is true', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ success: true }));

    const result = await verifyPin('user@test.com', '1234');

    expect(result.ok).toBe(true);
  });

  it('returns ok:true when resp.ok and data.ok is true (legacy field)', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ ok: true }));

    const result = await verifyPin('user@test.com', '1234');

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when resp.ok but data.success is false', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ success: false }));

    const result = await verifyPin('user@test.com', '1234');

    expect(result.ok).toBe(false);
  });

  it('returns ok:false when resp.ok but data has no ok/success field', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ error: 'Invalid PIN' }));

    const result = await verifyPin('user@test.com', 'wrong');

    expect(result.ok).toBe(false);
  });

  it('returns ok:false when resp is not ok (HTTP error)', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ success: true }, 500));

    const result = await verifyPin('user@test.com', '1234');

    expect(result.ok).toBe(false);
  });

  it('returns error details from server response', async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse({ success: false, error: 'Too many attempts', retryAfter: 30 }),
    );

    const result = await verifyPin('user@test.com', 'wrong');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Too many attempts');
    expect(result.retryAfter).toBe(30);
  });

  it('returns ok:false and error when fetch throws', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

    const result = await verifyPin('user@test.com', '1234');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('handles non-Error thrown values gracefully', async () => {
    mockFetchWithTimeout.mockRejectedValue('string error');

    const result = await verifyPin('user@test.com', '1234');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Could not verify PIN.');
  });

  it('passes attemptsRemaining from server', async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse({ success: false, error: 'Wrong PIN', attemptsRemaining: 2 }),
    );

    const result = await verifyPin('user@test.com', 'wrong');

    expect(result.attemptsRemaining).toBe(2);
  });

  it('passes code from server response', async () => {
    mockFetchWithTimeout.mockResolvedValue(
      makeResponse({ success: false, code: 'LOCKED_OUT', error: 'Account locked' }),
    );

    const result = await verifyPin('user@test.com', '1234');

    expect(result.code).toBe('LOCKED_OUT');
  });

  it('returns ok:true when both ok and success are present', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ ok: true, success: true }));

    const result = await verifyPin('user@test.com', '1234');

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when both ok and success are false', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ ok: false, success: false }));

    const result = await verifyPin('user@test.com', '1234');

    expect(result.ok).toBe(false);
  });
});

// ─── Related appLock functions ───────────────────────────────────────────────
describe('appLock.ts — setPin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok:true on successful set', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ success: true }));
    const result = await setPin('user@test.com', '1234');
    expect(result.ok).toBe(true);
  });

  it('returns ok:false on failure', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ success: false, error: 'Weak PIN' }));
    const result = await setPin('user@test.com', '12');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Weak PIN');
  });

  it('returns ok:false on network error', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('timeout'));
    const result = await setPin('user@test.com', '1234');
    expect(result.ok).toBe(false);
  });
});

describe('appLock.ts — disablePin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ok:true on success', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ success: true }));
    const result = await disablePin('user@test.com');
    expect(result.ok).toBe(true);
  });

  it('returns ok:false on failure', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ success: false }));
    const result = await disablePin('user@test.com');
    expect(result.ok).toBe(false);
  });
});

describe('appLock.ts — getAppLockStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns status data on success', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({
      success: true,
      appLockEnabled: true,
      pinEnabled: true,
      hasPin: true,
      biometricCount: 1,
      failedAttempts: 0,
      lockedUntil: null,
      lockOnOpen: false,
      lockIdleMinutes: null,
    }));

    const result = await getAppLockStatus('user@test.com');
    expect(result).not.toBeNull();
    expect(result!.appLockEnabled).toBe(true);
    expect(result!.pinEnabled).toBe(true);
  });

  it('returns null on 401', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ error: 'Unauthorized' }, 401));
    const result = await getAppLockStatus('user@test.com');
    expect(result).toBeNull();
  });

  it('returns null on failure', async () => {
    mockFetchWithTimeout.mockResolvedValue(makeResponse({ success: false }));
    const result = await getAppLockStatus('user@test.com');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('offline'));
    const result = await getAppLockStatus('user@test.com');
    expect(result).toBeNull();
  });
});
