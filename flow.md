# Support Inbox - Process Flows

This document maps out all major process flows in the system using Mermaid diagrams.

---

## 1. Incoming Email Processing (Email Daemon)

The email daemon polls the IMAP inbox on a configurable interval and processes each unseen email.

```mermaid
flowchart TD
    A[IMAP Poll - Check for UNSEEN emails] --> B{New unseen emails?}
    B -- No --> A
    B -- Yes --> C[Parse email via mailparser]
    C --> D[Extract TO/CC/BCC recipients]
    C --> E[Extract Message-ID, In-Reply-To, References]
    C --> F[Extract attachments]
    D & E & F --> G{Duplicate check: Message-ID already in DB?}
    G -- Yes --> H[Skip email, mark as seen]
    G -- No --> I{Auto-generated? Precedence: bulk/junk}
    I -- Yes --> H
    I -- No --> J{Is this a reply? Check In-Reply-To & References headers}

    J -- "Reply found via In-Reply-To" --> K[Add message to existing ticket]
    J -- "Reply found via References" --> K
    J -- "No match found" --> L[Create new ticket]

    L --> L1[Status = 'new', Priority = 'normal']
    L1 --> L2{Any TO/CC address matches an agent's agent_email?}
    L2 -- Yes --> L3[Auto-assign ticket to that agent]
    L2 -- No --> L4[Ticket left unassigned]
    L3 & L4 --> L5[Save attachments - convert HEIC to JPEG]
    L5 --> L6[Store email_metadata JSON: subject, to, cc, bcc, inReplyTo, references, headers]
    L6 --> L7[Emit SSE 'new-ticket' event]
    L7 --> L8[Fire 'new_ticket' webhook]
    L8 --> H

    K --> K1{Current ticket status?}
    K1 -- "awaiting_customer or resolved" --> K2[Change status to 'open']
    K1 -- "Any other status" --> K3[Keep current status]
    K2 & K3 --> K4[Save attachments]
    K4 --> K5[Store TO/CC in message record]
    K5 --> K6[Emit SSE 'new-message' event]
    K6 --> K7[Emit SSE 'ticket-update' event]
    K7 --> K8[Fire 'customer_reply' webhook]
    K8 --> H
```

---

## 2. Agent Replies to a Ticket

When an agent sends a reply from the UI via `POST /tickets/:id/reply`.

```mermaid
flowchart TD
    A[Agent submits reply] --> B{Message type?}
    B -- "email reply" --> C[Append agent's signature to HTML body]
    B -- "internal note" --> N1[Store as note - no signature]

    C --> D{Ticket currently unassigned?}
    D -- Yes --> E[Auto-assign ticket to replying agent]
    E --> E1[Log assignment in audit trail]
    E1 --> E2[Emit SSE 'ticket-update' for assignment]
    D -- No --> F[Keep current assignee]
    E2 & F --> G[Create message record in DB]

    G --> G1[Store to_emails and cc_emails on message]
    G1 --> H{Attachments provided?}
    H -- Yes --> I[Save attachments to storage]
    I --> I1[Build emailAttachments array for sending]
    H -- No --> J[Continue]
    I1 & J --> K{Scheduled for later?}

    K -- Yes --> K1[Store scheduled_at on message]
    K1 --> K2[No email sent yet, no status change]
    K -- No --> L[Generate tracking token for email opens]
    L --> M[Retrieve threading info: all message IDs for ticket]
    M --> M1[Get quoted message for email body]
    M1 --> O[Send email via SMTP]

    O --> O1{Is this the first message on the ticket?}
    O1 -- Yes --> O2[sendNewEmail - no threading headers]
    O1 -- No --> O3[sendReplyEmail - with In-Reply-To & References headers]
    O2 & O3 --> P[Extract real Message-ID from SES SMTP response]
    P --> P1[Store Message-ID in DB for future threading]
    P1 --> Q[Update ticket status to 'resolved']

    Q --> R[Emit SSE 'new-message' event]
    R --> S[Emit SSE 'ticket-update' event]
    S --> T[Fire 'new_reply' webhook]

    N1 --> N2[Store message with type = 'note']
    N2 --> N3[to_emails = null, cc_emails = null]
    N3 --> N4[No email sent to customer]
    N4 --> N5[Emit SSE 'new-message' event]
    N5 --> N6[Emit SSE 'ticket-update' event]
    N6 --> N7[No webhook fired for notes]
```

---

## 3. Ticket Creation via API

When a ticket is created manually via `POST /tickets` (e.g., from automation or the UI).

```mermaid
flowchart TD
    A["POST /tickets with subject, customer_email, optional message_body"] --> B[Validate required fields]
    B --> C{Resolve assignee}
    C --> C1["assignee_email provided? → look up user"]
    C --> C2["from_email provided? → look up user"]
    C --> C3["Neither → assign to creating user"]
    C1 & C2 & C3 --> D["Create ticket in DB (status from request or 'new', priority from request or 'normal')"]

    D --> E{message_body provided?}
    E -- Yes --> F[Detect HTML vs plain text]
    F --> G[Set sender as agent's company email or SMTP from address]
    G --> H[Create message record]
    H --> I{"send_email !== false?"}
    I -- Yes --> J[Send email to customer via SMTP]
    J --> J1[Store returned Message-ID]
    I -- No --> K[Skip email sending]
    J1 & K --> L[Continue]
    E -- No --> L

    L --> M{Tags provided?}
    M -- Yes --> M1[Look up or create each tag]
    M1 --> M2[Associate tags with ticket]
    M -- No --> N[Continue]
    M2 & N --> O[Emit SSE 'new-ticket' event]
    O --> P{Message exists?}
    P -- Yes --> Q[Fire 'new_ticket' webhook]
    P -- No --> R[No webhook]
    Q & R --> S[Return 201 with ticket]
```

---

## 4. Ticket Update Flow

When a ticket's metadata is changed via `PATCH /tickets/:id`.

```mermaid
flowchart TD
    A["PATCH /tickets/:id with changes"] --> B{What changed?}

    B --> C{Status changed?}
    C -- Yes --> C1["Update status (e.g., new → open → resolved → awaiting_customer)"]
    C1 --> C2[Log old→new in audit trail]
    C -- No --> D[Skip]

    B --> E{Priority changed?}
    E -- Yes --> E1["Update priority (low/normal/high/urgent)"]
    E1 --> E2[Log old→new in audit trail]
    E -- No --> F[Skip]

    B --> G{Assignee changed?}
    G -- Yes --> G1[Update assignee_id]
    G1 --> G2[Log old→new in audit trail]
    G -- "assignee_email provided" --> G3[Resolve email to user ID first]
    G3 --> G1
    G -- No --> H[Skip]

    B --> I{Customer email changed?}
    I -- Yes --> I1[Update customer_email]
    I1 --> I2[Log in audit trail]
    I -- No --> J[Skip]

    B --> K{Customer name changed?}
    K -- Yes --> K1[Update customer_name]
    K1 --> K2[Log in audit trail]
    K -- No --> L[Skip]

    B --> M{Follow-up date changed?}
    M -- Yes --> M1[Update follow_up_at]
    M1 --> M2[Log in audit trail]
    M -- No --> N2[Skip]

    C2 & D & E2 & F & G2 & H & I2 & J & K2 & L & M2 & N2 --> O{Any actual changes detected?}
    O -- Yes --> P[Emit SSE 'ticket-update' event]
    P --> Q[Fire 'ticket_update' webhook with changes object]
    O -- No --> R[Return ticket unchanged]
    Q --> S[Return updated ticket]
```

---

## 5. Scheduled Message Flow

When an agent schedules a reply to be sent later.

```mermaid
flowchart TD
    A[Agent creates reply with scheduled_at in the future] --> B[Message stored in DB with scheduled_at timestamp]
    B --> C[No email sent immediately]
    C --> D[No status change to 'resolved']
    D --> E[No 'new_reply' webhook fired]

    F[Scheduler checks for due messages] --> G{scheduled_at <= now?}
    G -- Yes --> H[Retrieve message and ticket]
    H --> I[Parse stored to_emails and cc_emails from JSON]
    I --> J[Get threading info for ticket]
    J --> K[Send email via SMTP with threading headers]
    K --> L[Extract and store real Message-ID]
    L --> M[Update ticket status to 'resolved']
    M --> N[Emit SSE 'new-message' event]
    N --> O[Emit SSE 'ticket-update' event]
    G -- No --> F
```

---

## 6. Email Threading Model

How email threading headers are managed to keep conversations organized.

```mermaid
flowchart TD
    A[Customer sends initial email] --> B["Message-ID: <abc@customer.com>"]
    B --> C[Stored as ticket.message_id AND message.message_id]

    D[Agent replies] --> E{First message on ticket?}
    E -- Yes --> F[sendNewEmail - no threading headers]
    E -- No --> G["Build References header from all prior message IDs"]
    G --> G1["Set In-Reply-To to most recent message ID"]
    G1 --> G2["Priority: customer's References chain > individual message IDs"]
    G2 --> G3["Remove duplicate IDs from References"]

    F & G3 --> H[Send via SMTP]
    H --> I["SES returns response: '250 Ok 0100019d5029e2bc-...'"]
    I --> J["Extract real Message-ID: <0100019d5029e2bc-...@email.amazonses.com>"]
    J --> K[Store in messages.message_id for future threading]

    L[Customer replies back] --> M["In-Reply-To: <ses-id@email.amazonses.com>"]
    M --> N["findTicketByThreading() looks up In-Reply-To in DB"]
    N --> O{Found?}
    O -- Yes --> P[Message added to correct ticket]
    O -- No --> Q[Check References array entries one by one]
    Q --> R{Found?}
    R -- Yes --> P
    R -- No --> S[Create as new ticket]
```

---

## 7. Multiple Recipients (TO/CC) Handling

How TO and CC recipients flow through the system.

```mermaid
flowchart TD
    A["Incoming email with multiple TO and CC addresses"] --> B["Parse all addresses via extractAllAddresses()"]
    B --> C["Store in message: to_emails, cc_emails as JSON arrays"]
    B --> D["Store in email_metadata JSON for auditing"]

    subgraph "Auto-Assignment Check (New Tickets Only)"
        E["Combine TO + CC into single list"] --> F["For each address: check if it matches a user's agent_email"]
        F --> G{Match found?}
        G -- Yes --> H["Auto-assign ticket to first matching agent"]
        G -- No --> I["Ticket left unassigned"]
    end

    B --> E

    subgraph "Agent Reply"
        J["Agent specifies to_emails override?"] --> K{Yes}
        K --> L["Use provided to_emails"]
        J --> M{No}
        M --> N["Fallback: ticket.reply_to_email or ticket.customer_email"]
        L & N --> O["Agent can also specify cc_emails"]
        O --> P["Both passed to sendReplyEmail()"]
        P --> Q["Stored on message record for audit trail"]
    end

    subgraph "Webhook Delivery"
        R["extractRecipientsFromMessage()"] --> S["Parse to_emails JSON column"]
        R --> T["Parse cc_emails JSON column"]
        R --> U["Extract original_to from X-Original-To header (forwarded emails)"]
        S & T & U --> V["Include in webhook payload"]
    end
```

---

## 8. Webhook Event Lifecycle

All webhook events and when they fire.

```mermaid
flowchart TD
    subgraph "Trigger Points"
        A1[New ticket from email] -->|"new_ticket"| W
        A2[New ticket from API with message] -->|"new_ticket"| W
        A3[Customer replies to ticket] -->|"customer_reply"| W
        A4[Agent sends reply] -->|"new_reply"| W
        A5[Ticket metadata updated] -->|"ticket_update"| W
    end

    W{webhookUrl configured?} -- No --> X[No webhook sent]
    W -- Yes --> Y[Build payload]

    Y --> Y1["Strip base64 images from message body"]
    Y1 --> Y2["Extract recipients (to/cc/original_to)"]
    Y2 --> Y3["Include attachments metadata"]

    Y3 --> Z["POST to webhookUrl"]
    Z --> Z1["Headers: Content-Type: application/json, User-Agent: SupportInbox/1.0"]
    Z1 --> Z2{Response OK?}
    Z2 -- Yes --> Z3[Log success]
    Z2 -- No --> Z4[Log error - no retry]

    subgraph "Does NOT trigger webhook"
        N1[Internal notes]
        N2[Scheduled messages at creation time]
        N3[Tag changes]
        N4[Presence/composing events]
        N5[Ticket update with no actual changes]
    end
```

---

## 9. SSE (Real-Time) Event Lifecycle

All Server-Sent Events and when they are broadcast.

```mermaid
flowchart TD
    subgraph "Connection Setup"
        A["Client connects to GET /events with JWT token"] --> B[Verify JWT]
        B --> C[Register client in global clients Map]
        C --> D["Send 'connected' event"]
        D --> E[Start 30s heartbeat]
        E --> F{Client backpressured? Write buffer > 64KB}
        F -- Yes --> G[Disconnect slow client]
        F -- No --> H[Continue heartbeat]
    end

    subgraph "Event Sources → SSE Events"
        I1[New ticket created] -->|"new-ticket"| BC
        I2[Ticket metadata updated] -->|"ticket-update"| BC
        I3[New message added] -->|"new-message"| BC
        I4[Message deleted] -->|"message-deleted"| BC
        I5[User opens ticket] -->|"viewer-joined"| BC
        I6[User leaves ticket] -->|"viewer-left"| BC
        I7[User typing reply] -->|"user-composing"| BC
        I8[Tags changed] -->|"ticket-tags-updated"| BC
    end

    BC[Broadcast to all connected clients] --> BC1{Skip backpressured clients}
    BC1 --> BC2[Send SSE payload to each client]
```

---

## 10. Complete Ticket Lifecycle (Status Transitions)

```mermaid
stateDiagram-v2
    [*] --> new: Ticket created (email or API)

    new --> open: Manual status change
    new --> resolved: Agent replies
    new --> awaiting_customer: Manual status change

    open --> resolved: Agent replies
    open --> awaiting_customer: Manual status change
    open --> new: Manual status change

    resolved --> open: Customer replies
    resolved --> new: Manual status change
    resolved --> awaiting_customer: Manual status change

    awaiting_customer --> open: Customer replies
    awaiting_customer --> resolved: Agent replies or manual
    awaiting_customer --> new: Manual status change

    note right of new: Default status for new tickets
    note right of resolved: Auto-set when agent sends reply
    note right of open: Auto-set when customer replies\nto resolved/awaiting ticket
```

---

## 11. Attachment Handling Flow

```mermaid
flowchart TD
    subgraph "Incoming Email Attachments"
        A[Email parsed with attachments] --> B{File is HEIC/HEIF?}
        B -- Yes --> C[Convert to JPEG via heic-convert]
        B -- No --> D[Keep original format]
        C & D --> E["Save to storage (S3 or local filesystem)"]
        E --> F[Store metadata in attachments table: filename, path, size, contentType]
    end

    subgraph "Agent Reply Attachments"
        G[Agent uploads files with reply] --> H[Save to storage]
        H --> I[Create attachment records in DB]
        I --> J{Storage type?}
        J -- S3 --> K[Read as buffer for email attachment]
        J -- Local --> L[Use file path for email attachment]
        K & L --> M[Attach to outgoing email via nodemailer]
    end

    subgraph "Attachment in Events"
        N[Attachments included in SSE 'new-message' payload]
        O[Attachments metadata included in webhook payloads]
    end
```

---

## 12. Internal Notes Flow

```mermaid
flowchart TD
    A["Agent creates note via POST /tickets/:id/reply with type='note'"] --> B[No signature appended]
    B --> C["Create message record with type='note'"]
    C --> D["to_emails = null, cc_emails = null"]
    D --> E[No email sent to customer]
    E --> F[No tracking token generated]
    F --> G["Emit SSE 'new-message' event (visible to all agents)"]
    G --> H[No webhook fired]

    I["Agent deletes note via DELETE /messages/:id"] --> J{Message type = 'note'?}
    J -- Yes --> K[Delete message from DB]
    K --> L["Emit SSE 'message-deleted' event"]
    J -- No --> M["Return 403 - only notes can be deleted"]
```

---

## 13. From Address Priority

How the sender address is determined for outgoing emails.

```mermaid
flowchart TD
    A[Sending an email] --> B{from_email override provided?}
    B -- Yes --> C[Use from_email override]
    B -- No --> D{Agent has personal agent_email?}
    D -- Yes --> E[Use agent's agent_email]
    D -- No --> F[Use shared inbox from SMTP config]
    C & E & F --> G[Set as 'From' address on outgoing email]
```

---

## 14. Bulk Update Flow

```mermaid
flowchart TD
    A["POST /tickets/bulk-update with ticket_ids and changes"] --> B[Loop through each ticket_id]
    B --> C["Call updateTicket() for each ticket"]
    C --> D[Each update triggers its own:]
    D --> D1[Audit trail logging]
    D --> D2[SSE 'ticket-update' event]
    D --> D3["'ticket_update' webhook (if changes detected)"]
    D1 & D2 & D3 --> E[Return success count and updated tickets]
```
