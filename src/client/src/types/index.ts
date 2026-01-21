/**
 * Frontend type definitions for Support Inbox
 * Matches backend types from server/lib/types.ts
 */

// Database Models
export interface Ticket {
  id: number;
  subject: string;
  customer_email: string;
  customer_name: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  assignee_id: number | null;
  message_id: string | null;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
  last_message_sender_email?: string | null;
  last_message_sender_name?: string | null;
  last_message_at?: string | null;
  message_count: number;
  last_message_preview: string | null;
  attachment_count: number;
  tags?: Tag[];
}

export interface EmailMetadata {
  subject?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
}

export type MessageType = 'email' | 'note' | 'sms' | 'chat' | 'phone' | 'system';

export interface Message {
  id: number;
  ticket_id: number;
  sender_email: string;
  sender_name: string | null;
  body: string;
  body_html: string | null;
  email_metadata: string | null; // JSON string of EmailMetadata
  type: MessageType;
  tracking_token: string | null;
  message_id: string | null;
  created_at: string;
  scheduled_at: string | null; // NULL = sent immediately, timestamp = scheduled for later
  sent_at: string | null; // NULL = not sent yet, timestamp = when actually sent
}

export interface Attachment {
  id: number;
  message_id: number;
  filename: string;
  file_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  signature?: string | null;
  agent_email?: string | null;
  ai_profile?: string | null;
  active: boolean; // PostgreSQL boolean: true = active, false = inactive
  created_at: string;
}

export interface CannedResponse {
  id: number;
  title: string;
  content: string;
  created_by: number | null;
  created_at: string;
}

export interface Draft {
  id: number;
  ticket_id: number;
  user_id: number;
  content: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
  created_at: string;
}

export interface EmailOpen {
  id: number;
  message_id: number;
  tracking_token: string;
  opened_at: string;
  user_agent: string | null;
  ip_address: string | null;
}

export type ChangeSource = 'manual' | 'automation' | 'api' | 'email_reply';

export interface TicketHistoryEntry {
  id: number;
  ticket_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by_user_id: number | null;
  changed_by_email: string;
  changed_by_name: string | null;
  changed_at: string;
  change_source: ChangeSource;
  notes: string | null;
}

// Enums
export type TicketStatus = 'new' | 'open' | 'awaiting_customer' | 'resolved';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type UserRole = 'agent' | 'admin';

// Extended Types
export interface TicketWithMessages extends Ticket {
  messages: MessageWithAttachments[];
  assignee?: User;
  customer_ticket_count?: number;
}

export interface MessageWithAttachments extends Message {
  attachments: Attachment[];
  email_opens?: EmailOpen[];
  first_opened_at?: string | null;
}

// API Request/Response Types
export interface CreateTicketRequest {
  subject: string;
  customer_email: string;
  customer_name?: string;
  message_body: string;
  message_id?: string;
  assignee_email?: string;
}

export interface ReplyToTicketRequest {
  body: string;
  type?: MessageType;
  uploadedFiles?: Array<{
    filename: string;
    filePath: string;
    size: number;
    mimeType: string;
    cid?: string; // Content-ID for inline images
  }>;
  to_emails?: string[]; // Additional To recipients
  cc_emails?: string[];
  reply_to_message_id?: number; // Specific message to reply to (for quoting and recipient)
  scheduled_at?: string; // ISO 8601 timestamp for scheduled sending
}

export interface UpdateTicketRequest {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignee_id?: number | null;
  customer_email?: string;
  customer_name?: string;
  follow_up_at?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// SSE Event Types
export type SSEEventType =
  | 'heartbeat'
  | 'new-ticket'
  | 'ticket-update'
  | 'new-message'
  | 'message-deleted'
  | 'viewer-joined'
  | 'viewer-left'
  | 'user-composing';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
}

export interface NewTicketEvent extends SSEEvent {
  type: 'new-ticket';
  data: Ticket;
}

export interface TicketUpdateEvent extends SSEEvent {
  type: 'ticket-update';
  data: Ticket;
}

export interface NewMessageEvent extends SSEEvent {
  type: 'new-message';
  data: {
    ticketId: number;
    message: MessageWithAttachments;
  };
}

export interface MessageDeletedEvent extends SSEEvent {
  type: 'message-deleted';
  data: {
    ticketId: number;
    messageId: number;
  };
}

export interface ViewerJoinedEvent extends SSEEvent {
  type: 'viewer-joined';
  data: {
    ticketId: number;
    userEmail: string;
    userName: string;
  };
}

export interface ViewerLeftEvent extends SSEEvent {
  type: 'viewer-left';
  data: {
    ticketId: number;
    userEmail: string;
  };
}

export interface UserComposingEvent extends SSEEvent {
  type: 'user-composing';
  data: {
    ticketId: number;
    userEmail: string;
    userName: string;
  };
}

// Statistics
export interface TicketStats {
  total: number;
  new: number;
  open: number;
  awaiting_customer: number;
  resolved: number;
  unassigned: number;
  avg_first_response_time: number | null;
  avg_resolution_time: number | null;
}

// Report Data
export interface ReportData {
  messagesOverTime: { date: string; sent: number; received: number }[];
  ticketsByStatus: { status: string; count: number }[];
  ticketsByPriority: { priority: string; count: number }[];
  ticketsByAgent: { agent_id: number | null; agent_name: string; count: number }[];
  messagesByType: { type: string; count: number }[];
  avgResponseTime: { avg_hours: number | null };
  totalTickets: number;
  totalMessages: number;
  resolvedTickets: number;
}

// Ticket Filters
export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  assignee_id?: number | null;
  customer_email?: string;
  search?: string;
  tag_id?: number;
  limit?: number;
  offset?: number;
  sort_order?: 'asc' | 'desc';
}

// Pagination
export interface PaginationInfo {
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
}

export interface PaginatedTicketsResponse {
  tickets: Ticket[];
  pagination: PaginationInfo;
}
