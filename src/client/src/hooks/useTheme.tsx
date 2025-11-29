/**
 * Dark mode theme hook
 * Manages theme state and persists to localStorage
 * Supports three modes: light, dark, and auto (follows system preference)
 */

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'auto';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored && ['light', 'dark', 'auto'].includes(stored)) {
      return stored;
    }
    // Default to auto mode
    return 'auto';
  });

  useEffect(() => {
    const root = document.documentElement;

    // Persist to localStorage first (before any returns)
    localStorage.setItem('theme', theme);

    // Helper function to apply the actual theme
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    // Apply theme based on current setting
    if (theme === 'auto') {
      // Use system preference
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(isDark);

      // Listen for system preference changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches);
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      // Use explicit theme
      applyTheme(theme === 'dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      // Cycle through: light -> dark -> auto
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'auto';
      return 'light';
    });
  };

  return { theme, toggleTheme };
}
