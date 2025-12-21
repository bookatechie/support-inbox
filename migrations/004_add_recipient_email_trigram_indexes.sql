-- Migration: Add trigram indexes for to_emails and cc_emails
-- Purpose: Speed up ILIKE searches on recipient email fields

-- Index for to_emails field (recipient addresses)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_to_emails_trgm
ON messages USING gin (to_emails gin_trgm_ops);

-- Index for cc_emails field (CC addresses)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_cc_emails_trgm
ON messages USING gin (cc_emails gin_trgm_ops);
