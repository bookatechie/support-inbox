/**
 * Input validation utilities
 * Centralized validation logic for API inputs
 */

import type { TicketStatus, TicketPriority, UserRole } from './types.js';

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate and sanitize email address
 * @throws Error if email is invalid
 */
export function validateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();

  if (!trimmed) {
    throw new Error('Email is required');
  }

  if (!isValidEmail(trimmed)) {
    throw new Error('Invalid email format');
  }

  if (trimmed.length > 255) {
    throw new Error('Email too long (max 255 characters)');
  }

  return trimmed;
}

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
 * Validate user role
 */
export function isValidUserRole(role: string): role is UserRole {
  return ['agent', 'admin'].includes(role);
}

/**
 * Validate and parse integer ID
 * @throws Error if id is invalid
 */
export function validateId(id: string | number, fieldName: string = 'id'): number {
  const parsed = typeof id === 'string' ? parseInt(id, 10) : id;

  if (isNaN(parsed) || parsed < 1) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }

  return parsed;
}

/**
 * Validate string is not empty
 * @throws Error if string is empty
 */
export function validateNotEmpty(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmed;
}

/**
 * Validate string length
 * @throws Error if string is too long or too short
 */
export function validateLength(
  value: string,
  fieldName: string,
  min: number = 0,
  max: number = Infinity
): string {
  if (value.length < min) {
    throw new Error(`${fieldName} must be at least ${min} characters`);
  }

  if (value.length > max) {
    throw new Error(`${fieldName} must be at most ${max} characters`);
  }

  return value;
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

/**
 * Validate file type for attachments
 */
export function isValidFileType(mimeType: string): boolean {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
  ];

  return allowedMimes.includes(mimeType);
}

/**
 * Validate file size
 */
export function isValidFileSize(size: number, maxSizeMB: number = 50): boolean {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return size > 0 && size <= maxBytes;
}

/**
 * Sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
  // Remove any path components
  const basename = filename.replace(/^.*[\\\/]/, '');

  // Remove dangerous characters
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Ensure it's not empty
  if (!sanitized) {
    return 'file';
  }

  return sanitized;
}

/**
 * Validate array of IDs
 * @throws Error if array is invalid
 */
export function validateIdArray(ids: unknown, fieldName: string = 'ids'): number[] {
  if (!Array.isArray(ids)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (ids.length === 0) {
    throw new Error(`${fieldName} array cannot be empty`);
  }

  if (ids.length > 100) {
    throw new Error(`${fieldName} array too large (max 100 items)`);
  }

  return ids.map((id, index) => {
    try {
      return validateId(id, `${fieldName}[${index}]`);
    } catch (error) {
      throw new Error(`Invalid ${fieldName}[${index}]: must be a positive integer`);
    }
  });
}

/**
 * Validate and parse query string parameter
 */
export function parseQueryParam(
  value: unknown,
  allowedValues?: string[]
): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const strValue = String(value);

  if (allowedValues && !allowedValues.includes(strValue)) {
    throw new Error(`Invalid value: must be one of ${allowedValues.join(', ')}`);
  }

  return strValue;
}

/**
 * Validate and parse integer query parameter
 */
export function parseIntQueryParam(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const num = parseInt(String(value), 10);

  if (isNaN(num)) {
    throw new Error('Invalid number');
  }

  return num;
}
