import { useEffect, useState } from 'react';
import type { AppTheme } from '../types';

const THEME_IDS: AppTheme[] = ['default', 'glassy', 'light', 'tokyo-night'];

/** Reads the active app theme from the `data-app-theme` attribute, reacting to changes. */
export function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>(() => {
    const raw = typeof document !== 'undefined' ? document.documentElement.dataset.appTheme : undefined;
    return (THEME_IDS as string[]).includes(raw ?? '') ? (raw as AppTheme) : 'default';
  });

  useEffect(() => {
    const el = document.documentElement;
    const apply = () => {
      const raw = el.dataset.appTheme;
      setTheme((THEME_IDS as string[]).includes(raw ?? '') ? (raw as AppTheme) : 'default');
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(el, { attributes: true, attributeFilter: ['data-app-theme'] });
    window.addEventListener('storage', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', apply);
    };
  }, []);

  return theme;
}

/** Resolve a CSS variable from the document root (with fallback). */
export function cssVar(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export const isLightTheme = (theme: AppTheme) => theme === 'light';
