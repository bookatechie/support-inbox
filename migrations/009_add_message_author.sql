-- Migration: Record which signed-in user wrote each message
-- Description:
--   - messages.author_user_id: the user whose session created the message (agent replies,
--     notes, new tickets, forwards). NULL for inbound email. Requests made with the internal
--     API key run as the default admin user, so automations are attributed to that user,
--     never to the agent they send as (from_email). sender_email alone can't tell those apart.
--   - Backfill for the last 180 days is a best-effort estimate: a message from an agent's
--     address is credited to that agent, except a ticket's first message created within
--     10 seconds of the ticket itself (how automations create tickets through the API).
--     Agents composing a brand-new ticket in the app look the same and are left NULL too.
--     Rows written after this migration are exact.

BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_author_created
  ON messages(author_user_id, created_at)
  WHERE author_user_id IS NOT NULL;

UPDATE messages m
SET author_user_id = (
  SELECT u.id FROM users u
  WHERE lower(trim(COALESCE(substring(m.sender_email from '<([^>]+)>'), m.sender_email)))
        IN (lower(u.agent_email), lower(u.email))
  ORDER BY u.id
  LIMIT 1
)
FROM tickets t
WHERE t.id = m.ticket_id
  AND m.author_user_id IS NULL
  AND m.created_at >= CURRENT_TIMESTAMP - interval '180 days'
  AND NOT (
    m.created_at - t.created_at < interval '10 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM messages p
      WHERE p.ticket_id = m.ticket_id
        AND (p.created_at < m.created_at OR (p.created_at = m.created_at AND p.id < m.id))
    )
  );

COMMIT;
