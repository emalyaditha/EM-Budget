import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('useOnlineStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default navigator.onLine = true
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns initial online status from navigator.onLine', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current.isOnline).toBe(true);
    expect(typeof result.current.checkSupabase).toBe('function');
  });

  it('returns offline when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current.isOnline).toBe(false);
  });

  it('updates isOnline when window "online" event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('updates isOnline when window "offline" event fires', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('checkSupabase returns false when no supabaseUrl is provided', async () => {
    const { result } = renderHook(() => useOnlineStatus(undefined));

    const reachable = await act(async () => {
      return result.current.checkSupabase();
    });

    expect(reachable).toBe(false);
    expect(result.current.isSupabaseReachable).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('checkSupabase returns true when Supabase responds with 200', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const { result } = renderHook(() => useOnlineStatus('https://xyz.supabase.co'));

    let reachable: boolean;
    await act(async () => {
      reachable = await result.current.checkSupabase();
    });

    expect(reachable!).toBe(true);
    expect(result.current.isSupabaseReachable).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://xyz.supabase.co/rest/v1/',
      expect.objectContaining({ method: 'HEAD' }),
    );
  });

  it('checkSupabase returns true for 401 (auth required but reachable)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    const { result } = renderHook(() => useOnlineStatus('https://xyz.supabase.co'));

    let reachable: boolean;
    await act(async () => {
      reachable = await result.current.checkSupabase();
    });

    expect(reachable!).toBe(true);
  });

  it('checkSupabase returns true for 403 (forbidden but reachable)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });

    const { result } = renderHook(() => useOnlineStatus('https://xyz.supabase.co'));

    let reachable: boolean;
    await act(async () => {
      reachable = await result.current.checkSupabase();
    });

    expect(reachable!).toBe(true);
  });

  it('checkSupabase returns false when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useOnlineStatus('https://xyz.supabase.co'));

    let reachable: boolean;
    await act(async () => {
      reachable = await result.current.checkSupabase();
    });

    expect(reachable!).toBe(false);
    expect(result.current.isSupabaseReachable).toBe(false);
  });

  it('sets isSupabaseReachable to false when going offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus('https://xyz.supabase.co'));

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isSupabaseReachable).toBe(false);
  });

  it('updates lastChecked on checkSupabase call', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const { result } = renderHook(() => useOnlineStatus('https://xyz.supabase.co'));
    const beforeCheck = result.current.lastChecked;

    vi.advanceTimersByTime(100);

    await act(async () => {
      await result.current.checkSupabase();
    });

    expect(result.current.lastChecked).toBeGreaterThanOrEqual(beforeCheck);
  });
});
