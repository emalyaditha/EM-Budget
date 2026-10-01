import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdleAutoLock } from './useIdleAutoLock';

describe('useIdleAutoLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls onLock after timeoutSeconds of inactivity', () => {
    const onLock = vi.fn();
    renderHook(() => useIdleAutoLock({ enabled: true, timeoutSeconds: 10, onLock }));

    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(onLock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('fires only once until activity resumes', () => {
    const onLock = vi.fn();
    const { result } = renderHook(() => useIdleAutoLock({ enabled: true, timeoutSeconds: 5, onLock }));

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onLock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onLock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.notifyActivity();
      vi.advanceTimersByTime(4000);
    });
    expect(onLock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onLock).toHaveBeenCalledTimes(2);
  });

  it('pointerdown activity resets the idle timer', () => {
    const onLock = vi.fn();
    renderHook(() => useIdleAutoLock({ enabled: true, timeoutSeconds: 10, onLock }));

    act(() => {
      vi.advanceTimersByTime(9000);
      window.dispatchEvent(new Event('pointerdown'));
    });
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(onLock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('stays disarmed when disabled or when no timeout is set', () => {
    const onLock = vi.fn();
    renderHook(() => useIdleAutoLock({ enabled: false, timeoutSeconds: 5, onLock }));
    renderHook(() => useIdleAutoLock({ enabled: true, timeoutSeconds: null, onLock }));

    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(onLock).not.toHaveBeenCalled();
  });
});
