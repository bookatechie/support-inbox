-- Migration: Add trigram indexes for fast ILIKE searches
-- Description: Enables fast ILIKE searches on message body and ticket subject for tracking numbers and other content

-- Enable pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN index using trigram ops for fast ILIKE pattern matching on message body
-- This makes searches like WHERE body ILIKE '%tracking_number%' use an index scan instead of a full table scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_body_trgm_idx ON messages USING GIN (body gin_trgm_ops);

-- Add GIN index for ticket subject searches (order numbers, etc in subject lines)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_subject_trgm ON tickets USING GIN (subject gin_trgm_ops);
