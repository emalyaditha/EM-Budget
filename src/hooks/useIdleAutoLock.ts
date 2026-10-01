import { useCallback, useEffect, useRef } from 'react';

type IdleAutoLockOptions = {
  enabled: boolean;
  timeoutSeconds: number | null;
  onLock: () => void;
};

/**
 * Re-locks the app after the configured idle timeout. Activity events update a
 * lastActivity baseline (throttled to one bump per second) and a 1s ticker
 * compares elapsed time against the timeout. A fired guard prevents repeated
 * onLock calls until notifyActivity() resets it.
 */
export function useIdleAutoLock({ enabled, timeoutSeconds, onLock }: IdleAutoLockOptions) {
  const lastActivityRef = useRef(Date.now());
  const firedRef = useRef(false);
  const onLockRef = useRef(onLock);

  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  const notifyActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    firedRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled || timeoutSeconds == null) return;
    lastActivityRef.current = Date.now();
    firedRef.current = false;

    let lastBump = 0;
    const bump = () => {
      const now = Date.now();
      if (now - lastBump < 1000) return;
      lastBump = now;
      lastActivityRef.current = now;
      firedRef.current = false;
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        firedRef.current = false;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const timer = setInterval(() => {
      if (firedRef.current) return;
      if (Date.now() - lastActivityRef.current >= timeoutSeconds * 1000) {
        firedRef.current = true;
        onLockRef.current();
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump));
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, [enabled, timeoutSeconds]);

  return { notifyActivity };
}
