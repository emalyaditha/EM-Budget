import { useState, useEffect, useCallback } from 'react';

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

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkSupabase = useCallback(async (): Promise<boolean> => {
    if (!supabaseUrl) {
      setIsSupabaseReachable(false);
      setLastChecked(Date.now());
      return false;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const reachable = res.ok || res.status === 401 || res.status === 403;
      setIsSupabaseReachable(reachable);
      setLastChecked(Date.now());
      return reachable;
    } catch {
      setIsSupabaseReachable(false);
      setLastChecked(Date.now());
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
