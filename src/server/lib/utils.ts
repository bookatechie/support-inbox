/**
 * Utility functions
 * Shared utilities used across the application
 */

import type { User, UserSafe } from './types.js';

/**
 * Normalize date to ISO 8601 format with Z suffix
 * PostgreSQL returns Date objects, convert to ISO string
 */
function normalizeDateForApi(date: string | Date | null): string {
  if (!date) return new Date().toISOString();

  // Convert Date object to ISO string, or return string as-is
  return date instanceof Date ? date.toISOString() : date;
}

/**
 * Remove sensitive data from user object
 */
export function sanitizeUser(user: User): UserSafe {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    signature: user.signature,
    agent_email: user.agent_email,
    ai_profile: user.ai_profile,
    active: user.active,
    created_at: normalizeDateForApi(user.created_at),
  };
}

/**
 * Remove sensitive data from multiple user objects
 */
export function sanitizeUsers(users: User[]): UserSafe[] {
  return users.map(sanitizeUser);
}

/**
 * Truncate string to max length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }

  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Sleep for specified milliseconds (useful for testing)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry async function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delayMs);
      }
    }
  }

  throw lastError!;
}
