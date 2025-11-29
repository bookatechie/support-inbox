/**
 * API client for Support Inbox backend
 * Handles all HTTP requests with authentication
 */

import { request, ApiError } from './request';
import type {
  Ticket,
  TicketWithMessages,
  MessageWithAttachments,
  User,
  CannedResponse,
  Draft,
  TicketStats,
  LoginRequest,
  LoginResponse,
  CreateTicketRequest,
  ReplyToTicketRequest,
  UpdateTicketRequest,
  TicketFilters,
  PaginatedTicketsResponse,
  Tag,
  TicketHistoryEntry,
} from '@/types';

// Authentication
export const auth = {
  login: (credentials: LoginRequest) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  getCurrentUser: () => request<User>('/auth/me'),
};

// Re-export ApiError for convenience
export { ApiError };

// Tickets
export const tickets = {
  getAll: (filters?: TicketFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
    }
    const query = params.toString();
    return request<PaginatedTicketsResponse>(`/tickets${query ? `?${query}` : ''}`);
  },

  getById: (id: number) => request<TicketWithMessages>(`/tickets/${id}`),

  getHistory: (id: number) => request<TicketHistoryEntry[]>(`/tickets/${id}/history`),

  create: (data: CreateTicketRequest) =>
    request<Ticket>('/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: UpdateTicketRequest) =>
    request<Ticket>(`/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  reply: (id: number, data: ReplyToTicketRequest) =>
    request<MessageWithAttachments>(`/tickets/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStats: () => request<TicketStats>('/tickets/stats'),

  getCalendar: (start?: string, end?: string) => {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    const query = params.toString();
    return request<Ticket[]>(`/tickets/calendar${query ? `?${query}` : ''}`);
  },

  getCustomerEmails: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return request<string[]>(`/tickets/customer-emails${params}`);
  },

  // Presence tracking
  markAsViewing: (id: number) =>
    request<void>(`/tickets/${id}/viewing`, {
      method: 'POST',
    }),

  notifyComposing: (id: number) =>
    request<void>(`/tickets/${id}/composing`, {
      method: 'POST',
    }),

  // Customer info
  getCustomerInfo: (id: number) =>
    request<{ html: string }>(`/tickets/${id}/customer-info`),

  // AI response generation
  generateResponse: (id: number) =>
    request<{ response: string }>(`/tickets/${id}/generate-response`, {
      method: 'POST',
    }),

  // Bulk operations
  bulkUpdate: (ticketIds: number[], updates: UpdateTicketRequest) =>
    request<{ success: boolean; updated: number; tickets: Ticket[] }>('/tickets/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ ticket_ids: ticketIds, updates }),
    }),

  bulkDelete: (ticketIds: number[]) =>
    request<{ success: boolean; deleted: number }>('/tickets/bulk-delete', {
      method: 'DELETE',
      body: JSON.stringify({ ticket_ids: ticketIds }),
    }),

  // Forward message to email address
  forwardMessage: (messageId: number, toEmail: string, comments?: string) =>
    request<{ ticket_id: number }>(`/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ to_email: toEmail, comments }),
    }),
};

// Messages
export const messages = {
  delete: (messageId: number) =>
    request<{ success: boolean }>(`/messages/${messageId}`, {
      method: 'DELETE',
    }),

  cancelScheduled: (messageId: number) =>
    request<{ success: boolean }>(`/messages/${messageId}/scheduled`, {
      method: 'DELETE',
    }),
};

// Drafts
export const drafts = {
  get: (ticketId: number) => request<Draft>(`/tickets/${ticketId}/draft`),

  save: (ticketId: number, content: string) =>
    request<Draft>(`/tickets/${ticketId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  delete: (ticketId: number) =>
    request<void>(`/tickets/${ticketId}/draft`, {
      method: 'DELETE',
    }),
};

// Canned Responses
export const cannedResponses = {
  getAll: () => request<CannedResponse[]>('/canned-responses'),

  create: (data: { title: string; content: string; shortcut?: string | null }) =>
    request<CannedResponse>('/canned-responses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: { title: string; content: string; shortcut?: string | null }) =>
    request<void>(`/canned-responses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<void>(`/canned-responses/${id}`, {
      method: 'DELETE',
    }),
};

// Users
export const users = {
  getAll: () => request<User[]>('/users'),

  create: (data: { email: string; password: string; name: string; role: 'agent' | 'admin' }) =>
    request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: { email?: string; password?: string; name?: string; role?: 'agent' | 'admin'; signature?: string | null; agent_email?: string | null; ai_profile?: string | null }) =>
    request<User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<{ success: boolean }>(`/users/${id}`, {
      method: 'DELETE',
    }),
};

// Tags
export const tags = {
  getAll: () => request<Tag[]>('/tags'),
};

// Utility
export const checkEmails = () =>
  request<{ message: string }>('/check-emails', {
    method: 'POST',
  });
