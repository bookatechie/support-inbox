-- Migration: Add ticket_history table for audit tracking
-- Description: Tracks all changes to ticket status, priority, assignee, and other fields
-- Author: Claude Code
-- Date: 2025-11-16

CREATE TABLE IF NOT EXISTS ticket_history (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,

  -- What changed
  field_name VARCHAR(50) NOT NULL,  -- 'status', 'priority', 'assignee_id', 'customer_email', 'customer_name'
  old_value TEXT,                   -- Previous value (stringified, NULL if newly set)
  new_value TEXT,                   -- New value (stringified, NULL if cleared)

  -- Who made the change
  changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_by_email TEXT NOT NULL,   -- Denormalized for deleted users
  changed_by_name TEXT,             -- User's display name at time of change

  -- When it happened
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Optional context
  change_source VARCHAR(20) DEFAULT 'manual',  -- 'manual', 'automation', 'api', 'email_reply'
  notes TEXT                                    -- Optional reason/context for the change
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_changed_at ON ticket_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_ticket_history_changed_by ON ticket_history(changed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_field_name ON ticket_history(field_name);

-- Comment for documentation
COMMENT ON TABLE ticket_history IS 'Audit trail for all ticket field changes including status, priority, and assignee updates';
COMMENT ON COLUMN ticket_history.field_name IS 'Name of the field that was changed (e.g., status, priority, assignee_id)';
COMMENT ON COLUMN ticket_history.old_value IS 'Previous value before the change (stringified)';
COMMENT ON COLUMN ticket_history.new_value IS 'New value after the change (stringified)';
COMMENT ON COLUMN ticket_history.changed_by_email IS 'Email of user who made the change (denormalized for audit trail)';
COMMENT ON COLUMN ticket_history.change_source IS 'Source of the change: manual (UI), automation (system), api (external), email_reply (auto-assignment)';
