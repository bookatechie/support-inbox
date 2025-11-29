-- Migration: Initial Schema
-- Description: Creates all tables, indexes, triggers, and extensions for Support Inbox
-- Run this on a fresh PostgreSQL database to set up the complete schema

-- ============================================================================
-- Extensions
-- ============================================================================

-- Enable trigram extension for fuzzy text search (ILIKE optimization)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Tables
-- ============================================================================

-- Users table: Agent accounts with roles
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'agent' CHECK (role IN ('agent', 'admin')),
  signature TEXT,
  agent_email TEXT,
  ai_profile TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Unique index on agent_email (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_agent_email ON users(agent_email) WHERE agent_email IS NOT NULL;

-- Add comment for active column
COMMENT ON COLUMN users.active IS 'TRUE = active, FALSE = inactive';

-- Tickets table: Support tickets with status, priority, assignee
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  reply_to_email TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'open', 'awaiting_customer', 'resolved')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message_id TEXT,
  last_message_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  search_vector TSVECTOR,
  follow_up_at TIMESTAMP WITHOUT TIME ZONE
);

-- Add comments for denormalized/computed columns
COMMENT ON COLUMN tickets.last_message_at IS 'Denormalized field for sorting performance - maintained by triggers. PostgreSQL can compute this efficiently, but denormalization provides better performance for high-traffic ticket lists.';
COMMENT ON COLUMN tickets.search_vector IS 'Full-text search index - automatically maintained by triggers';

-- Tickets indexes
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_email);
CREATE INDEX IF NOT EXISTS idx_tickets_message_id ON tickets(message_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_last_message_at ON tickets(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_search ON tickets USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_email_trgm ON tickets USING GIN(customer_email gin_trgm_ops);
-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tickets_status_updated ON tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee_updated ON tickets(assignee_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_assignee ON tickets(status, assignee_id, updated_at DESC);

-- Messages table: Threaded messages (customer, agent, internal notes)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  body TEXT NOT NULL,
  body_html TEXT,
  body_html_stripped TEXT,
  email_metadata TEXT,
  type TEXT DEFAULT 'email' CHECK (type IN ('email', 'note', 'sms', 'chat', 'phone', 'system')),
  tracking_token TEXT,
  message_id TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  search_vector TSVECTOR,
  scheduled_at TIMESTAMP WITHOUT TIME ZONE,
  sent_at TIMESTAMP WITHOUT TIME ZONE
);

-- Add comments for computed columns
COMMENT ON COLUMN messages.body_html_stripped IS 'HTML content with tags stripped. Improves search quality by removing HTML noise. PostgreSQL can index HTML directly, but plain text provides better search results.';
COMMENT ON COLUMN messages.email_metadata IS 'JSON metadata (subject, to, cc, bcc, headers)';
COMMENT ON COLUMN messages.search_vector IS 'Full-text search index - automatically maintained by triggers';

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_email ON messages(sender_email);
CREATE INDEX IF NOT EXISTS idx_messages_search ON messages USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_messages_sender_email_trgm ON messages USING GIN(sender_email gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_tracking_token ON messages(tracking_token) WHERE tracking_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON messages(scheduled_at) WHERE scheduled_at IS NOT NULL AND sent_at IS NULL;

-- Attachments table: File attachments linked to messages
CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size_bytes INTEGER,
  mime_type TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Attachments indexes
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

-- Tags table: Tagging system
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ticket tags junction table
CREATE TABLE IF NOT EXISTS ticket_tags (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, tag_id)
);

-- Ticket tags indexes
CREATE INDEX IF NOT EXISTS idx_ticket_tags_ticket ON ticket_tags(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_tag ON ticket_tags(tag_id);

-- Canned responses table: Template responses
CREATE TABLE IF NOT EXISTS canned_responses (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Drafts table: Auto-saved reply drafts
CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ticket_id, user_id)
);

-- Email opens table: Email open tracking
CREATE TABLE IF NOT EXISTS email_opens (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tracking_token TEXT NOT NULL,
  opened_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address TEXT
);

-- Email opens indexes
CREATE INDEX IF NOT EXISTS idx_email_opens_message ON email_opens(message_id);
CREATE INDEX IF NOT EXISTS idx_email_opens_token ON email_opens(tracking_token);

-- Ticket history table: Audit trail for ticket changes
CREATE TABLE IF NOT EXISTS ticket_history (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_by_email TEXT NOT NULL,
  changed_by_name TEXT,
  changed_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  change_source VARCHAR(20) DEFAULT 'manual',
  notes TEXT
);

-- Add comments for ticket_history columns
COMMENT ON TABLE ticket_history IS 'Audit trail for all ticket field changes including status, priority, and assignee updates';
COMMENT ON COLUMN ticket_history.field_name IS 'Name of the field that was changed (e.g., status, priority, assignee_id)';
COMMENT ON COLUMN ticket_history.old_value IS 'Previous value before the change (stringified)';
COMMENT ON COLUMN ticket_history.new_value IS 'New value after the change (stringified)';
COMMENT ON COLUMN ticket_history.changed_by_email IS 'Email of user who made the change (denormalized for audit trail)';
COMMENT ON COLUMN ticket_history.change_source IS 'Source of the change: manual (UI), automation (system), api (external), email_reply (auto-assignment)';

-- Ticket history indexes
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_changed_at ON ticket_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_ticket_history_changed_by ON ticket_history(changed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_field_name ON ticket_history(field_name);

-- ============================================================================
-- Trigger Functions
-- ============================================================================

-- Function to update ticket search vector on insert/update
CREATE OR REPLACE FUNCTION update_ticket_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.customer_email, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.customer_name, '')), 'C');
  RETURN NEW;
END;
$$;

-- Function to update message search vector on insert/update
CREATE OR REPLACE FUNCTION update_message_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.body, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.body_html_stripped, NEW.body_html, '')), 'B');
  RETURN NEW;
END;
$$;

-- Function to update ticket last_message_at on message insert
CREATE OR REPLACE FUNCTION update_ticket_last_message_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tickets
  SET last_message_at = NEW.created_at
  WHERE id = NEW.ticket_id
    AND (last_message_at IS NULL OR NEW.created_at > last_message_at);
  RETURN NEW;
END;
$$;

-- Function to update ticket last_message_at on message delete
CREATE OR REPLACE FUNCTION update_ticket_last_message_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tickets
  SET last_message_at = (
    SELECT MAX(created_at)
    FROM messages
    WHERE ticket_id = OLD.ticket_id
  )
  WHERE id = OLD.ticket_id;
  RETURN OLD;
END;
$$;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Trigger for ticket search vector
DROP TRIGGER IF EXISTS tickets_search_vector_update ON tickets;
CREATE TRIGGER tickets_search_vector_update
  BEFORE INSERT OR UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_ticket_search_vector();

-- Trigger for message search vector
DROP TRIGGER IF EXISTS messages_search_vector_update ON messages;
CREATE TRIGGER messages_search_vector_update
  BEFORE INSERT OR UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_message_search_vector();

-- Trigger for updating last_message_at on insert
DROP TRIGGER IF EXISTS update_ticket_last_message_insert ON messages;
CREATE TRIGGER update_ticket_last_message_insert
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_ticket_last_message_insert();

-- Trigger for updating last_message_at on delete
DROP TRIGGER IF EXISTS update_ticket_last_message_delete ON messages;
CREATE TRIGGER update_ticket_last_message_delete
  AFTER DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_ticket_last_message_delete();
