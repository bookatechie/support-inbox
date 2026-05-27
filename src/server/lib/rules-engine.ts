/**
 * Routing Rules Engine
 * Evaluates ordered routing rules against incoming tickets and applies actions.
 * Supports:
 *  - Multiple condition groups per rule (AND/OR between groups, AND within groups)
 *  - Multiple matching rules in sequence (configurable per-rule stop_processing)
 *  - Multiple webhook follow-up actions per rule
 */

import type {
  Ticket,
  Message,
  Attachment,
  RoutingRule,
  RuleConditionGroup,
  RuleCondition,
  RuleActions,
  RuleEvaluationResult,
} from './types.js';
import {
  routingRuleQueries,
  tagQueries,
  ticketTagQueries,
  ticketQueries,
} from './database-pg.js';
import { sendWebhookFromRule } from './rule-webhook.js';

// Module-level logger
interface Logger {
  info: (objOrMsg: object | string, msg?: string) => void;
  debug: (objOrMsg: object | string, msg?: string) => void;
  error: (objOrMsg: object | string, msg?: string) => void;
}

let engineLogger: Logger | null = null;

export function setRulesEngineLogger(log: Logger): void {
  engineLogger = log;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate routing rules for a newly created ticket.
 * Processes rules in order (sort_order ASC).
 * Each rule can set `stop_processing: true` to halt further evaluation.
 * Applies inline actions immediately, fires webhooks async.
 */
export async function evaluateRulesForTicket(
  ticket: Ticket,
  firstMessage?: Message,
  attachments?: Attachment[],
  context?: {
    toEmails?: string[];
    ccEmails?: string[];
    fromDaemon?: boolean;
  }
): Promise<RuleEvaluationResult[]> {
  const rules = await routingRuleQueries.getActive();
  if (rules.length === 0) {
    return [];
  }

  const results: RuleEvaluationResult[] = [];

  for (const rule of rules) {
    const matched = evaluateRule(rule, ticket, firstMessage, attachments, context);
    if (matched) {
      const audit: string[] = [`Rule '${rule.name}' matched`];
      const actions = rule.actions;

      // Apply inline actions
      const appliedActions = await applyActions(rule.id, actions, ticket, audit);

      // Fire webhooks if configured (fire-and-forget, non-blocking)
      if (actions.webhooks && actions.webhooks.length > 0) {
        for (const wh of actions.webhooks) {
          if (!firstMessage) continue;
          fireWebhook(rule, ticket, firstMessage, wh.url, wh.method || 'POST')
            .catch((err) => {
              engineLogger?.error({ err: err instanceof Error ? err.message : String(err), ruleId: rule.id, webhookUrl: wh.url }, 'Rule webhook failed');
            });
          audit.push(`Webhook fired: ${wh.method || 'POST'} ${wh.url}`);
        }
      }

      results.push({
        matched: true,
        rule,
        actions_applied: appliedActions,
        audit,
      });

      // Respect stop_processing flag (defaults to true for backward compatibility)
      if (rule.stop_processing !== false) {
        engineLogger?.debug({ ruleName: rule.name, ticketId: ticket.id }, 'Stopped rule evaluation (stop_processing)');
        break;
      }
    }
  }

  return results;
}

/**
 * Evaluate all rules without applying — used for dry-run/debugging.
 */
export async function evaluateRulesDryRun(
  ticket: Ticket,
  message: Message,
  attachments?: Attachment[],
  context?: {
    toEmails?: string[];
    ccEmails?: string[];
  }
): Promise<RuleEvaluationResult[]> {
  const rules = await routingRuleQueries.getActive();

  const results: RuleEvaluationResult[] = [];

  for (const rule of rules) {
    const matched = evaluateRule(rule, ticket, message, attachments, context);
    const audit: string[] = matched ? [`Rule '${rule.name}' matched`] : [`Rule '${rule.name}' skipped`];

    if (matched) {
      audit.push(`Actions that would run: ${describeActions(rule.actions)}`);
    }

    results.push({
      matched,
      rule,
      actions_applied: matched ? rule.actions : null,
      audit,
    });

    // Dry-run respects stop_processing to show what production would do
    if (matched && rule.stop_processing !== false) break;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Evaluation Logic
// ---------------------------------------------------------------------------

function evaluateRule(
  rule: RoutingRule,
  ticket: Ticket,
  message?: Message,
  attachments?: Attachment[],
  context?: {
    toEmails?: string[];
    ccEmails?: string[];
  }
): boolean {
  if (!rule.condition_groups || rule.condition_groups.length === 0) {
    return true; // No conditions = always match
  }

  // All groups must match (AND between groups)
  return rule.condition_groups.every((group) =>
    evaluateConditionGroup(group, ticket, message, attachments, context)
  );
}

function evaluateConditionGroup(
  group: RuleConditionGroup,
  ticket: Ticket,
  message?: Message,
  attachments?: Attachment[],
  context?: {
    toEmails?: string[];
    ccEmails?: string[];
  }
): boolean {
  if (!group.conditions || group.conditions.length === 0) {
    return true;
  }

  if (group.combinator === 'or') {
    return group.conditions.some((condition) =>
      evaluateSingleCondition(condition, ticket, message, attachments, context)
    );
  }

  // Default AND
  return group.conditions.every((condition) =>
    evaluateSingleCondition(condition, ticket, message, attachments, context)
  );
}

function evaluateSingleCondition(
  condition: RuleCondition,
  ticket: Ticket,
  message?: Message,
  attachments?: Attachment[],
  context?: {
    toEmails?: string[];
    ccEmails?: string[];
  }
): boolean {
  const value = extractFieldValue(condition.field, ticket, message, attachments, context);
  const expected = condition.value;
  const caseSensitive = condition.case_sensitive ?? false;
  return matchValue(value, expected, condition.operator, caseSensitive);
}

function extractFieldValue(
  field: RuleCondition['field'],
  ticket: Ticket,
  message?: Message,
  attachments?: Attachment[],
  context?: {
    toEmails?: string[];
    ccEmails?: string[];
  }
): string | number | boolean | string[] | null {
  // If no message is available, fields requiring message return null
  const needMessage = field === 'body' || field === 'body_html' || field === 'sender_email' || field === 'to_email' || field === 'attachment_count' || field === 'has_attachments';
  if (needMessage && !message) {
    return null;
  }
  switch (field) {
    case 'subject':
      return ticket.subject;
    case 'body':
      return message!.body;
    case 'body_html':
      return message!.body_html;
    case 'sender_email':
      return message!.sender_email;
    case 'customer_email':
      return ticket.customer_email;
    case 'customer_domain':
      return ticket.customer_email.split('@')[1] || '';
    case 'to_email': {
      // Prefer explicit toEmails from context, then fall back to message
      const ctxTo = context?.toEmails || [];
      const msgTo = message!.to_emails ? (JSON.parse(message!.to_emails) as string[]) : [];
      return [...new Set([...ctxTo, ...msgTo])];
    }
    case 'attachment_count':
      return attachments?.length ?? 0;
    case 'has_attachments':
      return (attachments?.length ?? 0) > 0;
    default:
      return null;
  }
}

function matchValue(
  actual: unknown,
  expected: unknown,
  operator: RuleCondition['operator'],
  caseSensitive: boolean
): boolean {
  const a = normalizeValue(actual);
  const e = normalizeValue(expected);

  switch (operator) {
    case 'equals':
      return compareScalar(a, e, caseSensitive) === 0;
    case 'not_equals':
      return compareScalar(a, e, caseSensitive) !== 0;
    case 'contains':
      return containsValue(a, e, caseSensitive);
    case 'not_contains':
      return !containsValue(a, e, caseSensitive);
    case 'starts_with': {
      const av = stringifyIfArray(a, caseSensitive);
      const ev = String(e);
      return typeof av === 'string' ? av.toLowerCase().startsWith(ev.toLowerCase()) : false;
    }
    case 'ends_with': {
      const av = stringifyIfArray(a, caseSensitive);
      const ev = String(e);
      return typeof av === 'string' ? av.toLowerCase().endsWith(ev.toLowerCase()) : false;
    }
    case 'regex': {
      const av = stringifyIfArray(a, caseSensitive);
      return typeof av === 'string' ? new RegExp(String(e), caseSensitive ? '' : 'i').test(av) : false;
    }
    case 'in':
      return isInSet(a, e, caseSensitive);
    case 'not_in':
      return !isInSet(a, e, caseSensitive);
    default:
      return false;
  }
}

function normalizeValue(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v;
  return String(v);
}

function stringifyIfArray(v: unknown, caseSensitive: boolean): string | unknown {
  if (Array.isArray(v)) {
    return v.join(',');
  }
  return caseSensitive ? v : String(v).toLowerCase();
}

function compareScalar(a: unknown, e: unknown, caseSensitive: boolean): number {
  if (a === null && e === null) return 0;
  if (a === null) return 1;
  if (e === null) return -1;

  if (typeof a === 'boolean' || typeof e === 'boolean') {
    return Number(a) - Number(e);
  }

  if (typeof a === 'number' || typeof e === 'number') {
    return Number(a) - Number(e);
  }

  const sa = String(a);
  const se = String(e);
  return caseSensitive ? sa.localeCompare(se) : sa.toLowerCase().localeCompare(se.toLowerCase());
}

function containsValue(actual: unknown, expected: unknown, caseSensitive: boolean): boolean {
  if (actual === null || expected === null) return false;

  const av = stringifyIfArray(actual, caseSensitive);
  const se = caseSensitive ? String(expected) : String(expected).toLowerCase();

  if (typeof av === 'string') {
    const sa = caseSensitive ? av : av.toLowerCase();
    return sa.includes(se);
  }

  return false;
}

function isInSet(actual: unknown, expectedSet: unknown, caseSensitive: boolean): boolean {
  if (actual === null || expectedSet === null) return false;
  const arr = Array.isArray(expectedSet) ? expectedSet : [expectedSet];
  return arr.some((item) => compareScalar(actual, item, caseSensitive) === 0);
}

// ---------------------------------------------------------------------------
// Actions Application
// ---------------------------------------------------------------------------

async function applyActions(
  ruleId: number,
  actions: RuleActions,
  ticket: Ticket,
  auditLog: string[]
): Promise<Partial<RuleActions>> {
  const applied: Partial<RuleActions> = {};

  if (actions.set_assignee_id !== undefined) {
    await ticketQueries.updateAssignee(actions.set_assignee_id || null, ticket.id);
    auditLog.push(`Set assignee → ${actions.set_assignee_id || 'unassigned'}`);
    applied.set_assignee_id = actions.set_assignee_id;
  }

  if (actions.set_priority) {
    await ticketQueries.updatePriority(actions.set_priority, ticket.id);
    auditLog.push(`Set priority → ${actions.set_priority}`);
    applied.set_priority = actions.set_priority;
  }

  if (actions.set_status) {
    await ticketQueries.updateStatus(actions.set_status, ticket.id);
    auditLog.push(`Set status → ${actions.set_status}`);
    applied.set_status = actions.set_status;
  }

  if (actions.add_tags && actions.add_tags.length > 0) {
    for (const tagName of actions.add_tags) {
      let tag = await tagQueries.getByName(tagName.trim());
      if (!tag) {
        const id = await tagQueries.create(tagName.trim());
        tag = await tagQueries.getById(id);
      }
      if (tag) {
        await ticketTagQueries.addTagToTicket(ticket.id, tag.id);
      }
    }
    auditLog.push(`Added tags: ${actions.add_tags.join(', ')}`);
    applied.add_tags = actions.add_tags;
  }

  if (actions.remove_tags && actions.remove_tags.length > 0) {
    for (const tagName of actions.remove_tags) {
      const tag = await tagQueries.getByName(tagName.trim());
      if (tag) {
        await ticketTagQueries.removeTagFromTicket(ticket.id, tag.id);
      }
    }
    auditLog.push(`Removed tags: ${actions.remove_tags.join(', ')}`);
    applied.remove_tags = actions.remove_tags;
  }

  if (actions.set_follow_up_at !== undefined) {
    await ticketQueries.updateFollowUp(actions.set_follow_up_at || null, ticket.id);
    auditLog.push(`Set follow-up → ${actions.set_follow_up_at || 'cleared'}`);
    applied.set_follow_up_at = actions.set_follow_up_at;
  }

  if (actions.add_internal_note) {
    auditLog.push(`(Skipped internal note — not yet implemented)`);
  }

  engineLogger?.info({ ticketId: ticket.id, ruleId, actions: auditLog.join('; ') }, 'Applied routing rule actions');

  return applied;
}

// ---------------------------------------------------------------------------
// Webhook Delivery
// ---------------------------------------------------------------------------

async function fireWebhook(
  rule: RoutingRule,
  ticket: Ticket,
  message: Message,
  webhookUrl: string,
  method: string
): Promise<void> {
  await sendWebhookFromRule(webhookUrl, method, rule, ticket, message);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describeActions(actions: RuleActions): string {
  const parts: string[] = [];
  if (actions.set_assignee_id !== undefined) parts.push(`assign=${actions.set_assignee_id}`);
  if (actions.set_priority) parts.push(`priority=${actions.set_priority}`);
  if (actions.set_status) parts.push(`status=${actions.set_status}`);
  if (actions.add_tags) parts.push(`+tags=${actions.add_tags.join(',')}`);
  if (actions.remove_tags) parts.push(`-tags=${actions.remove_tags.join(',')}`);
  if (actions.webhooks) parts.push(`webhooks=${actions.webhooks.length}`);
  return parts.join(', ') || 'none';
}
