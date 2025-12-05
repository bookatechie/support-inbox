-- Migration: Add trigram index for message body search
-- Description: Enables fast ILIKE searches on message body for tracking numbers and other content

-- Enable pg_trgm extension for trigram-based text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN index using trigram ops for fast ILIKE pattern matching on message body
-- This makes searches like WHERE body ILIKE '%tracking_number%' use an index scan instead of a full table scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_body_trgm_idx ON messages USING GIN (body gin_trgm_ops);
