/**
 * Application constants
 * Centralized constants for colors, config, and magic values
 */

import type { TicketStatus, TicketPriority } from '@/types';

/**
 * Status badge colors
 */
export const STATUS_COLORS: Record<TicketStatus, string> = {
  new: 'bg-blue-500',
  open: 'bg-yellow-500',
  awaiting_customer: 'bg-orange-500',
  resolved: 'bg-green-500',
} as const;

/**
 * Priority badge colors
 */
export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'bg-gray-500',
  normal: 'bg-blue-500',
  high: 'bg-orange-500',
  urgent: 'bg-red-500',
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
