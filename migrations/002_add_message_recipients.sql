-- Migration: Add recipient columns to messages
-- Description: Store to/cc email addresses directly on messages for audit trail

-- Add to_emails and cc_emails columns (JSON arrays stored as TEXT)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS to_emails TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS cc_emails TEXT;

-- Add comments
COMMENT ON COLUMN messages.to_emails IS 'JSON array of To recipient email addresses';
COMMENT ON COLUMN messages.cc_emails IS 'JSON array of CC recipient email addresses';
