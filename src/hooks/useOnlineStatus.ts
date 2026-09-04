import { useState, useEffect, useCallback, useRef } from 'react';

export interface OnlineStatus {
  isOnline: boolean;
  isSupabaseReachable: boolean;
  lastChecked: number;
  checkSupabase: () => Promise<boolean>;
}

export function useOnlineStatus(supabaseUrl?: string): OnlineStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSupabaseReachable, setIsSupabaseReachable] = useState(true);
  const [lastChecked, setLastChecked] = useState(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const handleOnline = () => { if (mountedRef.current) setIsOnline(true); };
    const handleOffline = () => { if (mountedRef.current) setIsOnline(false); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const checkSupabase = useCallback(async (): Promise<boolean> => {
    if (!supabaseUrl) {
      if (mountedRef.current) {
        setIsSupabaseReachable(false);
        setLastChecked(Date.now());
      }
      return false;
    }
    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const reachable = res.ok || res.status === 401 || res.status === 403;
      if (mountedRef.current) {
        setIsSupabaseReachable(reachable);
        setLastChecked(Date.now());
      }
      return reachable;
    } catch {
      clearTimeout(timer);
      if (mountedRef.current) {
        setIsSupabaseReachable(false);
        setLastChecked(Date.now());
      }
      return false;
    }
  }, [supabaseUrl]);

  // Check Supabase reachability on mount and when coming back online
  useEffect(() => {
    if (isOnline) {
      checkSupabase();
    } else {
      setIsSupabaseReachable(false);
    }
  }, [isOnline, checkSupabase]);

  return { isOnline, isSupabaseReachable, lastChecked, checkSupabase };
}
