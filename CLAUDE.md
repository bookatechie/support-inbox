# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Support Inbox is a modern, lightweight email-based customer support system with real-time collaboration features. It's a self-hosted alternative to platforms like Intercom or Zendesk, designed for small teams who want professional support tools without the complexity and cost of SaaS platforms.

## Tech Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Fastify 5 with TypeScript
- **Database**: PostgreSQL (via `pg` driver)
- **Email**: IMAP (inbound via `imap-simple`) + SMTP (outbound via `nodemailer`)
- **File Storage**: Local filesystem or AWS S3 (auto-detects based on config)
- **Real-time**: Server-Sent Events (SSE)
- **Auth**: JWT tokens via `@fastify/jwt`

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 3 + shadcn/ui components
- **Rich Text Editor**: TipTap
- **State Management**: React Query (TanStack Query)
- **Icons**: Lucide React

## Code Organization

- **Backend**: `src/server/` - Fastify server, API routes, database, email workers
- **Frontend**: `src/client/` - React app with pages, components, hooks
- **Types**: Server types in `src/server/lib/types.ts`, client types in `src/client/src/types/index.ts`
- **UI Components**: shadcn/ui components in `src/client/src/components/ui/`

## Development Commands

```bash
# Install dependencies (run both)
npm install
cd src/client && npm install && cd ../..

# Development (run in separate terminals)
npm run dev              # Backend with hot reload (tsx watch)
npm run dev:client       # Frontend with hot reload (Vite)

# Production build
npm run build            # Builds both server and client
npm start                # Start production server

# Individual builds
npm run build:server     # TypeScript compilation only
npm run build:client     # Vite build only

# Code quality
npm run type-check       # TypeScript type checking
npm run lint             # ESLint

# Cleanup
npm run clean            # Remove dist directory
```

## Key Files to Understand

### Backend

| File | Purpose |
|------|---------|
| `src/server/api/routes.ts` | All REST API endpoints (~1700 lines) |
| `src/server/lib/database-pg.ts` | Database schema, queries, and migrations |
| `src/server/lib/ticket.ts` | Core ticket operations (create, reply, update) |
| `src/server/lib/config.ts` | Environment variable loading and validation |
| `src/server/workers/email-daemon.ts` | IMAP polling for incoming emails |
| `src/server/lib/email-sender.ts` | SMTP email sending |
| `src/server/lib/webhook.ts` | Outgoing webhook notifications |
| `src/server/lib/errors.ts` | Custom error classes |

### Frontend

| File | Purpose |
|------|---------|
| `src/client/src/pages/TicketsPage.tsx` | Main inbox view with filters |
| `src/client/src/pages/TicketDetailPage.tsx` | Ticket conversation thread |
| `src/client/src/components/RichTextEditor.tsx` | TipTap-based rich text editor |
| `src/client/src/hooks/useSSE.ts` | Real-time updates via SSE |
| `src/client/src/lib/api.ts` | API client with all endpoints |

## Database Schema

The PostgreSQL schema is defined in `src/server/lib/database-pg.ts`. Key tables:

- **tickets**: Support tickets with status, priority, assignee
- **messages**: Threaded messages (customer, agent, internal notes)
- **users**: Agent accounts with roles (admin/agent)
- **attachments**: File attachments linked to messages
- **tags** / **ticket_tags**: Tagging system
- **canned_responses**: Template responses
- **drafts**: Auto-saved reply drafts
- **email_opens**: Email open tracking

## Email Flow Architecture

### Incoming Messages (Customer → Support)
1. Customer sends email to your support address (e.g., `support@yourcompany.com`)
2. Support Inbox polls your email via IMAP every 30 seconds
3. New emails automatically become tickets in the system
4. Replies to existing tickets add messages to the conversation thread
5. Attachments are uploaded to S3/local storage and linked to messages
6. Team members see new tickets instantly via real-time updates

### Outgoing Replies (Support → Customer)
1. Agent writes a reply in the rich text editor
2. Message is saved to the database and sent via SMTP
3. Email includes proper threading headers so replies stay organized
4. Customer receives a normal email and can reply directly
5. Their reply comes back as a new message on the same ticket

## API Authentication

Two authentication methods:

1. **JWT Token** (for UI): `Authorization: Bearer <token>`
2. **API Key** (for automation): `X-API-Key: <key>`

### API Key Setup
```bash
# Generate a secure key
openssl rand -base64 32

# Add to .env
INTERNAL_API_KEY=sk_internal_your-secure-random-key
```

## REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tickets` | List tickets with filters |
| `POST` | `/tickets` | Create new ticket |
| `GET` | `/tickets/:id` | Get ticket details |
| `PATCH` | `/tickets/:id` | Update ticket (status, priority, assignee) |
| `POST` | `/tickets/:id/reply` | Send reply to customer |
| `POST` | `/tickets/:id/internal-note` | Add internal note |

## Webhook Events

Configure `WEBHOOK_URL` in `.env` to receive POST requests:

### `new_ticket`
```json
{
  "event": "new_ticket",
  "ticket": {
    "id": 123,
    "subject": "Need help with order",
    "customer_email": "customer@example.com",
    "customer_name": "Jane Doe",
    "status": "new",
    "priority": "normal",
    "assignee_id": null,
    "created_at": "2025-01-15T10:30:00Z"
  },
  "message": {
    "id": 456,
    "sender_email": "customer@example.com",
    "body": "Message content...",
    "type": "email"
  }
}
```

### `customer_reply`
Triggered when a customer replies to an existing ticket.

### `new_reply`
Triggered when an agent sends a reply.

### `ticket_update`
```json
{
  "event": "ticket_update",
  "ticket": { /* updated ticket details */ },
  "changes": {
    "status": "resolved",
    "assignee_id": 5
  },
  "updated_by": "agent@example.com"
}
```

## Real-Time Updates (SSE)

The frontend connects to `/api/events` for live updates:

- `new-ticket`: New ticket created
- `ticket-update`: Status/priority/assignee changed
- `new-message`: New message added
- `viewer-joined` / `viewer-left`: Presence tracking

## Configuration

All config is via environment variables. See `.env.example` for full list:

**Required:**
- `POSTGRES_*`: Database connection
- `JWT_SECRET`: Token signing

**Email (for full functionality):**
- `IMAP_*`: Inbound email polling
- `SMTP_*`: Outbound email sending

**Optional:**
- `S3_*`: Cloud file storage (falls back to local)
- `WEBHOOK_URL`: External notifications
- `AI_RESPONSE_API_URL`: AI-generated response suggestions
- `CUSTOMER_INFO_API_URL`: External customer data lookup

### Default Admin Account

Configure in `.env` before first run:
- `DEFAULT_ADMIN_EMAIL`: Admin email (default: `admin@example.com`)
- `DEFAULT_ADMIN_PASSWORD`: Admin password (default: `admin123`)

The default admin account is created automatically when the database is empty.

## Development Guidelines

### TypeScript Best Practices

1. **Strong typing required** - Never use `any`
2. **Define types centrally** - Server types in `src/server/lib/types.ts`, client types in `src/client/src/types/index.ts`
3. **Type all function parameters and return values**

### Frontend Patterns

- **shadcn/ui components** in `src/client/src/components/ui/`
- **Use Tailwind CSS** utility classes, avoid custom CSS
- **React Query** for server state management
- **Use existing hooks** - Check `src/client/src/hooks/` before creating new ones

### Backend Patterns

- **Fastify routes** are defined in `src/server/api/routes.ts`
- **Database queries** are organized by table in `src/server/lib/database-pg.ts`
- **Business logic** goes in `src/server/lib/ticket.ts`
- **Webhooks** are fire-and-forget, handled in `src/server/lib/webhook.ts`

### Error Handling

- Use custom error classes from `src/server/lib/errors.ts`
- Fastify error handler returns consistent JSON responses
- Frontend shows toast notifications via Sonner

## Debugging Tips

1. **Check compiled output** - Read `dist/server/*.js` to verify changes
2. **Server logs** - Uses Pino logger, run with `pino-pretty` for readable output
3. **Database issues** - Check `database-pg.ts` for query implementations
4. **Email issues** - Check `email-daemon.ts` for IMAP and `email-sender.ts` for SMTP

## Common Tasks

### Adding a new API endpoint

1. Add route in `src/server/api/routes.ts`
2. Add database query in `src/server/lib/database-pg.ts` if needed
3. Add client API function in `src/client/src/lib/api.ts`
4. Add TypeScript types in both server and client

### Adding a new UI component

1. Check if shadcn/ui has the component first
2. Create in `src/client/src/components/`
3. Follow existing patterns for props and styling

### Modifying the database schema

1. Update schema in `initializeDatabase()` in `database-pg.ts`
2. Add migration SQL in `migrations/` folder
3. Update TypeScript types to match

## Automation Use Cases

### Auto-Assignment with n8n/Zapier
- Assign urgent tickets to senior agents automatically
- Route tickets by keyword to specialized teams
- Balance workload across available agents

### AI-Powered Responses
- Generate draft responses with your own AI workflows (OpenAI, Claude, Gemini)
- Use `AI_RESPONSE_API_URL` to integrate your custom AI endpoint
- Analyze sentiment and suggest appropriate tone
- Auto-generate responses based on knowledge base

### Smart Tagging & Categorization
- Analyze ticket content with AI to auto-tag by category
- Set priority based on urgency detection
- Route to specialized teams based on topic classification

### External Integrations
- Create Slack notifications for urgent tickets
- Log tickets to Google Sheets or Airtable
- Sync with CRM systems (Salesforce, HubSpot)
- Create tasks in project management tools

## Deployment

### Production with systemd

Create `/etc/systemd/system/support-inbox.service`:
```ini
[Unit]
Description=Support Inbox
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/support-inbox
ExecStart=/usr/bin/npm start
Restart=always
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable support-inbox
sudo systemctl start support-inbox
sudo systemctl status support-inbox
```

## Data Backup

- **PostgreSQL**: Use `pg_dump` for database backups
- **Local attachments**: Back up the `data/` folder
- **S3 attachments**: Already backed up in the cloud
