/**
 * Ticket business logic
 * Orchestrates database operations, email sending, and SSE events
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import convert from 'heic-convert';
import {
  ticketQueries,
  messageQueries,
  attachmentQueries,
  emailOpenQueries,
  ticketHistoryQueries,
  userQueries,
  getTicketById,
  getMessagesByTicketId,
} from './database-pg.js';
import { sendReplyEmail } from './email-sender.js';
import { saveAttachment, getAttachmentPath, readAttachment } from './file-storage.js';
import { stripHtml } from './email-parser.js';
import {
  sendNewTicketWebhook,
  sendNewReplyWebhook,
  sendCustomerReplyWebhook,
  sendTicketUpdateWebhook,
} from './webhook.js';
import { config } from './config.js';
import type {
  Ticket,
  Message,
  ParsedEmail,
  ParsedAttachment,
  CreateTicketRequest,
  CreateTicketOptions,
  ReplyToTicketRequest,
  UpdateTicketRequest,
  TicketWithMessages,
  UserSafe,
  ChangeSource,
} from './types.js';

// Logger interface for Pino/Fastify logger compatibility
interface Logger {
  info: (objOrMsg: object | string, msg?: string) => void;
  error: (objOrMsg: object | string, msg?: string) => void;
  debug: (objOrMsg: object | string, msg?: string) => void;
}

// Module-level logger (will be set by index.ts)
let logger: Logger | null = null;

export function setLogger(log: Logger): void {
  logger = log;
}

// SSE event emitter (will be set by SSE module)
let sseEmitter: EventEmitter | null = null;

export function setSseEmitter(emitter: EventEmitter): void {
  sseEmitter = emitter;
}

/**
 * Check if a file is HEIC format based on content type or filename
 */
function isHeicFile(contentType: string, filename: string): boolean {
  const lowerType = contentType.toLowerCase();
  const lowerName = filename.toLowerCase();
  return (
    lowerType === 'image/heic' ||
    lowerType === 'image/heif' ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif')
  );
}

/**
 * Convert HEIC image to JPEG
 * Returns the converted buffer, new filename, and new content type
 */
async function convertHeicToJpeg(
  content: Buffer,
  filename: string
): Promise<{ content: Buffer; filename: string; contentType: string }> {
  try {
    const jpegBuffer = await convert({
      buffer: new Uint8Array(content).buffer,
      format: 'JPEG',
      quality: 0.9,
    });

    // Replace .heic/.heif extension with .jpg
    const newFilename = filename.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');

    logger?.debug({ originalFilename: filename, newFilename }, 'Converted HEIC to JPEG');

    return {
      content: Buffer.from(jpegBuffer),
      filename: newFilename,
      contentType: 'image/jpeg',
    };
  } catch (error) {
    logger?.error({ err: error, filename }, 'Failed to convert HEIC file');
    // Return original if conversion fails
    return { content, filename, contentType: 'image/heic' };
  }
}

/**
 * Save attachments for a message
 */
async function saveMessageAttachments(
  messageId: number,
  ticketId: number,
  attachments: ParsedAttachment[]
): Promise<void> {
  for (const attachment of attachments) {
    try {
      let content = attachment.content;
      let filename = attachment.filename;
      let contentType = attachment.contentType;
      let size = attachment.size;

      // Convert HEIC to JPEG for browser compatibility
      if (isHeicFile(contentType, filename)) {
        const converted = await convertHeicToJpeg(content, filename);
        content = converted.content;
        filename = converted.filename;
        contentType = converted.contentType;
        size = content.length;
      }

      // Save file to disk
      const filePath = await saveAttachment(filename, content, ticketId);

      // Save to database
      await attachmentQueries.create(
        messageId,
        filename,
        filePath,
        size,
        contentType
      );

      logger?.debug({ filename, size }, 'Saved attachment');
    } catch (error) {
      logger?.error({ err: error, filename: attachment.filename }, 'Failed to save attachment');
    }
  }
}

/**
 * Create a new ticket from parsed email
 */
export async function createTicketFromEmail(email: ParsedEmail, logger?: Logger, assigneeId?: number): Promise<Ticket> {
  // Use Reply-To if set (for automated emails), otherwise use From
  const customerEmail = email.replyTo || email.from;

  const ticketId = await ticketQueries.create(
    email.subject,
    customerEmail,
    email.fromName,
    email.replyTo,
    email.messageId,
    'new',
    'normal',
    assigneeId || null
  );

  // Create initial message
  const emailMetadata = JSON.stringify({
    subject: email.subject,
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    inReplyTo: email.inReplyTo,
    references: email.references,
    priority: email.priority,
    receivedDate: email.receivedDate?.toISOString(),
    originalTo: email.originalTo,
    emailClient: email.emailClient,
    headers: email.headers,
  });

  const messageId = await messageQueries.create(
    ticketId,
    email.from,
    email.fromName,
    email.body,
    'email',  // type = email (customer-facing)
    email.messageId,
    email.bodyHtml,
    email.bodyHtmlStripped,
    emailMetadata,
    null,  // scheduledAt
    email.to,  // toEmails
    email.cc   // ccEmails
  );

  // Save attachments if any
  if (email.attachments && email.attachments.length > 0) {
    await saveMessageAttachments(messageId, ticketId, email.attachments);
  }

  const ticket = (await getTicketById(ticketId))!;
  const message = (await messageQueries.getById(messageId))!;
  const attachments = await attachmentQueries.getByMessageId(messageId);

  // Emit SSE event
  if (sseEmitter) {
    sseEmitter.emit('new-ticket', ticket);
  }

  // Send webhook notification (fire-and-forget, handles errors internally)
  sendNewTicketWebhook(ticket, message, attachments, logger);

  logger?.info({ ticketId, subject: email.subject, attachments: email.attachments?.length || 0 }, 'Created ticket from email');

  return ticket;
}

/**
 * Add message to existing ticket (customer reply)
 */
export async function addMessageToTicket(ticketId: number, email: ParsedEmail): Promise<Message> {
  // Use Reply-To if set (for automated emails), otherwise use From
  const senderEmail = email.replyTo || email.from;

  const emailMetadata = JSON.stringify({
    subject: email.subject,
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    inReplyTo: email.inReplyTo,
    references: email.references,
    priority: email.priority,
    receivedDate: email.receivedDate?.toISOString(),
    originalTo: email.originalTo,
    emailClient: email.emailClient,
    headers: email.headers,
  });

  const messageId = await messageQueries.create(
    ticketId,
    senderEmail,
    email.fromName,
    email.body,
    'email',  // type = email (customer-facing)
    email.messageId,
    email.bodyHtml,
    email.bodyHtmlStripped,
    emailMetadata,
    null,  // scheduledAt
    email.to,  // toEmails
    email.cc   // ccEmails
  );

  // Save attachments if any
  if (email.attachments && email.attachments.length > 0) {
    await saveMessageAttachments(messageId, ticketId, email.attachments);
  }

  // Update ticket status to 'open' if it was awaiting customer or resolved
  const ticket = await getTicketById(ticketId);
  if (ticket && (ticket.status === 'awaiting_customer' || ticket.status === 'resolved')) {
    await ticketQueries.updateStatus('open', ticketId);
  }

  // Note: updated_at is automatically updated by PostgreSQL triggers

  const message = (await messageQueries.getById(messageId))!;

  // Emit SSE event with attachments and email opens
  // Get attachments for this message
  const attachments = await attachmentQueries.getByMessageId(messageId);

  if (sseEmitter) {
    const emailOpens = await emailOpenQueries.getByMessageId(messageId);
    const firstOpen = emailOpens.length > 0 ? emailOpens[0] : null;

    const messageWithAttachments = {
      ...message,
      attachments,
      email_opens: emailOpens,
      first_opened_at: firstOpen?.opened_at || null,
    };

    sseEmitter.emit('new-message', { ticketId, message: messageWithAttachments });

    // Also emit ticket update
    const updatedTicket = await getTicketById(ticketId);
    if (updatedTicket) {
      sseEmitter.emit('ticket-update', updatedTicket);
    }
  }

  // Send webhook notification for customer reply (fire-and-forget, handles errors internally)
  const updatedTicket = await getTicketById(ticketId);
  if (updatedTicket) {
    sendCustomerReplyWebhook(updatedTicket, message, attachments);
  }

  logger?.info({ ticketId, attachments: email.attachments?.length || 0 }, 'Added message to ticket');

  return message;
}

/**
 * Create ticket manually (from API)
 * @param options Optional overrides for status, assigneeId, and priority
 */
export async function createTicket(
  request: CreateTicketRequest,
  user: UserSafe,
  logger?: Logger,
  options?: CreateTicketOptions
): Promise<Ticket> {
  const ticketId = await ticketQueries.create(
    request.subject,
    request.customer_email,
    request.customer_name || null,
    null,  // reply_to_email - manual tickets don't have separate reply-to
    request.message_id || null,
    options?.status || 'new',
    options?.priority || 'normal',
    options?.assigneeId !== undefined ? options.assigneeId : null,
    request.follow_up_at || null
  );

  // Create initial message if message_body is provided
  let message = null;
  let attachments: any[] = [];
  if (request.message_body && request.message_body.trim()) {
    const messageId = await messageQueries.create(
      ticketId,
      request.customer_email,  // Sender is the customer
      request.customer_name || null,
      request.message_body,
      'email',  // type = email (customer-facing message)
      request.message_id || null,
      null,  // body_html - plain text for API-created messages
      null,  // body_html_stripped
      null,  // email_metadata
      null,  // scheduledAt
      null,  // toEmails - manual tickets don't have recipients
      null   // ccEmails
    );

    message = (await messageQueries.getById(messageId))!;
    attachments = await attachmentQueries.getByMessageId(messageId);
  }

  const ticket = (await getTicketById(ticketId))!;

  // Emit SSE event
  if (sseEmitter) {
    sseEmitter.emit('new-ticket', ticket);
  }

  // Send webhook notification if ticket has a message
  if (message) {
    sendNewTicketWebhook(ticket, message, attachments, logger);
  }

  logger?.info({ ticketId, createdBy: user.email }, 'Manually created ticket');

  return ticket;
}

/**
 * Reply to ticket (send email and save message)
 */
export async function replyToTicket(
  ticketId: number,
  request: ReplyToTicketRequest,
  user: UserSafe,
  uploadedFiles?: Array<{
    filename: string;
    filePath: string;
    size: number;
    mimeType: string;
    cid?: string;
  }>
): Promise<Message> {
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  // Check if this is a scheduled message
  const isScheduled = request.scheduled_at && new Date(request.scheduled_at) > new Date();

  // Auto-assign ticket to replying user if unassigned (only for immediate sends)
  if (!ticket.assignee_id && !isScheduled) {
    logger?.info({ ticketId, assignee: user.name, assigneeEmail: user.email }, 'Auto-assigning ticket');
    await ticketQueries.updateAssignee(user.id, ticketId);

    // Log auto-assignment to audit trail
    await logTicketChange(ticketId, 'assignee_id', null, user.id, user, 'email_reply', 'Auto-assigned when agent replied');

    // Emit SSE event for assignment
    if (sseEmitter) {
      const updatedTicket = await getTicketById(ticketId);
      if (updatedTicket) {
        sseEmitter.emit('ticket-update', updatedTicket);
      }
    }
  }

  // Extract plain text from HTML for the body field
  // Simple HTML to text conversion - strip tags but preserve line breaks
  const plainText = request.body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

  // Save message with HTML in body_html field
  // Use agent's company email (agent_email) or fallback to shared inbox
  const senderEmail = user.agent_email || config.smtp.from;

  // Determine actual recipients - use provided to_emails or fallback to ticket customer
  const actualToEmails = request.to_emails && request.to_emails.length > 0
    ? request.to_emails
    : [ticket.reply_to_email || ticket.customer_email];

  const messageId = await messageQueries.create(
    ticketId,
    senderEmail,  // Use agent's company email (what customer sees), not login email
    user.name,
    plainText,  // Plain text in body
    request.type || 'email',  // type defaults to 'email' if not specified
    null,  // message_id (agent reply, no email)
    request.body,  // HTML in body_html
    stripHtml(request.body),  // body_html_stripped (stripped HTML for full-text search)
    null,  // email_metadata (agent reply, no email metadata)
    isScheduled ? request.scheduled_at! : null,  // scheduled_at
    request.type !== 'note' ? actualToEmails : null,  // toEmails (only for non-notes)
    request.type !== 'note' ? (request.cc_emails || null) : null  // ccEmails (only for non-notes)
  );

  // messageId returned directly

  // Save attachments to database if any
  const emailAttachments: Array<{ filename: string; path?: string; content?: Buffer; cid?: string }> = [];
  if (uploadedFiles && uploadedFiles.length > 0) {
    for (const file of uploadedFiles) {
      await attachmentQueries.create(
        messageId,
        file.filename,
        file.filePath,
        file.size,
        file.mimeType
      );

      // Build attachment array for email
      // For S3, read file as buffer; for local storage, use path
      const attachmentPath = getAttachmentPath(file.filePath);
      const isS3Path = !attachmentPath.startsWith('/'); // S3 keys don't start with /

      if (isS3Path) {
        // Read from S3 as buffer
        const fileBuffer = await readAttachment(file.filePath);
        emailAttachments.push({
          filename: file.filename,
          content: fileBuffer,
          cid: file.cid,
        });
      } else {
        // Use local file path
        emailAttachments.push({
          filename: file.filename,
          path: attachmentPath,
          cid: file.cid,
        });
      }
    }
  }

  // Send email if not a note (notes are internal only) and not scheduled
  if (request.type !== 'note' && !isScheduled) {
    // Generate tracking token for email open tracking
    const trackingToken = crypto.randomBytes(32).toString('hex');
    await messageQueries.updateTrackingToken(trackingToken, messageId);

    // Check if this is the first message to customer (only the message we just created exists)
    const messages = await getMessagesByTicketId(ticketId);
    const isFirstMessage = messages.length === 1;

    // Collect previous email messages to include as quoted text in reply
    // Exclude the message we just created from the quoted messages
    let previousEmailMessages;

    if (request.reply_to_message_id) {
      // Replying to a specific message - only quote that message
      const specificMessage = messages.find(m => m.id === request.reply_to_message_id);
      previousEmailMessages = specificMessage ? [specificMessage] : [];
    } else {
      // Default behavior: quote last 5 email messages (excluding the one we just created)
      // Filter: only email messages (not notes) and exclude current message
      // Sort in reverse chronological order (most recent first) for better context
      previousEmailMessages = messages
        .filter(m => m.type === 'email' && m.id !== messageId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5); // Limit to last 5 messages to avoid email bloat
    }

    // Database already stores cid: references, which work for both email and browser display
    // (Browser display converts cid: to /api/attachments/:id URLs on the frontend)
    const emailMessageId = await sendReplyEmail(
      ticket,
      request.body,  // Use body with cid: references as-is
      user.name,
      isFirstMessage,
      emailAttachments.length > 0 ? emailAttachments : undefined,
      request.to_emails,
      request.cc_emails,
      user.signature,
      trackingToken,
      user.agent_email,  // Use agent's personalized email if configured
      previousEmailMessages  // Pass previous messages for quoting
    );

    // Store the Message-ID for email threading
    if (emailMessageId) {
      await messageQueries.updateMessageId(emailMessageId, messageId);
    }

    // Update ticket status to resolved after team member reply
    await ticketQueries.updateStatus('resolved', ticketId);
  }

  const message = (await messageQueries.getById(messageId))!;
  const attachments = await attachmentQueries.getByMessageId(messageId);

  // Emit SSE event with attachments and email opens
  if (sseEmitter) {
    const emailOpens = await emailOpenQueries.getByMessageId(messageId);
    const firstOpen = emailOpens.length > 0 ? emailOpens[0] : null;

    const messageWithAttachments = {
      ...message,
      attachments,
      email_opens: emailOpens,
      first_opened_at: firstOpen?.opened_at || null,
    };

    sseEmitter.emit('new-message', { ticketId, message: messageWithAttachments });

    // Also emit ticket update
    const updatedTicket = await getTicketById(ticketId);
    if (updatedTicket) {
      sseEmitter.emit('ticket-update', updatedTicket);
    }
  }

  // Send webhook notification (fire-and-forget, handles errors internally)
  const updatedTicket = await getTicketById(ticketId);
  if (updatedTicket) {
    sendNewReplyWebhook(updatedTicket, message, attachments);
  }

  if (isScheduled) {
    logger?.info({ ticketId, by: user.email, scheduledAt: request.scheduled_at }, 'Scheduled reply for ticket');
  } else {
    logger?.info({ ticketId, by: user.email, type: request.type || 'email' }, 'Reply added to ticket');
  }

  return message;
}

/**
 * Send a scheduled message that is now due
 */
export async function sendScheduledMessage(message: Message): Promise<boolean> {
  const ticket = await getTicketById(message.ticket_id);
  if (!ticket) {
    logger?.error({ ticketId: message.ticket_id, messageId: message.id }, 'Ticket not found for scheduled message');
    return false;
  }

  // Get attachments
  const attachments = await attachmentQueries.getByMessageId(message.id);
  const emailAttachments: Array<{ filename: string; path?: string; content?: Buffer }> = [];
  for (const att of attachments) {
    const path = getAttachmentPath(att.file_path);
    if (!path.startsWith('/')) {
      emailAttachments.push({ filename: att.filename, content: await readAttachment(att.file_path) });
    } else {
      emailAttachments.push({ filename: att.filename, path });
    }
  }

  // Generate tracking token
  const trackingToken = crypto.randomBytes(32).toString('hex');
  await messageQueries.updateTrackingToken(trackingToken, message.id);

  // Get previous messages for quoting
  const allMessages = await getMessagesByTicketId(message.ticket_id);
  const previousMessages = allMessages
    .filter(m => m.type === 'email' && m.id !== message.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const isFirstMessage = allMessages.filter(m => m.id !== message.id).length === 0;
  const user = await userQueries.getByAgentEmail(message.sender_email);

  let emailMessageId: string;
  try {
    emailMessageId = await sendReplyEmail(
      ticket,
      message.body_html || message.body,
      message.sender_name || 'Support',
      isFirstMessage,
      emailAttachments.length > 0 ? emailAttachments : undefined,
      undefined,
      undefined,
      user?.signature || null,
      trackingToken,
      message.sender_email,
      previousMessages
    );
  } catch (error) {
    logger?.error({ err: error, messageId: message.id, ticketId: message.ticket_id }, 'Failed to send scheduled message, will retry on next interval');
    return false;
  }

  if (emailMessageId) {
    await messageQueries.updateMessageId(emailMessageId, message.id);
  }

  await messageQueries.updateSentAt(new Date().toISOString(), message.id);
  await ticketQueries.updateStatus('resolved', message.ticket_id);

  logger?.info({ messageId: message.id, ticketId: message.ticket_id }, 'Scheduled message sent');
  return true;
}

/**
 * Log a ticket field change to audit history
 */
async function logTicketChange(
  ticketId: number,
  fieldName: string,
  oldValue: any,
  newValue: any,
  user: UserSafe,
  changeSource: ChangeSource = 'manual',
  notes?: string
): Promise<void> {
  // Don't log if values are the same
  if (oldValue === newValue) return;

  // Convert values to strings for storage
  const oldValueStr = oldValue === null || oldValue === undefined ? null : String(oldValue);
  const newValueStr = newValue === null || newValue === undefined ? null : String(newValue);

  try {
    await ticketHistoryQueries.create({
      ticket_id: ticketId,
      field_name: fieldName,
      old_value: oldValueStr,
      new_value: newValueStr,
      changed_by_user_id: user.id,
      changed_by_email: user.email,
      changed_by_name: user.name,
      change_source: changeSource,
      notes,
    });

    logger?.info({ ticketId, field: fieldName, oldValue: oldValueStr, newValue: newValueStr, by: user.email }, '[AUDIT] Ticket field changed');
  } catch (error) {
    logger?.error({ err: error, ticketId }, 'Failed to log ticket change');
    // Don't throw - audit logging failure shouldn't break ticket updates
  }
}

/**
 * Update ticket metadata
 */
export async function updateTicket(ticketId: number, request: UpdateTicketRequest, user: UserSafe): Promise<Ticket> {
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  // Resolve assignee_email to assignee_id if provided
  if (request.assignee_email !== undefined && request.assignee_id === undefined) {
    if (request.assignee_email === null) {
      request.assignee_id = null;
    } else {
      const assignee = await userQueries.getByEmail(request.assignee_email);
      if (!assignee) {
        throw new Error(`User not found with email: ${request.assignee_email}`);
      }
      request.assignee_id = assignee.id;
    }
  }

  // Track changes for webhook
  const changes: { status?: string; priority?: string; assignee_id?: number | null; customer_email?: string; customer_name?: string; follow_up_at?: string | null } = {};

  // Update status with audit logging
  if (request.status !== undefined && request.status !== ticket.status) {
    const oldStatus = ticket.status;
    await ticketQueries.updateStatus(request.status, ticketId);
    await logTicketChange(ticketId, 'status', oldStatus, request.status, user);
    changes.status = request.status;
  }

  // Update priority with audit logging
  if (request.priority !== undefined && request.priority !== ticket.priority) {
    const oldPriority = ticket.priority;
    await ticketQueries.updatePriority(request.priority, ticketId);
    await logTicketChange(ticketId, 'priority', oldPriority, request.priority, user);
    changes.priority = request.priority;
  }

  // Update assignee with audit logging
  if (request.assignee_id !== undefined && request.assignee_id !== ticket.assignee_id) {
    const oldAssignee = ticket.assignee_id;
    await ticketQueries.updateAssignee(request.assignee_id, ticketId);
    await logTicketChange(ticketId, 'assignee_id', oldAssignee, request.assignee_id, user);
    changes.assignee_id = request.assignee_id;
  }

  // Update customer email with audit logging
  if (request.customer_email !== undefined && request.customer_email !== ticket.customer_email) {
    const oldEmail = ticket.customer_email;
    await ticketQueries.updateCustomerEmail(request.customer_email, ticketId);
    await logTicketChange(ticketId, 'customer_email', oldEmail, request.customer_email, user);
    changes.customer_email = request.customer_email;
  }

  // Update customer name with audit logging
  if (request.customer_name !== undefined && request.customer_name !== ticket.customer_name) {
    const oldName = ticket.customer_name;
    await ticketQueries.updateCustomerName(request.customer_name || null, ticketId);
    await logTicketChange(ticketId, 'customer_name', oldName, request.customer_name, user);
    changes.customer_name = request.customer_name;
  }

  // Update follow-up date with audit logging
  if (request.follow_up_at !== undefined && request.follow_up_at !== ticket.follow_up_at) {
    const oldFollowUp = ticket.follow_up_at;
    await ticketQueries.updateFollowUp(request.follow_up_at, ticketId);
    await logTicketChange(ticketId, 'follow_up_at', oldFollowUp, request.follow_up_at, user);
    changes.follow_up_at = request.follow_up_at;
  }

  const updatedTicket = (await getTicketById(ticketId))!;

  // Emit SSE event
  if (sseEmitter) {
    sseEmitter.emit('ticket-update', updatedTicket);
  }

  // Send webhook notification if there were changes (fire-and-forget, handles errors internally)
  if (Object.keys(changes).length > 0) {
    sendTicketUpdateWebhook(updatedTicket, changes, user.email);
  }

  logger?.info({ ticketId, by: user.email }, 'Ticket updated');

  return updatedTicket;
}

/**
 * Get ticket with all messages and attachments
 */
export async function getTicketWithMessages(ticketId: number): Promise<TicketWithMessages | null> {
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return null;
  }

  const messages = await getMessagesByTicketId(ticketId);

  // Helper to convert timestamp to ISO 8601 UTC
  // PostgreSQL 'timestamp without time zone' stores UTC, just need to format it
  const toISO = (ts: string | Date) => {
    if (ts instanceof Date) return ts.toISOString();
    return ts.replace(' ', 'T') + 'Z';
  };

  // Add attachments and email opens to each message, and normalize timestamps
  const messagesWithAttachments = await Promise.all(messages.map(async (message) => {
    const emailOpens = (await emailOpenQueries.getByMessageId(message.id)).map(open => ({
      ...open,
      opened_at: toISO(open.opened_at),
    }));
    const firstOpen = emailOpens.length > 0 ? emailOpens[0] : null;

    const attachments = (await attachmentQueries.getByMessageId(message.id)).map(att => ({
      ...att,
      created_at: toISO(att.created_at),
    }));

    return {
      ...message,
      created_at: toISO(message.created_at),
      attachments,
      email_opens: emailOpens,
      first_opened_at: firstOpen?.opened_at || null,
    };
  }));

  // Get count of all tickets from this customer
  const customerTicketCount = await ticketQueries.countByCustomerEmail(ticket.customer_email);

  return {
    ...ticket,
    created_at: toISO(ticket.created_at),
    updated_at: toISO(ticket.updated_at),
    messages: messagesWithAttachments,
    customer_ticket_count: customerTicketCount,
  };
}

/**
 * Check if an email has already been processed (deduplication)
 */
export async function isEmailAlreadyProcessed(messageId: string | null): Promise<boolean> {
  if (!messageId) {
    return false; // Can't deduplicate emails without Message-ID
  }

  const existingMessage = await messageQueries.getByEmailMessageId(messageId);
  return existingMessage !== undefined;
}

/**
 * Find existing ticket by email Message-ID
 * Searches both tickets.message_id (initial email) and messages.message_id (replies)
 */
export async function findTicketByMessageId(messageId: string): Promise<Ticket | undefined> {
  // First check tickets table (initial customer email)
  const ticket = await ticketQueries.getByMessageId(messageId);
  if (ticket) {
    return ticket;
  }

  // Then check messages table (agent replies)
  const message = await messageQueries.getByEmailMessageId(messageId);
  if (message) {
    return await getTicketById(message.ticket_id);
  }

  return undefined;
}

/**
 * Find existing ticket by checking In-Reply-To or References headers
 */
export async function findTicketByThreading(email: ParsedEmail): Promise<Ticket | undefined> {
  // Check In-Reply-To header
  if (email.inReplyTo) {
    const ticket = await findTicketByMessageId(email.inReplyTo);
    if (ticket) {
      return ticket;
    }
  }

  // Check References headers
  for (const ref of email.references) {
    const ticket = await findTicketByMessageId(ref);
    if (ticket) {
      return ticket;
    }
  }

  return undefined;
}

/**
 * Get ticket statistics
 * Note: Needs to be implemented with PostgreSQL-specific queries
 */
export async function getTicketStats() {
  // TODO: Implement with ticketQueries once stats query is added to database-pg
  return {
    total: 0,
    new: 0,
    open: 0,
    awaiting_customer: 0,
    resolved: 0,
  };
}
