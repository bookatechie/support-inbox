/**
 * Fastify API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import bcrypt from 'bcrypt';
import {
  getAllTickets,
  getTicketsFiltered,
  countTicketsFiltered,
  getTicketById,
  getUserByEmail,
  getUserById,
  userQueries,
  ticketQueries,
  messageQueries,
  emailOpenQueries,
  draftQueries,
  cannedResponseQueries,
  attachmentQueries,
  tagQueries,
  ticketTagQueries,
  ticketHistoryQueries,
} from '../lib/database-pg.js';
import { readAttachment, saveAttachment, deleteTicketAttachments } from '../lib/file-storage.js';
import {
  createTicket,
  updateTicket,
  replyToTicket,
  getTicketWithMessages,
  getTicketStats,
  setLogger,
} from '../lib/ticket.js';
import { checkEmailsNow } from '../workers/email-daemon.js';
import { handleSSE, sseEmitter, getClientCount } from './sse.js';
import { sendNewEmail } from '../lib/email-sender.js';
import { sanitizeUser, sanitizeUsers } from '../lib/utils.js';
import { config } from '../lib/config.js';
import type {
  UserSafe,
  JwtPayload,
  LoginRequest,
  CreateTicketRequest,
  ReplyToTicketRequest,
  UpdateTicketRequest,
  UserRole,
} from '../lib/types.js';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Extend @fastify/jwt to properly type the user
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: UserSafe;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse filter parameters from query string
 */
function parseFilterParams(query: {
  status?: string;
  assignee_id?: string;
  customer_email?: string;
  tag_id?: string;
}) {
  // Parse status filter
  const statuses = query.status ? query.status.split(',').map(s => s.trim()) : undefined;

  // Parse assignee filter
  let assigneeId: number | null | undefined = undefined;
  if (query.assignee_id === 'null' || query.assignee_id === 'unassigned') {
    assigneeId = null;
  } else if (query.assignee_id) {
    const assigneeIdNum = parseInt(query.assignee_id, 10);
    if (!isNaN(assigneeIdNum)) {
      assigneeId = assigneeIdNum;
    }
  }

  // Parse tag filter
  let tagId: number | undefined = undefined;
  if (query.tag_id) {
    const tagIdNum = parseInt(query.tag_id, 10);
    if (!isNaN(tagIdNum)) {
      tagId = tagIdNum;
    }
  }

  return {
    statuses,
    assigneeId,
    customerEmail: query.customer_email,
    tagId,
  };
}

/**
 * Convert PostgreSQL timestamp (without timezone) to ISO 8601 UTC string
 * PostgreSQL 'timestamp without time zone' stores UTC timestamps
 * We just need to format them as ISO strings by adding 'T' and 'Z'
 */
function toISOString(timestamp: string | Date | null): string | null {
  if (!timestamp) return null;

  // If already a Date object, convert to ISO string
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  // If it's a string, format it
  // PostgreSQL format: "2025-11-20 14:38:08.192614"
  // Convert to ISO format: "2025-11-20T14:38:08.192Z"
  // Replace space with 'T' and append 'Z' to indicate UTC
  return timestamp.replace(' ', 'T') + 'Z';
}

/**
 * Convert timestamp fields to proper ISO 8601 UTC format
 */
function normalizeTimestamps(tickets: any[]) {
  tickets.forEach(ticket => {
    ticket.created_at = toISOString(ticket.created_at);
    ticket.updated_at = toISOString(ticket.updated_at);
    ticket.last_message_at = toISOString(ticket.last_message_at);
    ticket.follow_up_at = toISOString(ticket.follow_up_at);
  });
}

/**
 * Load and attach tags to tickets
 */
async function attachTagsToTickets(tickets: any[]) {
  if (tickets.length === 0) return;

  const ticketIds = tickets.map(t => t.id);
  const allTicketTags = await ticketTagQueries.bulkGetByTicketIds(ticketIds);

  const tagsByTicketId = new Map<number, any[]>();
  for (const row of allTicketTags) {
    if (!tagsByTicketId.has(row.ticket_id)) {
      tagsByTicketId.set(row.ticket_id, []);
    }
    tagsByTicketId.get(row.ticket_id)!.push({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
    });
  }

  tickets.forEach((ticket: any) => {
    ticket.tags = tagsByTicketId.get(ticket.id) || [];
  });
}

export default async function routes(fastify: FastifyInstance) {
  // Set logger for ticket business logic
  setLogger(fastify.log);

  // Register JWT plugin
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  // Register multipart plugin for file uploads
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max file size
    },
  });

  // Authentication decorator
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      // Check for API key first (X-API-Key header)
      const apiKey = request.headers['x-api-key'];
      if (apiKey && config.internalApiKey && apiKey === config.internalApiKey) {
        // Valid internal API key - create a system user
        request.user = {
          id: 0,
          email: 'system@internal',
          name: 'Internal API',
          role: 'admin',
          signature: null,
          agent_email: null,
          ai_profile: null,
          active: true,
          created_at: new Date().toISOString(),
        };
        request.log.info('Authenticated via internal API key');
        return;
      }

      // Fall back to JWT authentication
      const authHeader = request.headers.authorization;
      let token: string | null = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
      // Fall back to query parameter for SSE (EventSource doesn't support headers)
      else if (request.query && typeof (request.query as any).token === 'string') {
        token = (request.query as any).token;
      }

      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized - missing API key or JWT token' });
      }

      const payload = fastify.jwt.verify(token) as JwtPayload;
      const user = await getUserById(payload.userId);

      if (!user) {
        return reply.status(401).send({ error: 'User not found' });
      }

      // Attach user to request (without password)
      request.user = sanitizeUser(user);
    } catch (error) {
      request.log.error(error, 'Authentication failed');
      return reply.status(401).send({ error: 'Invalid token' });
    }
  });

  // ============================================================================
  // Auth Routes
  // ============================================================================

  /**
   * POST /auth/login
   * Login with email and password
   */
  fastify.post<{ Body: LoginRequest }>('/auth/login', async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password required' });
    }

    const user = await getUserByEmail(email);

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = fastify.jwt.sign(payload, { expiresIn: '7d' });

    return reply.send({
      token,
      user: sanitizeUser(user),
    });
  });

  /**
   * GET /auth/me
   * Get current user
   */
  fastify.get('/auth/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    return reply.send(request.user);
  });

  // ============================================================================
  // Ticket Routes
  // ============================================================================

  /**
   * GET /tickets
   * List all tickets
   */
  fastify.get<{
    Querystring: {
      status?: string;
      assignee_id?: string;
      customer_email?: string;
      limit?: string;
      offset?: string;
      search?: string;
      tag_id?: string;
      sort_order?: 'asc' | 'desc';
    };
  }>('/tickets', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { status, assignee_id, customer_email, limit, offset, search, tag_id, sort_order } = request.query;

    // Parse pagination params
    const pageLimit = limit ? Math.min(parseInt(limit, 10), 100) : 50; // Default 50, max 100
    const pageOffset = offset ? parseInt(offset, 10) : 0;

    // Parse filter parameters using helper function
    const filters = parseFilterParams({ status, assignee_id, customer_email, tag_id });

    // Unified query - searchWithFilters handles both search and filter-only cases
    const searchTerm = search?.trim() || '';
    const queryStartTime = Date.now();

    const tickets = await ticketQueries.searchWithFilters(searchTerm, {
      status: filters.statuses,
      assigneeId: filters.assigneeId,
      customerEmail: filters.customerEmail,
      tagId: filters.tagId,
      limit: pageLimit,
      offset: pageOffset,
      sortOrder: sort_order || 'desc',
    });

    const queryDuration = Date.now() - queryStartTime;

    // Get total count from first result (window function embeds it in each row)
    const totalCount = tickets.length > 0 ? tickets[0].total_count : 0;

    // Load tags and normalize timestamps
    await attachTagsToTickets(tickets);
    normalizeTimestamps(tickets);

    // Log performance
    const queryType = searchTerm ? 'search' : 'filter';
    if (queryDuration > 100) {
      request.log.warn({
        duration: queryDuration,
        query: queryType,
        searchTerm: searchTerm || undefined,
        filters,
        resultCount: tickets.length,
        totalCount
      }, `Slow ${queryType} query detected`);
    } else {
      request.log.info({
        duration: queryDuration,
        query: queryType,
        resultCount: tickets.length,
        totalCount
      }, `${queryType} query completed`);
    }

    const hasMore = pageOffset + pageLimit < totalCount;

    return reply.send({
      tickets,
      pagination: {
        hasMore,
        nextOffset: hasMore ? pageOffset + pageLimit : null,
        total: totalCount,
      },
    });
  });

  /**
   * GET /tickets/stats
   * Get ticket statistics
   */
  fastify.get('/tickets/stats', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const stats = getTicketStats();
    return reply.send(stats);
  });

  /**
   * GET /tickets/calendar
   * Get tickets with follow-ups for calendar view
   * Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD (optional date range)
   */
  fastify.get<{
    Querystring: { start?: string; end?: string };
  }>('/tickets/calendar', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { start, end } = request.query;

    let tickets;
    if (start && end) {
      // Get tickets within date range
      tickets = await ticketQueries.getByFollowUpDateRange(start, end);
    } else {
      // Get all tickets with follow-ups
      tickets = await ticketQueries.getWithFollowUps();
    }

    // Load tags and normalize timestamps
    await attachTagsToTickets(tickets);
    normalizeTimestamps(tickets);

    return reply.send(tickets);
  });

  /**
   * GET /tickets/customer-emails
   * Get unique customer email addresses and support team from emails
   * Query params: ?search=query (optional filter)
   */
  fastify.get('/tickets/customer-emails', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { search } = request.query as { search?: string };

    // Get customer emails using PostgreSQL (filtered if search provided)
    const customerEmails = await ticketQueries.getDistinctCustomerEmails(search);

    // Get support team from emails (agent_email) using PostgreSQL (filtered if search provided)
    const teamEmails = await userQueries.getDistinctAgentEmails(search);

    // Combine and deduplicate
    const allEmails = new Set([
      ...customerEmails.map(row => row.email),
      ...teamEmails.map(row => row.email)
    ]);

    // Sort alphabetically
    return reply.send(Array.from(allEmails).sort());
  });

  /**
   * GET /tickets/:id
   * Get ticket with messages
   */
  fastify.get<{ Params: { id: string } }>('/tickets/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const ticket = await getTicketWithMessages(ticketId);

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    return reply.send(ticket);
  });

  /**
   * GET /tickets/:id/history
   * Get audit history for a ticket
   */
  fastify.get<{ Params: { id: string } }>('/tickets/:id/history', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);

    if (isNaN(ticketId)) {
      return reply.status(400).send({ error: 'Invalid ticket ID' });
    }

    try {
      const history = await ticketHistoryQueries.getByTicketId(ticketId);
      // Normalize timestamp to ISO 8601 UTC format
      const normalizedHistory = history.map(entry => ({
        ...entry,
        changed_at: toISOString(entry.changed_at),
      }));
      return reply.send(normalizedHistory);
    } catch (error) {
      fastify.log.error(error, 'Failed to fetch ticket history');
      return reply.status(500).send({ error: 'Failed to fetch ticket history' });
    }
  });

  /**
   * POST /tickets
   * Create new ticket manually
   */
  fastify.post<{ Body: CreateTicketRequest }>('/tickets', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketRequest = request.body;
    const user = request.user!;

    if (!ticketRequest.subject || !ticketRequest.customer_email) {
      return reply.status(400).send({ error: 'Missing required fields: subject and customer_email' });
    }

    const ticket = await createTicket(ticketRequest, user, request.log);

    // Determine assignee: use assignee_email if provided, otherwise assign to creator (unless internal API)
    let assigneeId: number | null = user.id > 0 ? user.id : null;

    if (ticketRequest.assignee_email) {
      const assignee = await userQueries.getByAgentEmail(ticketRequest.assignee_email);
      if (assignee) {
        assigneeId = assignee.id;
        request.log.info(`Assigning ticket #${ticket.id} to ${assignee.name} via agent_email: ${ticketRequest.assignee_email}`);
      } else {
        request.log.warn(`Could not find user with agent_email: ${ticketRequest.assignee_email}, leaving unassigned`);
        assigneeId = null;
      }
    }

    // Assign ticket (only if we have a valid assignee)
    if (assigneeId !== null) {
      await ticketQueries.updateAssignee(assigneeId, ticket.id);
    }

    // Get updated ticket with assignee
    const updatedTicket = await getTicketById(ticket.id);

    return reply.status(201).send(updatedTicket);
  });

  /**
   * PATCH /tickets/:id
   * Update ticket (status, priority, assignee)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateTicketRequest }>('/tickets/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const updateRequest = request.body;

    try {
      const ticket = await updateTicket(ticketId, updateRequest, request.user!);
      return reply.send(ticket);
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  /**
   * POST /tickets/bulk-update
   * Bulk update tickets (status, priority, assignee)
   */
  fastify.post<{ Body: { ticket_ids: number[]; updates: UpdateTicketRequest } }>('/tickets/bulk-update', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { ticket_ids, updates } = request.body;

    if (!ticket_ids || !Array.isArray(ticket_ids) || ticket_ids.length === 0) {
      return reply.status(400).send({ error: 'ticket_ids array required' });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'updates object required' });
    }

    try {
      const updatedTickets = [];
      for (const ticketId of ticket_ids) {
        const ticket = updateTicket(ticketId, updates, request.user!);
        updatedTickets.push(ticket);
      }

      return reply.send({
        success: true,
        updated: updatedTickets.length,
        tickets: updatedTickets
      });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * DELETE /tickets/bulk-delete
   * Bulk delete tickets with all associated data
   * Deletes: messages, attachments (DB + files), drafts, tags, email opens
   */
  fastify.delete<{ Body: { ticket_ids: number[] } }>('/tickets/bulk-delete', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { ticket_ids } = request.body;

    if (!ticket_ids || !Array.isArray(ticket_ids) || ticket_ids.length === 0) {
      return reply.status(400).send({ error: 'ticket_ids array required' });
    }

    const user = request.user!;

    // Only admins can delete tickets
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admins can delete tickets' });
    }

    try {
      for (const ticketId of ticket_ids) {
        // Delete physical attachment files
        await deleteTicketAttachments(ticketId);

        // Delete ticket (CASCADE will handle all DB records:
        // messages, attachments, drafts, ticket_tags, email_opens)
        await ticketQueries.delete(ticketId);

        request.log.info(`Deleted ticket #${ticketId} and all associated data`);
      }

      return reply.send({
        success: true,
        deleted: ticket_ids.length
      });
    } catch (error: any) {
      request.log.error(error, 'Failed to bulk delete tickets');
      return reply.status(500).send({ error: 'Failed to delete tickets' });
    }
  });

  /**
   * POST /tickets/:id/reply
   * Reply to ticket
   */
  fastify.post<{
    Params: { id: string };
    Body: ReplyToTicketRequest & {
      uploadedFiles?: Array<{
        filename: string;
        filePath: string;
        size: number;
        mimeType: string;
        cid?: string; // Content-ID for inline images
      }>;
    };
  }>('/tickets/:id/reply', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const replyRequest = request.body;

    if (!replyRequest.body) {
      return reply.status(400).send({ error: 'Reply body required' });
    }

    try {
      // Pass uploaded files to replyToTicket so they can be saved and included in the email
      const message = await replyToTicket(ticketId, replyRequest, request.user!, replyRequest.uploadedFiles);

      return reply.status(201).send(message);
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  /**
   * DELETE /messages/:id
   * Delete a message (only internal notes can be deleted)
   */
  fastify.delete<{ Params: { id: string } }>('/messages/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const messageId = parseInt(request.params.id);

    // Get the message to check if it's internal and belongs to a valid ticket
    const message = await messageQueries.getById(messageId);
    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    // Only allow deleting internal notes
    if (message.type !== 'note') {
      return reply.status(403).send({ error: 'Only internal notes can be deleted' });
    }

    try {
      await messageQueries.deleteById(messageId);

      // Emit SSE event to update all viewers
      sseEmitter.emit('message-deleted', {
        ticketId: message.ticket_id,
        messageId: message.id,
      });

      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ error: error.message || 'Failed to delete message' });
    }
  });

  /**
   * DELETE /messages/:id/scheduled
   * Cancel a scheduled message (only unsent scheduled messages can be cancelled)
   */
  fastify.delete<{ Params: { id: string } }>('/messages/:id/scheduled', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const messageId = parseInt(request.params.id);

    const message = await messageQueries.getById(messageId);
    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    if (!message.scheduled_at || message.sent_at) {
      return reply.status(400).send({ error: 'Message is not a pending scheduled message' });
    }

    const cancelled = await messageQueries.cancelScheduled(messageId);
    if (!cancelled) {
      return reply.status(500).send({ error: 'Failed to cancel scheduled message' });
    }

    return reply.send({ success: true });
  });

  /**
   * POST /messages/:id/forward
   * Forward a message to an email address as a new ticket
   */
  fastify.post<{
    Params: { id: string };
    Body: { to_email: string; comments?: string };
  }>('/messages/:id/forward', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const messageId = parseInt(request.params.id);
    const { to_email, comments } = request.body;

    if (!to_email || !to_email.trim()) {
      return reply.status(400).send({ error: 'to_email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to_email)) {
      return reply.status(400).send({ error: 'Invalid email address' });
    }

    // Get the message to forward
    const message = await messageQueries.getById(messageId);
    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    // Get the original ticket for context
    const originalTicket = await getTicketById(message.ticket_id);
    if (!originalTicket) {
      return reply.status(404).send({ error: 'Original ticket not found' });
    }

    try {
      // Create the ticket using the helper (now supports status and assigneeId options)
      const newTicket = await createTicket(
        {
          subject: `Fwd: ${originalTicket.subject}`,
          customer_email: to_email,
          message_body: '',  // Empty - will add message separately
        },
        request.user!,
        fastify.log,
        {
          status: 'awaiting_customer',
          assigneeId: request.user!.id,  // Assign to forwarder
        }
      );

      // Create the message with forwarded content
      const senderEmail = request.user!.agent_email || config.smtp.from;

      // Build the forwarded email body: [comments] + separator + [quoted original]
      const forwardSeparator = '---------- Forwarded message ----------';

      // Format HTML body
      let htmlBody = '';
      if (comments && comments.trim()) {
        // Add user's comments first
        htmlBody = `<p>${comments.replace(/\n/g, '<br>')}</p><br><br>`;
      }
      // Add separator and quoted original message
      htmlBody += `<p><em>${forwardSeparator}</em></p><blockquote style="border-left: 3px solid #ccc; padding-left: 10px; margin: 10px 0; color: #666;">${message.body_html || message.body.replace(/\n/g, '<br>')}</blockquote>`;

      // Format plain text body
      let plainTextBody = '';
      if (comments && comments.trim()) {
        plainTextBody = `${comments}\n\n`;
      }
      plainTextBody += `${forwardSeparator}\n${message.body}`;

      const newMessageId = await messageQueries.create(
        newTicket.id,
        senderEmail,
        request.user!.name,
        plainTextBody,  // plain text with comments + separator + original
        'email',
        null,  // message_id (will be set after sending)
        htmlBody,  // HTML with comments + separator + original
        null,  // body_html_stripped
        null,  // email_metadata
        null,  // scheduledAt
        [to_email],  // toEmails - the forward recipient
        null   // ccEmails
      );

      // Send the email directly
      const emailMessageId = await sendNewEmail(
        to_email,
        `Fwd: ${originalTicket.subject}`,
        htmlBody,
        request.user!.name,
        request.user!.agent_email
      );

      // Update message with email message ID for threading
      if (emailMessageId) {
        await messageQueries.updateMessageId(emailMessageId, newMessageId);
      }

      fastify.log.info({ messageId, toEmail: to_email, newTicketId: newTicket.id, assignedTo: request.user!.id }, 'Message forwarded as new ticket');

      return reply.status(201).send({ ticket_id: newTicket.id });
    } catch (error: any) {
      fastify.log.error({ error, messageId, toEmail: to_email }, 'Failed to forward message');
      return reply.status(500).send({ error: error.message || 'Failed to forward message' });
    }
  });

  /**
   * POST /tickets/:id/viewing
   * Mark user as viewing ticket (for presence tracking)
   */
  fastify.post<{ Params: { id: string } }>('/tickets/:id/viewing', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const user = request.user!;

    // Emit SSE event
    sseEmitter.emit('viewer-joined', {
      ticketId,
      userEmail: user.email,
      userName: user.name,
    });

    return reply.send({ success: true });
  });

  /**
   * POST /tickets/:id/composing
   * Broadcast that user is composing reply
   */
  fastify.post<{ Params: { id: string } }>('/tickets/:id/composing', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const user = request.user!;

    // Emit SSE event
    sseEmitter.emit('user-composing', {
      ticketId,
      userEmail: user.email,
      userName: user.name,
    });

    return reply.send({ success: true });
  });

  /**
   * GET /tickets/:id/customer-info
   * Fetch additional customer information from external webhook
   */
  fastify.get<{ Params: { id: string } }>('/tickets/:id/customer-info', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    // If not configured, return 404
    if (!config.customerInfoApiUrl) {
      return reply.status(404).send({ error: 'Customer info API not configured' });
    }

    const ticketId = parseInt(request.params.id);
    const ticket = await getTicketById(ticketId);

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    try {
      const response = await fetch(config.customerInfoApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer: {
            email: ticket.customer_email,
            name: ticket.customer_name,
            emails: [ticket.customer_email],
          },
          ticket: {
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            priority: ticket.priority,
            created_at: ticket.created_at,
          },
        }),
      });

      if (!response.ok) {
        request.log.error({ status: response.status }, 'Customer info webhook returned error');
        return reply.status(502).send({ error: 'Failed to fetch customer info from external service' });
      }

      const data = await response.json() as { html?: string };
      return reply.send({ html: data.html || '' });
    } catch (error: any) {
      request.log.error(error, 'Failed to fetch customer info');
      return reply.status(500).send({ error: 'Failed to fetch customer info' });
    }
  });

  /**
   * POST /tickets/:id/generate-response
   * Generate AI response suggestion
   */
  fastify.post<{ Params: { id: string } }>('/tickets/:id/generate-response', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    // If not configured, return 404
    if (!config.aiResponseApiUrl) {
      return reply.status(404).send({ error: 'AI response API not configured' });
    }

    const ticketId = parseInt(request.params.id);
    const ticketWithMessages = await getTicketWithMessages(ticketId);

    if (!ticketWithMessages) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }

    try {
      const response = await fetch(config.aiResponseApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticket: {
            id: ticketWithMessages.id,
            subject: ticketWithMessages.subject,
            customer_email: ticketWithMessages.customer_email,
            customer_name: ticketWithMessages.customer_name,
            status: ticketWithMessages.status,
            priority: ticketWithMessages.priority,
            assignee_id: ticketWithMessages.assignee_id,
            message_id: ticketWithMessages.message_id,
            created_at: ticketWithMessages.created_at,
            updated_at: ticketWithMessages.updated_at,
            customer_ticket_count: ticketWithMessages.customer_ticket_count,
          },
          assignee: ticketWithMessages.assignee ? {
            id: ticketWithMessages.assignee.id,
            email: ticketWithMessages.assignee.email,
            name: ticketWithMessages.assignee.name,
            role: ticketWithMessages.assignee.role,
            signature: ticketWithMessages.assignee.signature,
            agent_email: ticketWithMessages.assignee.agent_email,
            ai_profile: ticketWithMessages.assignee.ai_profile,
          } : null,
          messages: ticketWithMessages.messages.map(msg => ({
            id: msg.id,
            ticket_id: msg.ticket_id,
            sender_email: msg.sender_email,
            sender_name: msg.sender_name,
            body: msg.body,
            body_html: msg.body_html,
            email_metadata: msg.email_metadata,
            type: msg.type,
            message_id: msg.message_id,
            created_at: msg.created_at,
            attachments: msg.attachments,
          })),
        }),
      });

      if (!response.ok) {
        request.log.error({ status: response.status }, 'AI response API returned error');
        return reply.status(502).send({ error: 'Failed to generate AI response' });
      }

      const data = await response.json() as { response?: string; error?: string };

      if (data.error) {
        return reply.status(500).send({ error: data.error });
      }

      return reply.send({ response: data.response || '' });
    } catch (error: any) {
      request.log.error(error, 'Failed to generate AI response');
      return reply.status(500).send({ error: 'Failed to generate AI response' });
    }
  });

  // ============================================================================
  // Draft Routes
  // ============================================================================

  /**
   * GET /tickets/:id/draft
   * Get saved draft for ticket
   */
  fastify.get<{ Params: { id: string } }>('/tickets/:id/draft', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const user = request.user!;

    const draft = await draftQueries.getByTicketAndUser(ticketId, user.id);

    if (!draft) {
      return reply.status(404).send({ error: 'No draft found' });
    }

    return reply.send(draft);
  });

  /**
   * POST /tickets/:id/draft
   * Save draft for ticket
   */
  fastify.post<{ Params: { id: string }; Body: { content: string } }>('/tickets/:id/draft', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const user = request.user!;
    const { content } = request.body;

    if (!content) {
      return reply.status(400).send({ error: 'Content required' });
    }

    await draftQueries.upsert(ticketId, user.id, content);

    return reply.send({ success: true });
  });

  /**
   * DELETE /tickets/:id/draft
   * Delete draft
   */
  fastify.delete<{ Params: { id: string } }>('/tickets/:id/draft', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const user = request.user!;

    await draftQueries.delete(ticketId, user.id);

    return reply.send({ success: true });
  });

  // ============================================================================
  // Canned Response Routes
  // ============================================================================

  /**
   * GET /canned-responses
   * List all canned responses
   */
  fastify.get('/canned-responses', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const responses = await cannedResponseQueries.getAll();
    return reply.send(responses);
  });

  /**
   * POST /canned-responses
   * Create canned response
   */
  fastify.post<{ Body: { title: string; content: string } }>('/canned-responses', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { title, content } = request.body;
    const user = request.user!;

    if (!title || !content) {
      return reply.status(400).send({ error: 'Title and content required' });
    }

    const cannedResponseId = await cannedResponseQueries.create(
      title,
      content,
      user.id
    );

    return reply.status(201).send({ id: cannedResponseId });
  });

  /**
   * PATCH /canned-responses/:id
   * Update canned response
   */
  fastify.patch<{ Params: { id: string }; Body: { title: string; content: string } }>('/canned-responses/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const id = parseInt(request.params.id);
    const { title, content } = request.body;

    if (!title || !content) {
      return reply.status(400).send({ error: 'Title and content required' });
    }

    try {
      await cannedResponseQueries.update(title, content, id);
      return reply.send({ success: true });
    } catch (error: any) {
      request.log.error(error, 'Failed to update canned response');
      return reply.status(500).send({ error: 'Failed to update canned response' });
    }
  });

  /**
   * DELETE /canned-responses/:id
   * Delete canned response
   */
  fastify.delete<{ Params: { id: string } }>('/canned-responses/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const id = parseInt(request.params.id);

    try {
      await cannedResponseQueries.delete(id);
      return reply.send({ success: true });
    } catch (error: any) {
      request.log.error(error, 'Failed to delete canned response');
      return reply.status(500).send({ error: 'Failed to delete canned response' });
    }
  });

  // ============================================================================
  // User Routes
  // ============================================================================

  /**
   * GET /users
   * List all users (agents)
   */
  fastify.get('/users', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const users = await userQueries.getAll();
    return reply.send(sanitizeUsers(users));
  });

  /**
   * POST /users
   * Create new user (admin only)
   */
  fastify.post<{ Body: { email: string; password: string; name: string; role: string } }>('/users', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user!;

    // Check if user is admin
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admins can create users' });
    }

    const { email, password, name, role } = request.body;

    if (!email || !password || !name || !role) {
      return reply.status(400).send({ error: 'Email, password, name, and role are required' });
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return reply.status(409).send({ error: 'User with this email already exists' });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create user
    try {
      const userId = await userQueries.create(email, hash, name, role as UserRole);
      return reply.status(201).send({
        id: userId,
        email,
        name,
        role,
      });
    } catch (error: any) {
      request.log.error(error, 'Failed to create user');
      return reply.status(500).send({ error: 'Failed to create user' });
    }
  });

  /**
   * PATCH /users/:id
   * Update user (admin can update any user, users can update their own profile)
   */
  fastify.patch<{ Params: { id: string }; Body: { email?: string; password?: string; name?: string; role?: string; signature?: string; agent_email?: string; ai_profile?: string; active?: number } }>('/users/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user!;
    const userId = parseInt(request.params.id);
    const { email, password, name, role, signature, agent_email, ai_profile, active } = request.body;

    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Check permissions
    const isAdmin = user.role === 'admin';
    const isOwnProfile = user.id === userId;

    // Users can only update their own profile
    if (!isAdmin && !isOwnProfile) {
      return reply.status(403).send({ error: 'You can only update your own profile' });
    }

    // Non-admins can only update signature and ai_profile on their own profile
    if (!isAdmin && isOwnProfile) {
      if (email || password || name || role || agent_email || active !== undefined) {
        return reply.status(403).send({ error: 'You can only update your signature and AI profile' });
      }
    }

    // Check if email is being changed to one that already exists
    if (email && email !== targetUser.email) {
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        return reply.status(409).send({ error: 'User with this email already exists' });
      }
    }

    // Check if agent_email is being changed to one that already exists
    if (agent_email && agent_email !== targetUser.agent_email) {
      const existingUserWithAgentEmail = await userQueries.getByAgentEmail(agent_email);
      if (existingUserWithAgentEmail) {
        return reply.status(409).send({ error: 'Agent email already in use by another user' });
      }
    }

    try {
      // Update password if provided (admin only)
      if (password && isAdmin) {
        const hash = await bcrypt.hash(password, 10);
        await userQueries.updatePassword(hash, userId);
      }

      // Update other fields
      if (email || name || role || signature !== undefined || agent_email !== undefined || ai_profile !== undefined || active !== undefined) {
        await userQueries.update(
          email || targetUser.email,
          name || targetUser.name,
          (role as UserRole) || targetUser.role,
          signature !== undefined ? signature : targetUser.signature,
          agent_email !== undefined ? agent_email : targetUser.agent_email,
          ai_profile !== undefined ? ai_profile : targetUser.ai_profile,
          active !== undefined ? (typeof active === 'boolean' ? active : Boolean(active)) : (targetUser.active ?? true),
          userId
        );
      }

      const updatedUser = await getUserById(userId);
      return reply.send(sanitizeUser(updatedUser!));
    } catch (error: any) {
      request.log.error(error, 'Failed to update user');
      return reply.status(500).send({ error: 'Failed to update user' });
    }
  });

  /**
   * DELETE /users/:id
   * Delete user (admin only)
   */
  fastify.delete<{ Params: { id: string } }>('/users/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user!;

    // Check if user is admin
    if (user.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admins can delete users' });
    }

    const userId = parseInt(request.params.id);

    // Prevent self-deletion
    if (userId === user.id) {
      return reply.status(400).send({ error: 'Cannot delete your own account' });
    }

    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    try {
      // Unassign all tickets assigned to this user
      await ticketQueries.unassignTicketsByUser(userId);

      // Delete the user
      await userQueries.delete(userId);

      return reply.send({ success: true });
    } catch (error: any) {
      request.log.error(error, 'Failed to delete user');
      return reply.status(500).send({ error: 'Failed to delete user' });
    }
  });

  /**
   * PATCH /me
   * Update current user's own profile
   */
  fastify.patch<{ Body: { name?: string; password?: string; signature?: string; agent_email?: string; ai_profile?: string } }>('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = request.user!;
    const { name, password, signature, agent_email, ai_profile } = request.body;

    const currentUser = await getUserById(user.id);
    if (!currentUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Check if agent_email is being changed to one that already exists
    if (agent_email && agent_email !== currentUser.agent_email) {
      const existingUserWithAgentEmail = await userQueries.getByAgentEmail(agent_email);
      if (existingUserWithAgentEmail) {
        return reply.status(409).send({ error: 'Agent email already in use by another user' });
      }
    }

    try {
      // Update password if provided
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        await userQueries.updatePassword(hash, user.id);
      }

      // Update other fields
      if (name || signature !== undefined || agent_email !== undefined || ai_profile !== undefined) {
        await userQueries.update(
          currentUser.email,  // Email cannot be changed via /me
          name || currentUser.name,
          currentUser.role,  // Role cannot be changed via /me
          signature !== undefined ? signature : currentUser.signature,
          agent_email !== undefined ? agent_email : currentUser.agent_email,
          ai_profile !== undefined ? ai_profile : currentUser.ai_profile,
          currentUser.active,  // Active status cannot be changed via /me
          user.id
        );
      }

      const updatedUser = await getUserById(user.id);
      return reply.send(sanitizeUser(updatedUser!));
    } catch (error: any) {
      request.log.error(error, 'Failed to update profile');
      return reply.status(500).send({ error: 'Failed to update profile' });
    }
  });

  // ============================================================================
  // Utility Routes
  // ============================================================================

  /**
   * POST /send-email
   * Send new outbound email and create ticket
   */
  fastify.post<{ Body: { to: string; subject: string; body: string } }>('/send-email', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { to, subject, body } = request.body;
    const user = request.user!;

    if (!to || !subject || !body) {
      return reply.status(400).send({ error: 'To, subject, and body are required' });
    }

    try {
      // Send email via SMTP
      const messageId = await sendNewEmail(to, subject, body, user.name, user.agent_email);

      // Create ticket for tracking
      const ticket = await createTicket(
        {
          subject,
          customer_email: to,
          customer_name: undefined,
          message_body: body,
        },
        user,
        request.log
      );

      // Update ticket with message_id from sent email and assign to sender
      if (messageId) {
        await ticketQueries.updateMessageId(messageId, ticket.id);
      }
      await ticketQueries.updateAssignee(user.id, ticket.id);
      await ticketQueries.updateStatus('awaiting_customer', ticket.id);

      // Refresh ticket to get updated data
      const updatedTicket = getTicketById(ticket.id);

      return reply.status(201).send({
        success: true,
        ticket: updatedTicket,
        messageId
      });
    } catch (error: any) {
      request.log.error(error, 'Failed to send email');
      return reply.status(500).send({ error: error.message || 'Failed to send email' });
    }
  });

  /**
   * POST /check-emails
   * Manually trigger email check
   */
  fastify.post('/check-emails', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const result = await checkEmailsNow();
    return reply.send({ success: result === 1 });
  });

  /**
   * GET /status
   * Server status
   */
  fastify.get('/status', async (request, reply) => {
    return reply.send({
      status: 'ok',
      sse_clients: getClientCount(),
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================================
  // Attachment Routes
  // ============================================================================

  /**
   * POST /upload
   * Upload attachment file (returns file info for later association with message)
   */
  fastify.post('/upload', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();
      const ticketId = parseInt((data.fields.ticketId as any).value);

      if (!ticketId) {
        return reply.status(400).send({ error: 'Ticket ID required' });
      }

      // Check file type
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

      if (!allowedMimes.includes(data.mimetype)) {
        return reply.status(400).send({ error: `File type ${data.mimetype} not allowed` });
      }

      // Save file to disk
      const filePath = await saveAttachment(
        data.filename,
        buffer,
        ticketId
      );

      // Return file info (will be associated with message when reply is sent)
      return reply.send({
        filename: data.filename,
        size: buffer.length,
        mimeType: data.mimetype,
        filePath,
      });
    } catch (error: any) {
      if (error.statusCode === 413) {
        return reply.status(400).send({ error: 'File too large. Maximum size is 50MB.' });
      }
      request.log.error(error, 'Failed to save file');
      return reply.status(500).send({ error: 'Failed to save file' });
    }
  });

  /**
   * GET /attachments/:id
   * Download or view attachment file
   */
  fastify.get<{ Params: { id: string } }>('/attachments/:id', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const attachmentId = parseInt(request.params.id);

    try {
      // Get attachment from database
      const attachment = await attachmentQueries.getById(attachmentId);

      if (!attachment) {
        return reply.status(404).send({ error: 'Attachment not found' });
      }

      // Read file from storage (local or S3)
      const fileBuffer = await readAttachment(attachment.file_path);

      // Check if file can be viewed in browser (PDFs and images)
      const mimeType = attachment.mime_type || 'application/octet-stream';
      const isViewable = mimeType.startsWith('image/') || mimeType === 'application/pdf';

      // Set headers - use 'inline' for viewable files, 'attachment' for downloads
      reply.header('Content-Type', mimeType);
      reply.header('Content-Disposition',
        isViewable
          ? `inline; filename="${attachment.filename}"`
          : `attachment; filename="${attachment.filename}"`
      );
      reply.header('Content-Length', fileBuffer.length);

      // Send file
      return reply.send(fileBuffer);
    } catch (error: any) {
      request.log.error(error, 'Failed to serve attachment');
      return reply.status(500).send({ error: 'Failed to download attachment' });
    }
  });

  // ============================================================================
  // Tag Routes
  // ============================================================================

  /**
   * GET /api/tags
   * Get all tags
   */
  fastify.get('/tags', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const tags = await tagQueries.getAll();
    return tags;
  });

  /**
   * POST /api/tags
   * Create new tag
   */
  fastify.post<{
    Body: { name: string };
  }>('/tags', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { name } = request.body;

    if (!name) {
      return reply.code(400).send({ error: 'Name required' });
    }

    // Check if tag already exists
    const existing = await tagQueries.getByName(name.trim());
    if (existing) {
      return reply.code(409).send({ error: 'Tag already exists' });
    }

    const tagId = await tagQueries.create(name.trim());
    const tag = await tagQueries.getById(tagId);

    return reply.code(201).send(tag);
  });

  /**
   * DELETE /api/tags/:id
   * Delete tag
   */
  fastify.delete<{
    Params: { id: string };
  }>('/tags/:id', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const tagId = parseInt(request.params.id);

    try {
      await tagQueries.delete(tagId);
      return { success: true };
    } catch (error: any) {
      fastify.log.error(error, 'Failed to delete tag');
      return reply.code(500).send({ error: 'Failed to delete tag' });
    }
  });

  /**
   * GET /api/tickets/:id/tags
   * Get tags for a ticket
   */
  fastify.get<{
    Params: { id: string };
  }>('/tickets/:id/tags', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const tags = await ticketTagQueries.getByTicketId(ticketId);
    return tags;
  });

  /**
   * POST /api/tickets/:id/tags
   * Add tag to ticket (by tag_id or tag_name, creates tag if name doesn't exist)
   */
  fastify.post<{
    Params: { id: string };
    Body: { tag_id?: number; tag_name?: string };
  }>('/tickets/:id/tags', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const { tag_id, tag_name } = request.body;

    if (!tag_id && !tag_name) {
      return reply.code(400).send({ error: 'tag_id or tag_name required' });
    }

    try {
      let resolvedTagId = tag_id;

      // Resolve tag_name to tag_id, creating if necessary
      if (!resolvedTagId && tag_name) {
        const trimmedName = tag_name.trim();
        let tag = await tagQueries.getByName(trimmedName);
        if (!tag) {
          const newTagId = await tagQueries.create(trimmedName);
          tag = await tagQueries.getById(newTagId);
        }
        resolvedTagId = tag!.id;
      }

      await ticketTagQueries.addTagToTicket(ticketId, resolvedTagId!);
      const tags = await ticketTagQueries.getByTicketId(ticketId);

      // Emit SSE event
      sseEmitter.emit('ticket-tags-updated', { ticketId, tags });

      return tags;
    } catch (error: any) {
      fastify.log.error(error, 'Failed to add tag to ticket');
      return reply.code(500).send({ error: 'Failed to add tag' });
    }
  });

  /**
   * DELETE /api/tickets/:id/tags/:tagId
   * Remove tag from ticket
   */
  fastify.delete<{
    Params: { id: string; tagId: string };
  }>('/tickets/:id/tags/:tagId', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const ticketId = parseInt(request.params.id);
    const tagId = parseInt(request.params.tagId);

    try {
      await ticketTagQueries.removeTagFromTicket(ticketId, tagId);
      const tags = await ticketTagQueries.getByTicketId(ticketId);

      // Emit SSE event
      sseEmitter.emit('ticket-tags-updated', { ticketId, tags });

      return tags;
    } catch (error: any) {
      fastify.log.error(error, 'Failed to remove tag from ticket');
      return reply.code(500).send({ error: 'Failed to remove tag' });
    }
  });

  // ============================================================================
  // Email Tracking Route (Public - No Auth Required)
  // ============================================================================

  /**
   * GET /track/:token
   * Email tracking pixel endpoint
   * Returns a 1x1 transparent GIF and logs the email open event
   */
  fastify.get<{ Params: { token: string } }>('/track/:token', async (request, reply) => {
    const { token } = request.params;

    try {
      // Find the message by tracking token using optimized query
      const message = await messageQueries.getByTrackingToken(token);

      if (message) {
        // Log the email open event
        const userAgent = request.headers['user-agent'] || null;
        const ipAddress = request.ip || null;

        try {
          await emailOpenQueries.create(
            message.id,
            token,
            userAgent,
            ipAddress
          );
          request.log.info(`Email opened: message #${message.id} (token: ${token.substring(0, 8)}...)`);
        } catch (error) {
          // Silently fail if already logged (duplicate tracking)
          request.log.debug(error, 'Failed to log email open (possibly duplicate)');
        }
      }
    } catch (error) {
      // Silently fail - don't expose tracking errors to email clients
      request.log.error(error, 'Email tracking error');
    }

    // Always return a 1x1 transparent GIF (even if tracking fails)
    // This prevents broken image icons in emails
    const transparentGif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    return reply
      .code(200)
      .header('Content-Type', 'image/gif')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .send(transparentGif);
  });

  // ============================================================================
  // SSE Route
  // ============================================================================

  /**
   * GET /events
   * Server-Sent Events stream
   */
  fastify.get('/events', {
    onRequest: [fastify.authenticate],
  }, handleSSE);
}
