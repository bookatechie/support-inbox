# Support Inbox — Workflow Documentation

This document describes all major system workflows, their triggers, decision points, and data flows.

---

## 1. Incoming Email Processing

**Trigger:** IMAP poll (`email-daemon.ts`) every 2 minutes.

**Flow:**

```
IMAP poll → Parse email → Deduplicate (Message-ID) → Skip auto-generated
  → Threading check (In-Reply-To / References)
    → Match found?     → Add message to existing ticket
    → No match?        → Create new ticket
```

### 1.1 New Ticket Creation

When an email is **not** a reply to an existing thread:

1. **Extract TO/CC addresses** from parsed email
2. **Auto-assign by `agent_email`** — check if any TO/CC address matches a user's `agent_email` field
   - First match wins
   - Example: `agent@company.com` → assigned to that agent
3. **Create ticket** with `status: 'new'`, `priority: 'normal'`
4. **Run Routing Rules Engine** — evaluate all active rules in `sort_order` ASC
   - Rules check ticket fields + first message fields
   - Actions applied inline: assign, priority, status, tags, follow-up, webhooks
   - Each matched rule creates a `ticket_history` entry (actor: "Routing Rule", source: `automation`)
   - `stop_processing: true` (default) halts further rule evaluation
5. **Save attachments** — HEIC→JPEG conversion if needed
6. **Store `email_metadata`** JSON: subject, to, cc, inReplyTo, references, headers
7. **Emit SSE** `new-ticket` event
8. **Fire webhook** `new_ticket` (if `WEBHOOK_URL` configured)

### 1.2 Reply to Existing Ticket

When `In-Reply-To` or `References` matches a known ticket:

1. **Add message** to existing ticket
2. **Status transition:** `awaiting_customer` or `resolved` → `open`
3. **Save attachments**
4. **Store TO/CC** on message record + email_metadata
5. **Emit SSE** `new-message` + `ticket-update`
6. **Fire webhook** `customer_reply`

---

## 2. Routing Rules Engine

**Location:** `src/server/lib/rules-engine.ts`

**Purpose:** Deterministic, zero-cost (no LLM tokens) rule evaluation for ticket auto-processing.

### 2.1 Rule Evaluation Order

Rules are evaluated **sequentially** by `sort_order` (lowest first).

```
for each active rule (sort_order ASC):
  evaluate condition_groups → match?
    yes → apply actions, log history, fire webhooks
    stop_processing=true? → break
    stop_processing=false? → continue to next rule
```

### 2.2 Condition Groups

Each rule has **1+ condition groups**. Groups are combined with **AND**. Inside each group, conditions use the group's `combinator` (`and` or `or`).

**Available fields:**
- `subject` — ticket subject
- `body` — message plain text body
- `body_html` — message HTML body
- `sender_email` — message sender
- `customer_email` — ticket customer_email
- `customer_domain` — domain extracted from customer_email
- `to_email` — TO addresses from message
- `attachment_count` — numeric
- `has_attachments` — boolean

**Operators:** `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `regex`, `in`, `not_in`

### 2.3 Actions

| Action | Effect | History Log |
|--------|--------|-------------|
| `set_assignee_id` | Assign ticket to user | `assignee_id: old → new` |
| `set_priority` | Change priority | `priority: old → new` |
| `set_status` | Change status | `status: old → new` |
| `add_tags` | Create tags if needed, link to ticket | `tags: null → +tag1, tag2` |
| `remove_tags` | Unlink tags from ticket | `tags: null → -tag1, tag2` |
| `set_follow_up_at` | Set/clear follow-up date | `follow_up_at: old → new` |
| `webhooks` | Fire 1+ HTTP requests (async) | Not logged in history |

**History format:**
- `changed_by_name`: `"Routing Rule"`
- `changed_by_email`: `"system"`
- `change_source`: `"automation"`
- `notes`: `"Applied by rule: {rule_name} (id:{rule_id})"`

### 2.4 Example Rules

| Sort | Name | Conditions | Actions | Stop |
|------|------|-----------|---------|------|
| 1 | Auto-assign to agent | `to_email contains "agent@company.com"` OR `sender_email equals "agent@company.com"` | `set_assignee_id: {agent_id}` | Yes |
| 2 | External tracking emails → Agent | `sender_email = "external@example.com"` AND `subject contains "Your Order Shipped Today"` | `set_assignee_id: {agent_id}` | Yes |

---

## 3. Webhook System

**Location:** `src/server/lib/webhook.ts`

Webhooks are **fire-and-forget** HTTP POSTs to `WEBHOOK_URL` (configured in `.env`).

### 3.1 Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `new_ticket` | New ticket created | Full ticket + first message + attachments |
| `customer_reply` | Customer reply added to ticket | Ticket + new message + attachments |
| `new_reply` | Any reply added (agent note, scheduled, email) | Ticket + message (includes `message.type`) |
| `ticket_update` | Ticket metadata changed | Ticket + `changes` object (old→new per field) |

### 3.2 Payload Structure

All payloads include:
```json
{
  "event": "new_ticket",
  "ticket": { ... },
  "message": { ... },
  "attachments": [ ... ]
}
```

### 3.3 n8n Integration

The configured `WEBHOOK_URL` points to an n8n webhook node. Current n8n workflows consuming box webhooks:

| Workflow | Active | Handles |
|----------|--------|---------|
| KOVI - Support Inbox Router | Yes | Vision Inventory ingestion (MySQL) |
| KOVI - Support Inbox Draft Email | Yes | AI draft email generation |

**Note:** Assignment logic previously handled in n8n has been migrated to the box routing rules engine.

---

## 4. Agent Reply Flow

**Trigger:** `POST /tickets/:id/reply`

### 4.1 Email Reply

1. Append agent's **signature** to HTML body
2. **Auto-assign** if ticket unassigned and not scheduled → assign to replying agent
3. Create message record
4. Save attachments
5. Generate **tracking token** for email open tracking
6. Retrieve threading info (all Message-IDs for ticket)
7. **Send via SMTP**
   - First message: `sendNewEmail` (no threading headers)
   - Reply: `sendReplyEmail` (In-Reply-To + References)
8. Extract real Message-ID from SES response, store in DB
9. **Update status to `resolved`**
10. Emit SSE `new-message` + `ticket-update`
11. Fire webhook `new_reply`

### 4.2 Internal Note

1. Create message with `type='note'`
2. `to_emails = null`, `cc_emails = null`
3. No email sent, no status change
4. Emit SSE `new-message` + `ticket-update`
5. Fire webhook `new_reply`

### 4.3 Scheduled Reply

1. Store `scheduled_at` timestamp on message
2. No email sent immediately
3. Emit SSE `new-message` + `ticket-update`
4. Fire webhook `new_reply` (includes `scheduled_at`)
5. Later: cron-like worker picks up due messages and sends them

---

## 5. Ticket Update Flow

**Trigger:** `PATCH /tickets/:id`

**Audited fields:**
- `status` — transitions: new ↔ open ↔ awaiting_customer ↔ resolved
- `priority` — low / normal / high / urgent
- `assignee_id` — can also resolve via `assignee_email`
- `customer_email`, `customer_name`
- `follow_up_at` — ISO 8601 timestamp or null

**Flow:**
1. Detect which fields changed
2. Update DB
3. **Log each change** to `ticket_history` (old_value → new_value)
4. Emit SSE `ticket-update`
5. Fire webhook `ticket_update` with `changes` object

---

## 6. n8n Workflows (External)

**n8n Instance:** See production ops file (not in repo).

### 6.1 Active Workflows

| Workflow | Purpose |
|----------|---------|
| KOVI - Support Inbox Router | Receives `new_ticket` webhook; handles Vision Inventory file ingestion to MySQL |
| KOVI - Support Inbox Draft Email | Receives ticket data; generates AI draft email responses |
| KOVI - Support Inbox User Info | Provides customer info enrichment |
| KOVI - New Order Hook | Order system integration |
| KOVI - New Lead Hook | Lead capture integration |
| KOVI - Klaviyo API | Email marketing integration |
| KOVI - Abandoned Cart | Cart recovery flows |
| KOVI - Web Chat API | Chat widget backend |
| MCP - KOVI Web Chat | MCP-enabled chat interface |

### 6.2 Migrated Logic

Logic previously in n8n that now lives in box:

| Logic | Old Location | New Location |
|-------|-------------|--------------|
| External tracking email → assign agent | n8n filter + HTTP request node | Box routing rule engine |
| Agent email auto-assign | n8n HTTP request node | `email-daemon.ts` `findAssigneeByEmail()` |

---

## 7. Server-Sent Events (SSE)

**Endpoint:** `GET /events`

Clients connect via EventSource for real-time updates.

| Event | Payload | When |
|-------|---------|------|
| `new-ticket` | Ticket object | New ticket created |
| `ticket-update` | Ticket object | Metadata changed |
| `new-message` | `{ ticketId, message }` | Message added |
| `message-deleted` | `{ ticketId, messageId }` | Message removed |
| `viewer-joined` | `{ ticketId, userEmail, userName }` | Agent opens ticket detail |
| `viewer-left` | `{ ticketId, userEmail }` | Agent closes/leaves ticket |
| `user-composing` | `{ ticketId, userEmail, userName }` | Agent starts typing |
| `heartbeat` | `{}` | Every 30s keepalive |

---

## 8. Data Retention & Storage

- **Tickets / Messages:** Permanent (PostgreSQL)
- **Attachments:** Files on disk; DB records link to paths
- **Email History:** Permanent (Message-ID deduplication)
- **Audit Trail:** `ticket_history` logs all field changes permanently
- **Routing Rules:** Configurable via admin UI; hard DELETE only (no soft delete)
