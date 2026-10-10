-- Migration: Per-agent read state for the inbox's unread (bold) tickets
-- Description:
--   - ticket_reads: when each user last opened each ticket
--   - users.unread_since: customer emails older than this never count as unread for that user,
--     so existing tickets don't all show as unread when this ships (and a new agent starts
--     with a clean inbox). ADD COLUMN ... DEFAULT now() gives every existing user the
--     migration time.
-- A ticket is unread for a user when it has a customer email (type 'email', not from one of
-- our addresses) newer than both their last read of it and their unread_since.

BEGIN;

CREATE TABLE IF NOT EXISTS ticket_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_reads_ticket ON ticket_reads(ticket_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS unread_since TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

COMMIT;
