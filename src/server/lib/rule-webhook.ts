/**
 * Rule-scoped webhook notifications
 * Fire-and-forget HTTP requests from the routing rules engine.
 */

import type { Ticket, Message, RoutingRule } from './types.js';

interface Logger {
  info: (objOrMsg: object | string, msg?: string) => void;
  error: (objOrMsg: object | string, msg?: string) => void;
}

let moduleLogger: Logger | null = null;

export function setRuleWebhookLogger(log: Logger): void {
  moduleLogger = log;
}

export interface RuleWebhookPayload {
  event: 'rule_triggered';
  rule: {
    id: number;
    name: string;
  };
  ticket: {
    id: number;
    subject: string;
    customer_email: string;
    customer_name: string | null;
    status: string;
    priority: string;
    assignee_id: number | null;
    created_at: string;
    updated_at: string;
  };
  message: {
    id: number | null;
    sender_email: string;
    sender_name: string | null;
    body: string | null;
    body_html: string | null;
    type: string;
    created_at: string | null;
  };
}

/**
 * Send webhook notification triggered by a routing rule (fire-and-forget).
 */
export async function sendWebhookFromRule(
  url: string,
  method: string,
  rule: RoutingRule,
  ticket: Ticket,
  message: Message
): Promise<void> {
  const payload: RuleWebhookPayload = {
    event: 'rule_triggered',
    rule: {
      id: rule.id,
      name: rule.name,
    },
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      customer_email: ticket.customer_email,
      customer_name: ticket.customer_name,
      status: ticket.status,
      priority: ticket.priority,
      assignee_id: ticket.assignee_id,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    },
    message: {
      id: message.id || null,
      sender_email: message.sender_email,
      sender_name: message.sender_name,
      body: message.body || null,
      body_html: message.body_html || null,
      type: message.type,
      created_at: message.created_at || null,
    },
  };

  const response = await fetch(url, {
    method: method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'SupportInbox/1.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    moduleLogger?.error(
      { status: response.status, statusText: response.statusText, ticketId: ticket.id, ruleId: rule.id },
      'Rule webhook failed'
    );
    throw new Error(`Webhook returned ${response.status} ${response.statusText}`);
  }

  moduleLogger?.info(
    { ticketId: ticket.id, ruleId: rule.id, event: 'rule_triggered' },
    'Rule webhook sent'
  );
}
