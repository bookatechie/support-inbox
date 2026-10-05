/**
 * Rule-scoped webhook notifications
 * Fire-and-forget HTTP requests from the routing rules engine.
 */

import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';
import type { Ticket, Message, RoutingRule } from './types.js';

const WEBHOOK_TIMEOUT_MS = 10_000;

// Rule webhook URLs are set by any agent: never let them reach the host, the LAN or cloud metadata
const blockedAddresses = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blockedAddresses.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) {
  blockedAddresses.addSubnet(net, prefix, 'ipv6');
}

function isBlockedAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blockedAddresses.check(mapped[1], 'ipv4');
  return blockedAddresses.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Throw unless the URL is http(s) and every address its host resolves to is public.
 */
async function assertPublicUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Webhook URL must be http(s): ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.some(a => isBlockedAddress(a.address))) {
    throw new Error(`Webhook host ${host} resolves to a private address`);
  }
}

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

  await assertPublicUrl(url);

  const response = await fetch(url, {
    method: method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'SupportInbox/1.0',
    },
    body: JSON.stringify(payload),
    redirect: 'manual', // a redirect could point back at a private address
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
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
