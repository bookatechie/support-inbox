-- Migration: Add routing_rules table for ticket routing engine
-- Description: Enables admins to define ordered rules for auto-assignment, tagging,
--              priority changes, and webhook triggers based on ticket/message patterns.

-- ============================================================================
-- Routing Rules Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS routing_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  condition_groups JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '{}',
  stop_processing BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_routing_rules_sort_order ON routing_rules(sort_order, id);

-- Index for filtering active rules
CREATE INDEX IF NOT EXISTS idx_routing_rules_active ON routing_rules(active) WHERE active = TRUE;

-- ============================================================================
-- Trigger to auto-update updated_at on rule changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_routing_rule_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS routing_rules_timestamp_update ON routing_rules;
CREATE TRIGGER routing_rules_timestamp_update
  BEFORE UPDATE ON routing_rules
  FOR EACH ROW EXECUTE FUNCTION update_routing_rule_timestamp();
