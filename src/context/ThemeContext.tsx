import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { logger } from '../lib/logger';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = 'em-budget-theme';
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved as Theme;
  } catch (e) {
    logger.warn('getInitialTheme failed', e);
    return 'dark';
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const body = document.body;
  root.classList.remove('light', 'dark');
  body.classList.remove('light', 'dark');
  root.classList.add(theme);
  body.classList.add(theme);
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.setItem('theme', theme);
  } catch (e) {
    logger.warn('applyTheme storage failed', e);
  }
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => {
      try {
        const hasExplicit = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('theme');
        if (hasExplicit) return;
        setThemeState(e.matches ? 'dark' : 'light');
      } catch (e) {
        logger.warn('onChange failed', e);
      }
    };
    // Legacy Safari (< 9) exposes addListener/removeListener instead of addEventListener.
    const legacyMql = mql as MediaQueryList & {
      addListener?: (callback: (e: MediaQueryListEvent) => void) => void;
      removeListener?: (callback: (e: MediaQueryListEvent) => void) => void;
    };
    if (legacyMql.addEventListener) legacyMql.addEventListener('change', onChange);
    else legacyMql.addListener?.(onChange);
    return () => {
      if (legacyMql.removeEventListener) legacyMql.removeEventListener('change', onChange);
      else legacyMql.removeListener?.(onChange);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};
