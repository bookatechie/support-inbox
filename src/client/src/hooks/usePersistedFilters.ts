import { useState, useEffect } from 'react';

/**
 * Generic hook for persisting filter state to sessionStorage
 * Handles loading, saving, and updating filters with type safety
 */
export function usePersistedFilters<T extends { [K in keyof T]: string }>(
  key: string,
  defaultFilters: T
) {
  const [filters, setFilters] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        return { ...defaultFilters, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load saved filters:', error);
    }
    return defaultFilters;
  });

  // Auto-save on change
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(filters));
    } catch (error) {
      console.error('Failed to save filters:', error);
    }
  }, [key, filters]);

  const updateFilter = <K extends keyof T>(filterKey: K, value: T[K]) => {
    setFilters((prev) => ({ ...prev, [filterKey]: value }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  return { filters, updateFilter, setFilters, resetFilters };
}
