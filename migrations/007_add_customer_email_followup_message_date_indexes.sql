-- Migration: Indexes for customer aggregation, follow-up calendar and reports
-- Description:
--   - POST /tickets/aggregate matches LOWER(customer_email) = ANY(...): seq scan without this
--   - Calendar / follow-up filters range-scan follow_up_at; only a few tickets have one,
--     so a partial index stays tiny
--   - Reports filter messages by created_at alone; the existing index leads with ticket_id
-- CONCURRENTLY: builds without blocking writes (can't run inside a transaction)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_customer_email_lower
  ON tickets (LOWER(customer_email));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_follow_up_at
  ON tickets (follow_up_at) WHERE follow_up_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_created_at_only
  ON messages (created_at);
