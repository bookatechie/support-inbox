/**
 * Core type definitions for Support Inbox
 * Single source of truth for all TypeScript interfaces
 */

// Database Models
export interface Ticket {
  id: number;
  subject: string;
  customer_email: string;
  customer_name: string | null;
  reply_to_email: string | null;
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
}

export interface EmailMetadata {
  subject?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  inReplyTo?: string | null;
  references?: string[];
  priority?: string | null;
  receivedDate?: string | null; // ISO 8601 string
  originalTo?: string | null;
  emailClient?: string | null;
  headers?: Record<string, string | string[]>; // Raw headers for debugging
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
  scheduled_at: string | null; // NULL = send immediately, timestamp = scheduled for later
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
  password_hash: string;
  name: string;
  role: UserRole;
  signature: string | null;
  agent_email: string | null;
  ai_profile: string | null;
  active: boolean; // PostgreSQL: true = active, false = inactive
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

export interface TicketTag {
  ticket_id: number;
  tag_id: number;
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

export interface TicketHistoryCreateRequest {
  ticket_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by_user_id: number;
  changed_by_email: string;
  changed_by_name: string;
  change_source?: ChangeSource;
  notes?: string;
}

// Enums
export type TicketStatus = 'new' | 'open' | 'awaiting_customer' | 'resolved';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type UserRole = 'agent' | 'admin';

// Extended Types
export interface TicketWithMessages extends Ticket {
  messages: MessageWithAttachments[];
  assignee?: UserSafe;
  customer_ticket_count?: number;
}

export interface TicketWithHistory extends Ticket {
  history?: TicketHistoryEntry[];
}

export interface MessageWithAttachments extends Message {
  attachments: Attachment[];
  email_opens?: EmailOpen[];
  first_opened_at?: string | null;
}

// Safe user type (without password_hash)
export type UserSafe = Omit<User, 'password_hash'>;

// API Request/Response Types
export interface CreateTicketRequest {
  subject: string;
  customer_email: string;
  customer_name?: string;
  message_body: string;
  message_id?: string;
  assignee_email?: string;
}

export interface CreateTicketOptions {
  status?: TicketStatus;
  assigneeId?: number | null;
  priority?: TicketPriority;
}

export interface ReplyToTicketRequest {
  body: string;
  type?: MessageType;
  attachments?: string[]; // S3 keys
  to_emails?: string[]; // Additional To recipients
  cc_emails?: string[];
  reply_to_message_id?: number; // Specific message to reply to (for quoting and recipient)
  scheduled_at?: string; // ISO 8601 timestamp for scheduled sending (null/undefined = send immediately)
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
  user: UserSafe;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

// Email Parsing Types
export interface ParsedEmail {
  subject: string;
  from: string;
  fromName: string | null;
  replyTo: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  body: string;
  bodyHtml: string | null;
  bodyHtmlStripped: string;  // HTML with tags stripped for full-text search indexing
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: ParsedAttachment[];
  date: Date;
  // Additional headers for debugging and features
  priority?: string | null; // Email priority (high/normal/low)
  receivedDate?: Date | null; // When server received email
  originalTo?: string | null; // X-Original-To header (original recipient before forwarding)
  emailClient?: string | null; // X-Mailer or User-Agent
  headers?: Record<string, string | string[]>; // Raw headers map for debugging
}

export interface ParsedAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  size: number;
}

// SSE Event Types
export type SSEEventType =
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
    message: Message;
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

// Presence Tracking
export interface TicketViewer {
  ticketId: number;
  userEmail: string;
  userName: string;
  joinedAt: Date;
}

export interface TicketLock {
  ticketId: number;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
}

// Database Config
export interface DatabaseConfig {
  path: string;
}

// IMAP Config
export interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  pollInterval: number; // milliseconds
}

// SMTP Config
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

// JWT Payload
export interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
}

// Query Filters
export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  assignee_id?: number | null;
  customer_email?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// Statistics
export interface TicketStats {
  total: number;
  new: number;
  open: number;
  awaiting_customer: number;
  resolved: number;
  unassigned: number;
  avg_first_response_time: number | null; // seconds
  avg_resolution_time: number | null; // seconds
}
