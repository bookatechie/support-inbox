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

## API Authentication

Two authentication methods:

1. **JWT Token** (for UI): `Authorization: Bearer <token>`
2. **API Key** (for automation): `X-API-Key: <key>`

## Real-Time Updates (SSE)

The frontend connects to `/api/events` for live updates:

- `new-ticket`: New ticket created
- `ticket-update`: Status/priority/assignee changed
- `new-message`: New message added
- `viewer-joined` / `viewer-left`: Presence tracking

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
