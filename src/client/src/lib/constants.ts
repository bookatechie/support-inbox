/**
 * Application constants
 * Centralized constants for colors, config, and magic values
 */

import type { TicketStatus, TicketPriority } from '@/types';

/**
 * Status badge colors: tinted background + dark text of the same hue (readable at badge size).
 * Hue follows urgency, Zendesk-style: needs action = warm, waiting on the customer = calm blue,
 * done = grey.
 */
export const STATUS_COLORS: Record<TicketStatus, string> = {
  new: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  open: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  awaiting_customer: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  resolved: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400',
} as const;

/**
 * Priority text colors. Priority is an outlined badge with an icon, so it never reads as a status;
 * only Urgent gets a color of its own.
 */
export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'text-muted-foreground',
  normal: 'text-muted-foreground',
  high: 'text-foreground',
  urgent: 'text-red-700 border-red-300 dark:text-red-400 dark:border-red-500/40',
} as const;

/**
 * Status display labels
 */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'New',
  open: 'Open',
  awaiting_customer: 'Awaiting Customer',
  resolved: 'Resolved',
} as const;

/**
 * Priority display labels
 */
export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
} as const;

/**
 * Auto-save debounce delay (ms)
 */
export const AUTOSAVE_DELAY = 1000;

/**
 * SSE reconnect interval (ms)
 */
export const SSE_RECONNECT_INTERVAL = 3000;

/**
 * Maximum file upload size (bytes)
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Allowed file MIME types for uploads
 */
export const ALLOWED_MIME_TYPES = [
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
] as const;

/**
 * The default admin (user 1): name, email and password come from the server's .env and are
 * re-synced on every restart, so the app doesn't offer to edit them (the server refuses too)
 */
export const DEFAULT_ADMIN_USER_ID = 1;
