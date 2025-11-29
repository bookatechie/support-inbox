/**
 * Simple sessionStorage cache utility
 * Provides TTL-based caching for API responses
 */

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached data if available and not expired
 */
export function getCached<T>(key: string): T | null {
  try {
    const cacheKey = `support-inbox-${key}-cache`;
    const timestampKey = `support-inbox-${key}-cache-timestamp`;

    const cachedData = sessionStorage.getItem(cacheKey);
    const cachedTimestamp = sessionStorage.getItem(timestampKey);

    if (!cachedData || !cachedTimestamp) {
      return null;
    }

    const age = Date.now() - parseInt(cachedTimestamp, 10);
    const ttl = DEFAULT_TTL;

    if (age >= ttl) {
      // Expired - clean up
      sessionStorage.removeItem(cacheKey);
      sessionStorage.removeItem(timestampKey);
      return null;
    }

    return JSON.parse(cachedData) as T;
  } catch (error) {
    console.error(`Failed to get cached data for key "${key}":`, error);
    return null;
  }
}

/**
 * Set cached data with current timestamp
 */
export function setCached<T>(key: string, data: T): void {
  try {
    const cacheKey = `support-inbox-${key}-cache`;
    const timestampKey = `support-inbox-${key}-cache-timestamp`;

    const jsonString = JSON.stringify(data);

    // Skip caching if data is too large (> 1MB to be safe with quota)
    if (jsonString.length > 1024 * 1024) {
      console.warn(`Skipping cache for key "${key}": data too large (${(jsonString.length / 1024).toFixed(2)}KB)`);
      return;
    }

    sessionStorage.setItem(cacheKey, jsonString);
    sessionStorage.setItem(timestampKey, Date.now().toString());
  } catch (error) {
    // Handle QuotaExceededError gracefully
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn(`Storage quota exceeded for key "${key}", clearing old cache entries`);

      // Try to clear some space by removing old cache entries
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const storageKey = sessionStorage.key(i);
          if (storageKey?.startsWith('support-inbox-') && storageKey.endsWith('-cache')) {
            sessionStorage.removeItem(storageKey);
            const timestampKey = storageKey.replace('-cache', '-cache-timestamp');
            sessionStorage.removeItem(timestampKey);
          }
        }
      } catch (cleanupError) {
        console.error('Failed to cleanup cache:', cleanupError);
      }
    } else {
      console.error(`Failed to set cached data for key "${key}":`, error);
    }
  }
}

/**
 * Clear cached data for a specific key
 */
export function clearCached(key: string): void {
  try {
    const cacheKey = `support-inbox-${key}-cache`;
    const timestampKey = `support-inbox-${key}-cache-timestamp`;

    sessionStorage.removeItem(cacheKey);
    sessionStorage.removeItem(timestampKey);
  } catch (error) {
    console.error(`Failed to clear cached data for key "${key}":`, error);
  }
}

/**
 * Fetch data with automatic caching
 * Will return cached data if available, otherwise fetch fresh and cache
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // Check cache first
  const cached = getCached<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch fresh data
  const data = await fetcher();
  setCached(key, data);

  return data;
}
