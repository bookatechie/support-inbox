/**
 * Webhook notification utilities
 * Sends HTTP POST requests to configured webhook URLs
 */

import { config } from './config.js';
import type { Ticket, Message, Attachment } from './types.js';

// Simple logger interface for compatibility
interface Logger {
  info: (msg: string) => void;
  error: (msg: string, error?: unknown) => void;
}

// Default console logger
const defaultLogger: Logger = {
  info: (msg: string) => console.log(msg),
  error: (msg: string, error?: unknown) => console.error(msg, error),
};

/**
 * Extract recipient addresses from message
 * Uses to_emails/cc_emails columns first, falls back to email_metadata for backward compatibility
 */
export function extractRecipientsFromMessage(message: Message): {
  to: string[];
  cc: string[];
  original_to: string | null;
} {
  const result = { to: [] as string[], cc: [] as string[], original_to: null as string | null };

  // Try database columns first (new format)
  if (message.to_emails) {
    try {
      const parsed = JSON.parse(message.to_emails);
      if (Array.isArray(parsed)) {
        result.to = parsed;
      }
    } catch {
      // Invalid JSON, continue to fallback
    }
  }

  if (message.cc_emails) {
    try {
      const parsed = JSON.parse(message.cc_emails);
      if (Array.isArray(parsed)) {
        result.cc = parsed;
      }
    } catch {
      // Invalid JSON, continue to fallback
    }
  }

  // Fall back to email_metadata for backward compatibility and original_to
  if (message.email_metadata) {
    try {
      const metadata = JSON.parse(message.email_metadata);
      // Only use metadata.to/cc if database columns were empty
      if (result.to.length === 0 && Array.isArray(metadata.to)) {
        result.to = metadata.to;
      }
      if (result.cc.length === 0 && Array.isArray(metadata.cc)) {
        result.cc = metadata.cc;
      }
      // original_to is only in email_metadata (from X-Original-To header)
      if (typeof metadata.originalTo === 'string') {
        result.original_to = metadata.originalTo;
      }
    } catch {
      // Invalid JSON, ignore
    }
  }

  return result;
}

export interface NewTicketWebhookPayload {
  event: 'new_ticket';
  ticket: {
    id: number;
    subject: string;
    customer_email: string;
    customer_name: string | null;
    status: string;
    priority: string;
    assignee_id: number | null;
    message_id: string | null;
    created_at: string;
    updated_at: string;
  };
  message: {
    id: number;
    ticket_id: number;
    sender_email: string;
    sender_name: string | null;
    body: string;
    body_html: string | null;
    email_metadata: string | null;
    type: string;
    message_id: string | null;
    created_at: string;
    to: string[];
    cc: string[];
    original_to: string | null;
    attachments?: Array<{
      id: number;
      message_id: number;
      filename: string;
      file_path: string;
      size_bytes: number | null;
      mime_type: string | null;
      created_at: string;
    }>;
  };
}

export interface NewReplyWebhookPayload {
  event: 'new_reply';
  ticket: {
    id: number;
    subject: string;
    customer_email: string;
    customer_name: string | null;
    status: string;
    priority: string;
    assignee_id: number | null;
    message_id: string | null;
    created_at: string;
    updated_at: string;
  };
  message: {
    id: number;
    ticket_id: number;
    sender_email: string;
    sender_name: string | null;
    body: string;
    body_html: string | null;
    email_metadata: string | null;
    type: string;
    message_id: string | null;
    created_at: string;
    to: string[];
    cc: string[];
    original_to: string | null;
    attachments?: Array<{
      id: number;
      message_id: number;
      filename: string;
      file_path: string;
      size_bytes: number | null;
      mime_type: string | null;
      created_at: string;
    }>;
  };
}

export interface CustomerReplyWebhookPayload {
  event: 'customer_reply';
  ticket: {
    id: number;
    subject: string;
    customer_email: string;
    customer_name: string | null;
    status: string;
    priority: string;
    assignee_id: number | null;
    message_id: string | null;
    created_at: string;
    updated_at: string;
  };
  message: {
    id: number;
    ticket_id: number;
    sender_email: string;
    sender_name: string | null;
    body: string;
    body_html: string | null;
    email_metadata: string | null;
    type: string;
    message_id: string | null;
    created_at: string;
    to: string[];
    cc: string[];
    original_to: string | null;
    attachments?: Array<{
      id: number;
      message_id: number;
      filename: string;
      file_path: string;
      size_bytes: number | null;
      mime_type: string | null;
      created_at: string;
    }>;
  };
}

export interface TicketUpdateWebhookPayload {
  event: 'ticket_update';
  ticket: {
    id: number;
    subject: string;
    customer_email: string;
    customer_name: string | null;
    status: string;
    priority: string;
    assignee_id: number | null;
    message_id: string | null;
    created_at: string;
    updated_at: string;
  };
  changes: {
    status?: string;
    priority?: string;
    assignee_id?: number | null;
  };
  updated_by: string;
}

/**
 * Send webhook notification for new ticket (fire-and-forget)
 * Does not block - errors are logged but don't affect the caller
 */
export function sendNewTicketWebhook(
  ticket: Ticket,
  message: Message,
  attachments?: Attachment[],
  logger: Logger = defaultLogger
): void {
  if (!config.webhookUrl) {
    return; // Webhook not configured, skip silently
  }

  const recipients = extractRecipientsFromMessage(message);

  const payload: NewTicketWebhookPayload = {
    event: 'new_ticket',
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      customer_email: ticket.customer_email,
      customer_name: ticket.customer_name,
      status: ticket.status,
      priority: ticket.priority,
      assignee_id: ticket.assignee_id,
      message_id: ticket.message_id,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    },
    message: {
      id: message.id,
      ticket_id: message.ticket_id,
      sender_email: message.sender_email,
      sender_name: message.sender_name,
      body: message.body,
      body_html: message.body_html,
      email_metadata: message.email_metadata,
      type: message.type,
      message_id: message.message_id,
      created_at: message.created_at,
      to: recipients.to,
      cc: recipients.cc,
      original_to: recipients.original_to,
      attachments: attachments,
    },
  };

  // Fire and forget - don't await, but still log errors
  fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'SupportInbox/1.0',
    },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      if (!response.ok) {
        logger.error(`Webhook failed: ${response.status} ${response.statusText}`);
      } else {
        logger.info(`✓ Webhook sent for ticket #${ticket.id}`);
      }
    })
    .catch((error) => {
      logger.error('Failed to send webhook:', error);
    });
}

/**
 * Send webhook notification for new reply (fire-and-forget)
 * Does not block - errors are logged but don't affect the caller
 */
export function sendNewReplyWebhook(
  ticket: Ticket,
  message: Message,
  attachments?: Attachment[],
  logger: Logger = defaultLogger
): void {
  if (!config.webhookUrl) {
    return; // Webhook not configured, skip silently
  }

  const recipients = extractRecipientsFromMessage(message);

  const payload: NewReplyWebhookPayload = {
    event: 'new_reply',
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      customer_email: ticket.customer_email,
      customer_name: ticket.customer_name,
      status: ticket.status,
      priority: ticket.priority,
      assignee_id: ticket.assignee_id,
      message_id: ticket.message_id,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    },
    message: {
      id: message.id,
      ticket_id: message.ticket_id,
      sender_email: message.sender_email,
      sender_name: message.sender_name,
      body: message.body,
      body_html: message.body_html,
      email_metadata: message.email_metadata,
      type: message.type,
      message_id: message.message_id,
      created_at: message.created_at,
      to: recipients.to,
      cc: recipients.cc,
      original_to: recipients.original_to,
      attachments: attachments,
    },
  };

  // Fire and forget - don't await, but still log errors
  fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'SupportInbox/1.0',
    },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      if (!response.ok) {
        logger.error(`Webhook failed: ${response.status} ${response.statusText}`);
      } else {
        logger.info(`✓ Webhook sent for reply on ticket #${ticket.id}`);
      }
    })
    .catch((error) => {
      logger.error('Failed to send webhook:', error);
    });
}

/**
 * Send webhook notification for customer reply (fire-and-forget)
 * Does not block - errors are logged but don't affect the caller
 */
export function sendCustomerReplyWebhook(
  ticket: Ticket,
  message: Message,
  attachments?: Attachment[],
  logger: Logger = defaultLogger
): void {
  if (!config.webhookUrl) {
    return; // Webhook not configured, skip silently
  }

  const recipients = extractRecipientsFromMessage(message);

  const payload: CustomerReplyWebhookPayload = {
    event: 'customer_reply',
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      customer_email: ticket.customer_email,
      customer_name: ticket.customer_name,
      status: ticket.status,
      priority: ticket.priority,
      assignee_id: ticket.assignee_id,
      message_id: ticket.message_id,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    },
    message: {
      id: message.id,
      ticket_id: message.ticket_id,
      sender_email: message.sender_email,
      sender_name: message.sender_name,
      body: message.body,
      body_html: message.body_html,
      email_metadata: message.email_metadata,
      type: message.type,
      message_id: message.message_id,
      created_at: message.created_at,
      to: recipients.to,
      cc: recipients.cc,
      original_to: recipients.original_to,
      attachments: attachments,
    },
  };

  // Fire and forget - don't await, but still log errors
  fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'SupportInbox/1.0',
    },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      if (!response.ok) {
        logger.error(`Webhook failed: ${response.status} ${response.statusText}`);
      } else {
        logger.info(`✓ Webhook sent for customer reply on ticket #${ticket.id}`);
      }
    })
    .catch((error) => {
      logger.error('Failed to send webhook:', error);
    });
}

/**
 * Send webhook notification for ticket update (fire-and-forget)
 * Does not block - errors are logged but don't affect the caller
 */
export function sendTicketUpdateWebhook(
  ticket: Ticket,
  changes: { status?: string; priority?: string; assignee_id?: number | null },
  updatedBy: string,
  logger: Logger = defaultLogger
): void {
  if (!config.webhookUrl) {
    return; // Webhook not configured, skip silently
  }

  const payload: TicketUpdateWebhookPayload = {
    event: 'ticket_update',
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      customer_email: ticket.customer_email,
      customer_name: ticket.customer_name,
      status: ticket.status,
      priority: ticket.priority,
      assignee_id: ticket.assignee_id,
      message_id: ticket.message_id,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    },
    changes,
    updated_by: updatedBy,
  };

  // Fire and forget - don't await, but still log errors
  fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'SupportInbox/1.0',
    },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      if (!response.ok) {
        logger.error(`Webhook failed: ${response.status} ${response.statusText}`);
      } else {
        logger.info(`✓ Webhook sent for ticket #${ticket.id} update`);
      }
    })
    .catch((error) => {
      logger.error('Failed to send webhook:', error);
    });
}
