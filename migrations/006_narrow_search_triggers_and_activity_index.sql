-- Migration: Only rebuild search vectors when searched columns change; index inbox sort
-- Description:
--   The search_vector triggers fired on every UPDATE, so writes like tracking_token,
--   sent_at, message_id (messages) and last_message_at, status (tickets) re-ran
--   to_tsvector over the whole body. Restrict them to the columns they index.
--   Then index the inbox's sort key, COALESCE(last_message_at, created_at).

BEGIN;

DROP TRIGGER IF EXISTS messages_search_vector_update ON messages;
CREATE TRIGGER messages_search_vector_update
  BEFORE INSERT OR UPDATE OF body, body_html, body_html_stripped ON messages
  FOR EACH ROW EXECUTE FUNCTION update_message_search_vector();

DROP TRIGGER IF EXISTS tickets_search_vector_update ON tickets;
CREATE TRIGGER tickets_search_vector_update
  BEFORE INSERT OR UPDATE OF subject, customer_email, customer_name ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_ticket_search_vector();

COMMIT;

-- Outside the transaction: CONCURRENTLY doesn't block writes while it builds
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_last_activity
  ON tickets ((COALESCE(last_message_at, created_at)) DESC, id DESC);
