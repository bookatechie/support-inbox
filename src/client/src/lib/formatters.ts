/**
 * Formatting utilities
 * Centralized formatters for dates, file sizes, numbers, etc.
 */

import { formatDistanceToNow, format } from 'date-fns';

/**
 * Format date as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  try {
    // pg library returns Date objects, Fastify serializes to ISO strings
    // Just pass directly to Date constructor
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

/**
 * Format date as absolute timestamp (e.g., "Jan 15, 2025 at 3:30 PM")
 */
export function formatAbsoluteDate(date: string | Date): string {
  try {
    // pg library returns Date objects, Fastify serializes to ISO strings
    // Just pass directly to Date constructor
    return format(new Date(date), 'MMM d, yyyy \'at\' h:mm a');
  } catch {
    return 'Invalid date';
  }
}

/**
 * Format date for display in message timestamps
 */
export function formatMessageDate(date: string | Date): string {
  try {
    // pg library returns Date objects, Fastify serializes to ISO strings
    // Just pass directly to Date constructor
    const messageDate = new Date(date);
    const now = new Date();
    const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

    // If less than 24 hours ago, show relative time
    if (diffInHours < 24) {
      return formatDistanceToNow(messageDate, { addSuffix: true });
    }

    // If this year, show "Mon Jan 15 at 3:30 PM"
    if (messageDate.getFullYear() === now.getFullYear()) {
      return format(messageDate, 'EEE MMM d \'at\' h:mm a');
    }

    // Otherwise show full date "Jan 15, 2024 at 3:30 PM"
    return format(messageDate, 'MMM d, yyyy \'at\' h:mm a');
  } catch {
    return 'Invalid date';
  }
}

/**
 * Format file size in bytes to human-readable string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
}

/**
 * Format number with thousand separators (e.g., "1,234")
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }

  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Format email address for display (shorten if too long)
 */
export function formatEmail(email: string, maxLength: number = 30): string {
  if (email.length <= maxLength) {
    return email;
  }

  const [local, domain] = email.split('@');
  if (!domain) return truncate(email, maxLength);

  const maxLocalLength = maxLength - domain.length - 4; // -4 for "@" and "..."
  if (maxLocalLength < 3) return truncate(email, maxLength);

  return `${local.substring(0, maxLocalLength)}...@${domain}`;
}

/**
 * Pluralize word based on count (e.g., "1 ticket", "2 tickets")
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural || `${singular}s`);
  return `${count} ${word}`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return pluralize(days, 'day');
  if (hours > 0) return pluralize(hours, 'hour');
  if (minutes > 0) return pluralize(minutes, 'minute');
  return pluralize(seconds, 'second');
}
