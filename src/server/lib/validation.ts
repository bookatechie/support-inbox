/**
 * Input validation utilities
 * Centralized validation logic for API inputs
 */

import type { TicketStatus, TicketPriority } from './types.js';

/**
 * Validate ticket status
 */
export function isValidTicketStatus(status: string): status is TicketStatus {
  return ['new', 'open', 'awaiting_customer', 'resolved'].includes(status);
}

/**
 * Validate ticket priority
 */
export function isValidTicketPriority(priority: string): priority is TicketPriority {
  return ['low', 'normal', 'high', 'urgent'].includes(priority);
}

/**
 * Validate password strength
 * @throws Error if password doesn't meet requirements
 */
export function validatePassword(password: string): string {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  if (password.length > 128) {
    throw new Error('Password must be at most 128 characters');
  }

  return password;
}

