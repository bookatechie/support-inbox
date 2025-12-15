/**
 * PostgreSQL database setup and typed query helpers
 * Replacement for SQLite database (database.ts)
 */

import pg from 'pg';
import bcrypt from 'bcrypt';
import { config } from './config.js';

// Configure pg to parse TIMESTAMP WITHOUT TIME ZONE as UTC
// By default, pg parses timestamps in the server's local timezone
// This ensures all timestamps are treated as UTC
pg.types.setTypeParser(1114, (str) => new Date(str + 'Z'));

import type {
  Ticket,
  Message,
  Attachment,
  User,
  CannedResponse,
  Draft,
  Tag,
  TicketStatus,
  TicketPriority,
  UserRole,
  TicketHistoryEntry,
  TicketHistoryCreateRequest,
} from './types.js';

// ============================================================================
// PostgreSQL Pool Configuration
// ============================================================================

const PG_CONFIG: pg.PoolConfig = {
  user: process.env.POSTGRES_USER || 'doadmin',
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'defaultdb',
  ssl: process.env.POSTGRES_SSL === 'require' ? { rejectUnauthorized: false } : false,
  max: 3, // Reduced from 5 to conserve memory on low-RAM server
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // 30 seconds (increased from 2 seconds)
  query_timeout: 30000, // Reduced to 30 seconds - fail fast on slow queries
  statement_timeout: 30000, // PostgreSQL statement timeout
};

// Create connection pool
export const pool = new pg.Pool(PG_CONFIG);

// Set timezone to UTC for all connections
pool.on('connect', (client) => {
  client.query('SET timezone = "UTC"').catch((err) => {
    console.error('Failed to set timezone to UTC:', err);
  });
});

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Failed to connect to PostgreSQL:', err);
  } else {
    console.log('✅ Connected to PostgreSQL at', res.rows[0].now);
  }
});

// ============================================================================
// Helper: Execute Query
// ============================================================================

async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function queryOne<T = any>(text: string, params?: any[]): Promise<T | undefined> {
  const result = await pool.query(text, params);
  return result.rows[0] as T | undefined;
}

async function execute(text: string, params?: any[]): Promise<void> {
  await pool.query(text, params);
}

// ============================================================================
// Typed Query Helpers (matching SQLite interface)
// ============================================================================

export const ticketQueries = {
  async getAll(): Promise<(Ticket & { message_count: number; last_message_preview: string | null; attachment_count: number; last_message_sender_email: string | null; last_message_sender_name: string | null; last_message_at: string | null })[]> {
    return query(`
      SELECT
        tickets.*,
        COALESCE(msg_count.message_count, 0) as message_count,
        last_msg.last_message_preview,
        COALESCE(att_stats.attachment_count, 0) as attachment_count,
        last_msg.last_message_sender_email,
        last_msg.last_message_sender_name,
        last_msg.last_message_at
      FROM tickets
      LEFT JOIN (
        SELECT ticket_id, COUNT(*) as message_count
        FROM messages
        GROUP BY ticket_id
      ) msg_count ON msg_count.ticket_id = tickets.id
      LEFT JOIN (
        SELECT DISTINCT ON (messages.ticket_id)
          messages.ticket_id,
          SUBSTR(messages.body, 1, 250) as last_message_preview,
          messages.sender_email as last_message_sender_email,
          messages.sender_name as last_message_sender_name,
          messages.created_at as last_message_at
        FROM messages
        ORDER BY messages.ticket_id, messages.created_at DESC
      ) last_msg ON last_msg.ticket_id = tickets.id
      LEFT JOIN (
        SELECT messages.ticket_id, COUNT(*) as attachment_count
        FROM attachments
        INNER JOIN messages ON attachments.message_id = messages.id
        GROUP BY messages.ticket_id
      ) att_stats ON att_stats.ticket_id = tickets.id
      ORDER BY COALESCE(last_msg.last_message_at, tickets.updated_at) DESC
    `);
  },

  async getById(id: number): Promise<Ticket | undefined> {
    return queryOne<Ticket>('SELECT * FROM tickets WHERE id = $1', [id]);
  },

  async getByMessageId(messageId: string): Promise<Ticket | undefined> {
    return queryOne<Ticket>('SELECT * FROM tickets WHERE message_id = $1', [messageId]);
  },

  async create(subject: string, customerEmail: string, customerName: string | null, replyToEmail: string | null, messageId: string | null, status: TicketStatus, priority: TicketPriority, assigneeId: number | null): Promise<number> {
    const result = await queryOne<{ id: number }>(
      `INSERT INTO tickets (subject, customer_email, customer_name, reply_to_email, message_id, status, priority, assignee_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [subject, customerEmail, customerName, replyToEmail, messageId, status, priority, assigneeId]
    );
    return result!.id;
  },

  async updateStatus(status: TicketStatus, id: number): Promise<void> {
    await execute('UPDATE tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
  },

  async updatePriority(priority: TicketPriority, id: number): Promise<void> {
    await execute('UPDATE tickets SET priority = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [priority, id]);
  },

  async updateAssignee(assigneeId: number | null, id: number): Promise<void> {
    await execute('UPDATE tickets SET assignee_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [assigneeId, id]);
  },

  async updateCustomerEmail(email: string, id: number): Promise<void> {
    await execute('UPDATE tickets SET customer_email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [email, id]);
  },

  async updateCustomerName(name: string | null, id: number): Promise<void> {
    await execute('UPDATE tickets SET customer_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [name, id]);
  },

  async unassignTicketsByUser(userId: number): Promise<void> {
    await execute('UPDATE tickets SET assignee_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE assignee_id = $1', [userId]);
  },

  async updateMessageId(messageId: string, id: number): Promise<void> {
    await execute('UPDATE tickets SET message_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [messageId, id]);
  },

  async updateFollowUp(followUpAt: string | null, id: number): Promise<void> {
    await execute('UPDATE tickets SET follow_up_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [followUpAt, id]);
  },

  async getByFollowUpDateRange(startDate: string, endDate: string): Promise<Ticket[]> {
    return query<Ticket>(
      `SELECT * FROM tickets
       WHERE follow_up_at >= $1 AND follow_up_at < $2
       ORDER BY follow_up_at ASC`,
      [startDate, endDate]
    );
  },

  async getWithFollowUps(): Promise<Ticket[]> {
    return query<Ticket>(
      `SELECT * FROM tickets
       WHERE follow_up_at IS NOT NULL
       ORDER BY follow_up_at ASC`
    );
  },

  async search(searchQuery: string): Promise<Ticket[]> {
    return query<Ticket>(
      `SELECT tickets.*
       FROM tickets
       WHERE search_vector @@ plainto_tsquery('english', $1)
       ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC`,
      [searchQuery]
    );
  },

  async getByStatus(status: TicketStatus): Promise<Ticket[]> {
    return query<Ticket>('SELECT * FROM tickets WHERE status = $1 ORDER BY created_at DESC', [status]);
  },

  async getByAssignee(assigneeId: number): Promise<Ticket[]> {
    return query<Ticket>('SELECT * FROM tickets WHERE assignee_id = $1 ORDER BY created_at DESC', [assigneeId]);
  },

  async getUnassigned(): Promise<Ticket[]> {
    return query<Ticket>('SELECT * FROM tickets WHERE assignee_id IS NULL ORDER BY created_at DESC');
  },

  async countByCustomerEmail(email: string): Promise<number> {
    const result = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM tickets WHERE customer_email = $1', [email]);
    return result?.count || 0;
  },

  async delete(id: number): Promise<void> {
    await execute('DELETE FROM tickets WHERE id = $1', [id]);
  },

  async getDistinctCustomerEmails(search?: string): Promise<{ email: string }[]> {
    if (search && search.length > 0) {
      // Filter by search term with ILIKE for case-insensitive matching
      return query<{ email: string }>(
        'SELECT DISTINCT customer_email as email FROM tickets WHERE customer_email IS NOT NULL AND customer_email ILIKE $1 ORDER BY customer_email LIMIT 50',
        [`%${search}%`]
      );
    }
    // Return empty array when no search term (don't fetch all emails)
    return [];
  },

  async searchWithFilters(
    searchTerm: string,
    options: {
      status?: string[];
      assigneeId?: number | null;
      customerEmail?: string;
      tagId?: number;
      limit?: number;
      offset?: number;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<(Ticket & { message_count: number; last_message_preview: string | null; attachment_count: number; last_message_sender_email: string | null; last_message_sender_name: string | null; last_message_at: string | null; total_count: number })[]> {
    const { status, assigneeId, customerEmail, tagId, limit = 50, offset = 0, sortOrder = 'desc' } = options;

    // Build WHERE clause for filters
    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build JOIN clause for tag filtering
    let tagJoin = '';
    if (tagId !== undefined) {
      tagJoin = 'INNER JOIN ticket_tags ON tickets.id = ticket_tags.ticket_id';
      whereClauses.push(`ticket_tags.tag_id = $${paramIndex++}`);
      params.push(tagId);
    }

    if (status && status.length > 0) {
      whereClauses.push(`tickets.status = ANY($${paramIndex++})`);
      params.push(status);
    }

    if (assigneeId !== undefined) {
      if (assigneeId === null) {
        whereClauses.push('tickets.assignee_id IS NULL');
      } else {
        whereClauses.push(`tickets.assignee_id = $${paramIndex++}`);
        params.push(assigneeId);
      }
    }

    if (customerEmail) {
      whereClauses.push(`tickets.customer_email = $${paramIndex++}`);
      params.push(customerEmail);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sortDirection = sortOrder.toUpperCase();

    // Empty search term - return all tickets matching filters
    if (!searchTerm) {
      // Use getTicketsFiltered for non-search queries
      return this.getTicketsFilteredWithoutSearch(options);
    }

    // Check if search term is a number (ticket ID search)
    // Must be within PostgreSQL INTEGER range (max 2,147,483,647)
    const ticketIdNum = parseInt(searchTerm, 10);
    const isNumericSearch = !isNaN(ticketIdNum) && ticketIdNum.toString() === searchTerm && ticketIdNum <= 2147483647;

    // Simplified PostgreSQL full-text search with 3 strategies:
    // 1. Exact ticket ID match (highest priority)
    // 2. Full-text search via tsvector (tickets + messages combined)
    // 3. Fallback ILIKE search (emails, tags, message-IDs)
    const searchQueryText = `
      WITH search_tickets_raw AS (
        -- Strategy 1: Direct ticket ID match (rank: 100)
        SELECT id, 100 as rank FROM tickets
        WHERE id = $${paramIndex + 1} AND $${paramIndex + 1} != 0

        UNION

        -- Strategy 2: Full-text search across tickets and messages (rank: 80-90)
        SELECT DISTINCT ticket_id as id, ts_rank(search_vector, plainto_tsquery('english', $${paramIndex})) * 90 as rank
        FROM (
          SELECT id as ticket_id, search_vector FROM tickets
          UNION ALL
          SELECT ticket_id, search_vector FROM messages
        ) combined_search
        WHERE search_vector @@ plainto_tsquery('english', $${paramIndex})

        UNION

        -- Strategy 3: Fallback pattern matching for emails, subject, tags, message-IDs (rank: 50-70)
        SELECT DISTINCT id, 70 as rank FROM tickets
        WHERE customer_email ILIKE $${paramIndex + 2} OR subject ILIKE $${paramIndex + 2} OR message_id ILIKE $${paramIndex + 2}

        UNION

        SELECT DISTINCT ticket_id as id, 65 as rank FROM messages
        WHERE sender_email ILIKE $${paramIndex + 2}

        UNION

        -- Strategy 4: Message body search (uses trigram index for fast ILIKE)
        SELECT DISTINCT ticket_id as id, 60 as rank FROM messages
        WHERE body ILIKE $${paramIndex + 2}

        UNION

        SELECT DISTINCT ticket_tags.ticket_id as id, 50 as rank
        FROM tags
        JOIN ticket_tags ON tags.id = ticket_tags.tag_id
        WHERE tags.name ILIKE $${paramIndex + 2}
      ),
      search_tickets AS (
        -- Deduplicate by ticket ID, taking the highest rank
        SELECT id, MAX(rank) as rank
        FROM search_tickets_raw
        GROUP BY id
      ),
      filtered_tickets AS (
        SELECT tickets.*, search_tickets.rank
        FROM tickets
        INNER JOIN search_tickets ON tickets.id = search_tickets.id
        ${tagJoin}
        ${whereClause}
      ),
      total_count_cte AS (
        SELECT COUNT(*) as total_count FROM filtered_tickets
      ),
      paginated_tickets AS (
        SELECT filtered_tickets.*, (SELECT total_count FROM total_count_cte) as total_count
        FROM filtered_tickets
        ORDER BY COALESCE(filtered_tickets.last_message_at, filtered_tickets.created_at) ${sortDirection}
        LIMIT $${paramIndex + 3} OFFSET $${paramIndex + 4}
      )
      SELECT
        paginated_tickets.*,
        COALESCE(msg_count.message_count, 0) as message_count,
        last_msg.last_message_preview,
        COALESCE(att_stats.attachment_count, 0) as attachment_count,
        last_msg.last_message_sender_email,
        last_msg.last_message_sender_name
      FROM paginated_tickets
      LEFT JOIN (
        SELECT messages.ticket_id, COUNT(*) as message_count
        FROM messages
        INNER JOIN paginated_tickets ON messages.ticket_id = paginated_tickets.id
        GROUP BY messages.ticket_id
      ) msg_count ON msg_count.ticket_id = paginated_tickets.id
      LEFT JOIN (
        SELECT DISTINCT ON (messages.ticket_id)
          messages.ticket_id,
          SUBSTR(messages.body, 1, 250) as last_message_preview,
          messages.sender_email as last_message_sender_email,
          messages.sender_name as last_message_sender_name,
          messages.created_at as last_message_at
        FROM messages
        INNER JOIN paginated_tickets ON messages.ticket_id = paginated_tickets.id
        ORDER BY messages.ticket_id, messages.created_at DESC
      ) last_msg ON last_msg.ticket_id = paginated_tickets.id
      LEFT JOIN (
        SELECT messages.ticket_id, COUNT(*) as attachment_count
        FROM attachments
        INNER JOIN messages ON attachments.message_id = messages.id
        INNER JOIN paginated_tickets ON messages.ticket_id = paginated_tickets.id
        GROUP BY messages.ticket_id
      ) att_stats ON att_stats.ticket_id = paginated_tickets.id
      ORDER BY COALESCE(paginated_tickets.last_message_at, paginated_tickets.created_at) ${sortDirection}
    `;

    // Build params array
    const searchParams = [
      ...params,
      searchTerm,                         // $paramIndex: FTS search term
      isNumericSearch ? ticketIdNum : 0,  // $paramIndex+1: Ticket ID (0 if not numeric)
      `%${searchTerm}%`,                  // $paramIndex+2: LIKE pattern for fallback searches
      limit,                              // $paramIndex+3
      offset                              // $paramIndex+4
    ];

    return query<any>(searchQueryText, searchParams);
  },

  // Helper method: Get tickets with filters but no search (called when searchTerm is empty)
  async getTicketsFilteredWithoutSearch(
    options: {
      status?: string[];
      assigneeId?: number | null;
      customerEmail?: string;
      tagId?: number;
      limit?: number;
      offset?: number;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<(Ticket & { message_count: number; last_message_preview: string | null; attachment_count: number; last_message_sender_email: string | null; last_message_sender_name: string | null; last_message_at: string | null; total_count: number })[]> {
    // Delegate to getTicketsFiltered which already handles this case
    return getTicketsFiltered(options);
  },

};

export const messageQueries = {
  async getAll(): Promise<Message[]> {
    return query<Message>('SELECT * FROM messages ORDER BY created_at ASC');
  },

  async getById(id: number): Promise<Message | undefined> {
    return queryOne<Message>('SELECT * FROM messages WHERE id = $1', [id]);
  },

  async getByTicketId(ticketId: number): Promise<Message[]> {
    return query<Message>('SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC', [ticketId]);
  },

  async create(ticketId: number, senderEmail: string, senderName: string | null, body: string, type: string, messageId: string | null, bodyHtml: string | null, bodyHtmlStripped: string | null, emailMetadata: string | null, scheduledAt: string | null = null, toEmails: string[] | null = null, ccEmails: string[] | null = null): Promise<number> {
    const result = await queryOne<{ id: number }>(
      `INSERT INTO messages (ticket_id, sender_email, sender_name, body, type, message_id, body_html, body_html_stripped, email_metadata, scheduled_at, to_emails, cc_emails)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [ticketId, senderEmail, senderName, body, type, messageId, bodyHtml, bodyHtmlStripped, emailMetadata, scheduledAt, toEmails ? JSON.stringify(toEmails) : null, ccEmails ? JSON.stringify(ccEmails) : null]
    );
    return result!.id;
  },

  async getByEmailMessageId(messageId: string): Promise<Message | undefined> {
    return queryOne<Message>('SELECT * FROM messages WHERE message_id = $1 LIMIT 1', [messageId]);
  },

  async getLatestByTicket(ticketId: number): Promise<Message | undefined> {
    return queryOne<Message>('SELECT * FROM messages WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1', [ticketId]);
  },

  async deleteByTicketId(ticketId: number): Promise<void> {
    await execute('DELETE FROM messages WHERE ticket_id = $1', [ticketId]);
  },

  async deleteById(id: number): Promise<void> {
    await execute('DELETE FROM messages WHERE id = $1', [id]);
  },

  async updateTrackingToken(token: string, id: number): Promise<void> {
    await execute('UPDATE messages SET tracking_token = $1 WHERE id = $2', [token, id]);
  },

  async getByTrackingToken(token: string): Promise<Message | undefined> {
    return queryOne<Message>('SELECT * FROM messages WHERE tracking_token = $1 LIMIT 1', [token]);
  },

  async updateMessageId(messageId: string, id: number): Promise<void> {
    await execute('UPDATE messages SET message_id = $1 WHERE id = $2', [messageId, id]);
  },

  async updateSentAt(sentAt: string, id: number): Promise<void> {
    await execute('UPDATE messages SET sent_at = $1 WHERE id = $2', [sentAt, id]);
  },

  async getScheduledDue(): Promise<Message[]> {
    return query<Message>(
      `SELECT * FROM messages
       WHERE scheduled_at IS NOT NULL
       AND sent_at IS NULL
       AND scheduled_at <= CURRENT_TIMESTAMP
       ORDER BY scheduled_at ASC`
    );
  },

  async getScheduledByTicketId(ticketId: number): Promise<Message[]> {
    return query<Message>(
      `SELECT * FROM messages
       WHERE ticket_id = $1
       AND scheduled_at IS NOT NULL
       AND sent_at IS NULL
       ORDER BY scheduled_at ASC`,
      [ticketId]
    );
  },

  async cancelScheduled(id: number): Promise<boolean> {
    const result = await queryOne<{ id: number }>(
      `DELETE FROM messages
       WHERE id = $1
       AND scheduled_at IS NOT NULL
       AND sent_at IS NULL
       RETURNING id`,
      [id]
    );
    return result !== undefined;
  },
};

export const emailOpenQueries = {
  async create(messageId: number, trackingToken: string, userAgent: string | null, ipAddress: string | null): Promise<number> {
    const result = await queryOne<{ id: number }>(
      'INSERT INTO email_opens (message_id, tracking_token, user_agent, ip_address) VALUES ($1, $2, $3, $4) RETURNING id',
      [messageId, trackingToken, userAgent, ipAddress]
    );
    return result!.id;
  },

  async getByMessageId(messageId: number): Promise<any[]> {
    return query('SELECT * FROM email_opens WHERE message_id = $1 ORDER BY opened_at ASC', [messageId]);
  },

  async getByTrackingToken(token: string): Promise<any[]> {
    return query('SELECT * FROM email_opens WHERE tracking_token = $1 ORDER BY opened_at ASC', [token]);
  },

  async getFirstOpenByMessageId(messageId: number): Promise<any | undefined> {
    return queryOne('SELECT * FROM email_opens WHERE message_id = $1 ORDER BY opened_at ASC LIMIT 1', [messageId]);
  },
};

export const attachmentQueries = {
  async getByMessageId(messageId: number): Promise<Attachment[]> {
    return query<Attachment>('SELECT * FROM attachments WHERE message_id = $1 ORDER BY created_at ASC', [messageId]);
  },

  async create(messageId: number, filename: string, filePath: string, sizeBytes: number | null, mimeType: string | null): Promise<number> {
    const result = await queryOne<{ id: number }>(
      'INSERT INTO attachments (message_id, filename, file_path, size_bytes, mime_type) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [messageId, filename, filePath, sizeBytes, mimeType]
    );
    return result!.id;
  },

  async getById(id: number): Promise<Attachment | undefined> {
    return queryOne<Attachment>('SELECT * FROM attachments WHERE id = $1', [id]);
  },
};

export const userQueries = {
  async getAll(): Promise<User[]> {
    return query<User>('SELECT * FROM users ORDER BY created_at DESC');
  },

  async getActive(): Promise<User[]> {
    return query<User>('SELECT * FROM users WHERE active = TRUE ORDER BY name ASC');
  },

  async getById(id: number): Promise<User | undefined> {
    return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
  },

  async getByEmail(email: string): Promise<User | undefined> {
    return queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
  },

  async getByAgentEmail(agentEmail: string): Promise<User | undefined> {
    return queryOne<User>('SELECT * FROM users WHERE agent_email = $1', [agentEmail]);
  },

  async create(email: string, passwordHash: string, name: string, role: UserRole): Promise<number> {
    const result = await queryOne<{ id: number }>(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, passwordHash, name, role]
    );
    return result!.id;
  },

  async update(email: string, name: string, role: UserRole, signature: string | null, agentEmail: string | null, aiProfile: string | null, active: boolean, id: number): Promise<void> {
    await execute(
      'UPDATE users SET email = $1, name = $2, role = $3, signature = $4, agent_email = $5, ai_profile = $6, active = $7 WHERE id = $8',
      [email, name, role, signature, agentEmail, aiProfile, active, id]
    );
  },

  async updatePassword(passwordHash: string, id: number): Promise<void> {
    await execute('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  },

  async delete(id: number): Promise<void> {
    await execute('DELETE FROM users WHERE id = $1', [id]);
  },

  async getDistinctAgentEmails(search?: string): Promise<{ email: string }[]> {
    if (search && search.length > 0) {
      // Filter by search term with ILIKE for case-insensitive matching
      return query<{ email: string }>(
        'SELECT DISTINCT agent_email as email FROM users WHERE agent_email IS NOT NULL AND agent_email ILIKE $1 ORDER BY agent_email LIMIT 50',
        [`%${search}%`]
      );
    }
    // Return empty array when no search term (don't fetch all emails)
    return [];
  },
};

export const cannedResponseQueries = {
  async getAll(): Promise<CannedResponse[]> {
    return query<CannedResponse>('SELECT * FROM canned_responses ORDER BY title ASC');
  },

  async getById(id: number): Promise<CannedResponse | undefined> {
    return queryOne<CannedResponse>('SELECT * FROM canned_responses WHERE id = $1', [id]);
  },

  async create(title: string, content: string, createdBy: number | null): Promise<number> {
    const result = await queryOne<{ id: number }>(
      'INSERT INTO canned_responses (title, content, created_by) VALUES ($1, $2, $3) RETURNING id',
      [title, content, createdBy]
    );
    return result!.id;
  },

  async update(title: string, content: string, id: number): Promise<void> {
    await execute('UPDATE canned_responses SET title = $1, content = $2 WHERE id = $3', [title, content, id]);
  },

  async delete(id: number): Promise<void> {
    await execute('DELETE FROM canned_responses WHERE id = $1', [id]);
  },
};

export const draftQueries = {
  async getByTicketAndUser(ticketId: number, userId: number): Promise<Draft | undefined> {
    return queryOne<Draft>('SELECT * FROM drafts WHERE ticket_id = $1 AND user_id = $2', [ticketId, userId]);
  },

  async upsert(ticketId: number, userId: number, content: string): Promise<void> {
    await execute(
      `INSERT INTO drafts (ticket_id, user_id, content, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (ticket_id, user_id)
       DO UPDATE SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP`,
      [ticketId, userId, content]
    );
  },

  async delete(ticketId: number, userId: number): Promise<void> {
    await execute('DELETE FROM drafts WHERE ticket_id = $1 AND user_id = $2', [ticketId, userId]);
  },
};

export const tagQueries = {
  async getAll(): Promise<Tag[]> {
    return query<Tag>('SELECT * FROM tags ORDER BY name');
  },

  async getById(id: number): Promise<Tag | undefined> {
    return queryOne<Tag>('SELECT * FROM tags WHERE id = $1', [id]);
  },

  async getByName(name: string): Promise<Tag | undefined> {
    return queryOne<Tag>('SELECT * FROM tags WHERE name = $1', [name]);
  },

  async create(name: string): Promise<number> {
    const result = await queryOne<{ id: number }>('INSERT INTO tags (name) VALUES ($1) RETURNING id', [name]);
    return result!.id;
  },

  async delete(id: number): Promise<void> {
    await execute('DELETE FROM tags WHERE id = $1', [id]);
  },
};

export const ticketTagQueries = {
  async getByTicketId(ticketId: number): Promise<Tag[]> {
    return query<Tag>(
      `SELECT tags.* FROM tags
       INNER JOIN ticket_tags ON tags.id = ticket_tags.tag_id
       WHERE ticket_tags.ticket_id = $1
       ORDER BY tags.name`,
      [ticketId]
    );
  },

  async addTagToTicket(ticketId: number, tagId: number): Promise<void> {
    await execute('INSERT INTO ticket_tags (ticket_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ticketId, tagId]);
  },

  async removeTagFromTicket(ticketId: number, tagId: number): Promise<void> {
    await execute('DELETE FROM ticket_tags WHERE ticket_id = $1 AND tag_id = $2', [ticketId, tagId]);
  },

  async getTicketsByTagId(tagId: number): Promise<{ ticket_id: number }[]> {
    return query<{ ticket_id: number }>('SELECT ticket_id FROM ticket_tags WHERE tag_id = $1', [tagId]);
  },

  async deleteByTicketId(ticketId: number): Promise<void> {
    await execute('DELETE FROM ticket_tags WHERE ticket_id = $1', [ticketId]);
  },

  async bulkGetByTicketIds(ticketIds: number[]): Promise<{ ticket_id: number; id: number; name: string; created_at: string }[]> {
    if (ticketIds.length === 0) {
      return [];
    }
    return query<{ ticket_id: number; id: number; name: string; created_at: string }>(
      `SELECT ticket_tags.ticket_id, tags.id, tags.name, tags.created_at
       FROM ticket_tags
       INNER JOIN tags ON tags.id = ticket_tags.tag_id
       WHERE ticket_tags.ticket_id = ANY($1)
       ORDER BY tags.name`,
      [ticketIds]
    );
  },
};

export const ticketHistoryQueries = {
  /**
   * Create a new history entry
   */
  async create(entry: TicketHistoryCreateRequest): Promise<TicketHistoryEntry> {
    const result = await queryOne<TicketHistoryEntry>(
      `INSERT INTO ticket_history
       (ticket_id, field_name, old_value, new_value, changed_by_user_id,
        changed_by_email, changed_by_name, change_source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        entry.ticket_id,
        entry.field_name,
        entry.old_value,
        entry.new_value,
        entry.changed_by_user_id,
        entry.changed_by_email,
        entry.changed_by_name,
        entry.change_source || 'manual',
        entry.notes || null,
      ]
    );
    return result!;
  },

  /**
   * Get full history for a ticket (ordered by most recent first)
   */
  async getByTicketId(ticketId: number): Promise<TicketHistoryEntry[]> {
    return query<TicketHistoryEntry>(
      `SELECT * FROM ticket_history
       WHERE ticket_id = $1
       ORDER BY changed_at DESC`,
      [ticketId]
    );
  },

  /**
   * Get history filtered by field name
   */
  async getByTicketAndField(
    ticketId: number,
    fieldName: string
  ): Promise<TicketHistoryEntry[]> {
    return query<TicketHistoryEntry>(
      `SELECT * FROM ticket_history
       WHERE ticket_id = $1 AND field_name = $2
       ORDER BY changed_at DESC`,
      [ticketId, fieldName]
    );
  },

  /**
   * Get recent changes across all tickets (admin audit log)
   */
  async getRecent(limit: number = 100): Promise<TicketHistoryEntry[]> {
    return query<TicketHistoryEntry>(
      `SELECT * FROM ticket_history
       ORDER BY changed_at DESC
       LIMIT $1`,
      [limit]
    );
  },

  /**
   * Get all changes by a specific user
   */
  async getByUser(userId: number, limit: number = 100): Promise<TicketHistoryEntry[]> {
    return query<TicketHistoryEntry>(
      `SELECT * FROM ticket_history
       WHERE changed_by_user_id = $1
       ORDER BY changed_at DESC
       LIMIT $2`,
      [userId, limit]
    );
  },

  /**
   * Count total history entries for a ticket
   */
  async countByTicket(ticketId: number): Promise<number> {
    const result = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM ticket_history WHERE ticket_id = $1',
      [ticketId]
    );
    return result?.count || 0;
  },
};

// ============================================================================
// Helper Functions (matching SQLite interface)
// ============================================================================

export async function getAllTickets(): Promise<(Ticket & { message_count: number; last_message_preview: string | null; attachment_count: number; last_message_sender_email: string | null; last_message_sender_name: string | null; last_message_at: string | null; tags?: Tag[] })[]> {
  const tickets = await ticketQueries.getAll();

  // Batch load all tags for all tickets in one query
  const allTicketTags = await query<{ ticket_id: number; id: number; name: string; created_at: string }>(
    `SELECT ticket_tags.ticket_id, tags.id, tags.name, tags.created_at
     FROM ticket_tags
     INNER JOIN tags ON tags.id = ticket_tags.tag_id
     ORDER BY tags.name`
  );

  // Group tags by ticket_id
  const tagsByTicketId = new Map<number, Tag[]>();
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

  // Add tags to each ticket
  return tickets.map(ticket => ({
    ...ticket,
    tags: tagsByTicketId.get(ticket.id) || [],
  }));
}

export async function getTicketsFiltered(options: {
  status?: string[];
  assigneeId?: number | null;
  customerEmail?: string;
  tagId?: number;
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
}): Promise<(Ticket & { message_count: number; last_message_preview: string | null; attachment_count: number; last_message_sender_email: string | null; last_message_sender_name: string | null; last_message_at: string | null; total_count: number; tags?: Tag[] })[]> {
  const { status, assigneeId, customerEmail, tagId, limit = 50, offset = 0, sortOrder = 'desc' } = options;

  // Build WHERE clause
  const whereClauses: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Build JOIN clause for tag filtering
  let tagJoin = '';
  if (tagId !== undefined) {
    tagJoin = 'INNER JOIN ticket_tags ON tickets.id = ticket_tags.ticket_id';
    whereClauses.push(`ticket_tags.tag_id = $${paramIndex++}`);
    params.push(tagId);
  }

  if (status && status.length > 0) {
    whereClauses.push(`tickets.status = ANY($${paramIndex++})`);
    params.push(status);
  }

  if (assigneeId !== undefined) {
    if (assigneeId === null) {
      whereClauses.push('tickets.assignee_id IS NULL');
    } else {
      whereClauses.push(`tickets.assignee_id = $${paramIndex++}`);
      params.push(assigneeId);
    }
  }

  if (customerEmail) {
    whereClauses.push(`tickets.customer_email = $${paramIndex++}`);
    params.push(customerEmail);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Add limit and offset
  params.push(limit, offset);
  const limitOffsetClause = `LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

  const sortDirection = sortOrder.toUpperCase();

  const queryText = `
    WITH filtered_tickets AS (
      SELECT DISTINCT tickets.*
      FROM tickets
      ${tagJoin}
      ${whereClause}
    ),
    total_count_cte AS (
      SELECT COUNT(*) as total_count FROM filtered_tickets
    ),
    paginated_tickets AS (
      SELECT filtered_tickets.*, (SELECT total_count FROM total_count_cte) as total_count
      FROM filtered_tickets
      ORDER BY filtered_tickets.updated_at ${sortDirection}
      ${limitOffsetClause}
    )
    SELECT
      paginated_tickets.*,
      COALESCE(msg_count.message_count, 0) as message_count,
      last_msg.last_message_preview,
      COALESCE(att_stats.attachment_count, 0) as attachment_count,
      last_msg.last_message_sender_email,
      last_msg.last_message_sender_name,
      last_msg.last_message_at
    FROM paginated_tickets
    LEFT JOIN (
      SELECT messages.ticket_id, COUNT(*) as message_count
      FROM messages
      INNER JOIN paginated_tickets ON messages.ticket_id = paginated_tickets.id
      GROUP BY messages.ticket_id
    ) msg_count ON msg_count.ticket_id = paginated_tickets.id
    LEFT JOIN (
      SELECT DISTINCT ON (messages.ticket_id)
        messages.ticket_id,
        SUBSTR(messages.body, 1, 250) as last_message_preview,
        messages.sender_email as last_message_sender_email,
        messages.sender_name as last_message_sender_name,
        messages.created_at as last_message_at
      FROM messages
      INNER JOIN paginated_tickets ON messages.ticket_id = paginated_tickets.id
      ORDER BY messages.ticket_id, messages.created_at DESC
    ) last_msg ON last_msg.ticket_id = paginated_tickets.id
    LEFT JOIN (
      SELECT messages.ticket_id, COUNT(*) as attachment_count
      FROM attachments
      INNER JOIN messages ON attachments.message_id = messages.id
      INNER JOIN paginated_tickets ON messages.ticket_id = paginated_tickets.id
      GROUP BY messages.ticket_id
    ) att_stats ON att_stats.ticket_id = paginated_tickets.id
    ORDER BY COALESCE(last_msg.last_message_at, paginated_tickets.created_at) ${sortDirection}
  `;

  const tickets = await query<any>(queryText, params);

  if (tickets.length === 0) {
    return [];
  }

  // Batch load tags only for returned tickets
  const ticketIds = tickets.map(t => t.id);
  const allTicketTags = await query<{ ticket_id: number; id: number; name: string; created_at: string }>(
    `SELECT ticket_tags.ticket_id, tags.id, tags.name, tags.created_at
     FROM ticket_tags
     INNER JOIN tags ON tags.id = ticket_tags.tag_id
     WHERE ticket_tags.ticket_id = ANY($1)
     ORDER BY tags.name`,
    [ticketIds]
  );

  // Group tags by ticket_id
  const tagsByTicketId = new Map<number, Tag[]>();
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

  // Add tags to each ticket
  return tickets.map(ticket => ({
    ...ticket,
    tags: tagsByTicketId.get(ticket.id) || [],
  }));
}

export async function countTicketsFiltered(options: {
  status?: string[];
  assigneeId?: number | null;
  customerEmail?: string;
  tagId?: number;
}): Promise<number> {
  const { status, assigneeId, customerEmail, tagId } = options;

  // Build WHERE clause
  const whereClauses: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Build JOIN clause for tag filtering
  let tagJoin = '';
  if (tagId !== undefined) {
    tagJoin = 'INNER JOIN ticket_tags ON tickets.id = ticket_tags.ticket_id';
    whereClauses.push(`ticket_tags.tag_id = $${paramIndex++}`);
    params.push(tagId);
  }

  if (status && status.length > 0) {
    whereClauses.push(`tickets.status = ANY($${paramIndex++})`);
    params.push(status);
  }

  if (assigneeId !== undefined) {
    if (assigneeId === null) {
      whereClauses.push('tickets.assignee_id IS NULL');
    } else {
      whereClauses.push(`tickets.assignee_id = $${paramIndex++}`);
      params.push(assigneeId);
    }
  }

  if (customerEmail) {
    whereClauses.push(`tickets.customer_email = $${paramIndex++}`);
    params.push(customerEmail);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const result = await queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT tickets.id) as count
     FROM tickets
     ${tagJoin}
     ${whereClause}`,
    params
  );

  return result?.count || 0;
}

export async function getTicketById(id: number): Promise<Ticket | undefined> {
  return ticketQueries.getById(id);
}

export async function getMessagesByTicketId(ticketId: number): Promise<Message[]> {
  return messageQueries.getByTicketId(ticketId);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  return userQueries.getByEmail(email);
}

export async function getUserById(id: number): Promise<User | undefined> {
  return userQueries.getById(id);
}

// Initialize with default admin user if none exists, or sync existing admin with .env
export async function ensureDefaultUser(): Promise<void> {
  const users = await userQueries.getAll();

  if (users.length === 0) {
    // Create default admin from environment configuration
    const hash = bcrypt.hashSync(config.defaultAdminPassword, 10);
    await userQueries.create(
      config.defaultAdminEmail,
      hash,
      config.defaultAdminName,
      'admin'
    );
    console.log(`✓ Created default admin user: ${config.defaultAdminEmail}`);
    if (config.defaultAdminEmail === 'admin@example.com' || config.defaultAdminPassword === 'admin123') {
      console.log('⚠️  Using default credentials! Set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in .env for production.');
    }
  } else {
    // Sync the first user (ID=1, the default admin) with .env configuration
    const defaultAdmin = await getUserById(1);
    if (defaultAdmin) {
      const updates: string[] = [];

      // Check if email needs updating
      if (defaultAdmin.email !== config.defaultAdminEmail) {
        updates.push(`email: "${defaultAdmin.email}" → "${config.defaultAdminEmail}"`);
      }

      // Check if name needs updating
      if (defaultAdmin.name !== config.defaultAdminName) {
        updates.push(`name: "${defaultAdmin.name}" → "${config.defaultAdminName}"`);
      }

      // Check if password needs updating
      const passwordMatches = bcrypt.compareSync(config.defaultAdminPassword, defaultAdmin.password_hash);
      if (!passwordMatches) {
        updates.push('password');
      }

      // Update if there are changes
      if (updates.length > 0) {
        const newPasswordHash = bcrypt.hashSync(config.defaultAdminPassword, 10);
        await userQueries.update(
          config.defaultAdminEmail,
          config.defaultAdminName,
          defaultAdmin.role,
          defaultAdmin.signature || null,
          defaultAdmin.agent_email || null,
          defaultAdmin.ai_profile || null,
          defaultAdmin.active ?? true,
          defaultAdmin.id
        );
        await userQueries.updatePassword(newPasswordHash, defaultAdmin.id);
        console.log(`✓ Updated default admin user (ID=1): ${updates.join(', ')}`);
      }
    }
  }
}

// Clean up on exit
process.on('exit', () => {
  pool.end();
});
