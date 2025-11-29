# Support Inbox

A modern, lightweight email-based customer support system with real-time collaboration features. Built to be fast, efficient, and easy to deploy.

<p align="center">
  <strong>🚀 Single executable • 📧 Email integration • ⚡ Real-time updates • 💼 Professional UI</strong>
</p>

---

## What is Support Inbox?

Support Inbox is a self-hosted customer support platform that turns your email into a powerful shared inbox. Perfect for small teams who want professional support tools without the complexity and cost of SaaS platforms like Intercom or Zendesk.

### Key Benefits

- **Easy Setup**: No complex infrastructure. Just email credentials and you're running.
- **Lightweight**: Uses ~100-200MB RAM - perfect for small VPS or even Raspberry Pi
- **Real-Time**: See updates instantly with Server-Sent Events - no constant page refreshing
- **Professional**: Beautiful modern UI with rich text editing, drafts, and internal notes
- **Self-Contained**: Single executable with embedded database - no separate database server needed
- **Email-First**: Works with your existing email (IMAP/SMTP) - no migration required

---

## Features

### Core Support Features

- **📥 Email Integration**: Automatically converts incoming emails into support tickets
- **📤 HTML Replies**: Send professional formatted responses directly from the interface
- **🎨 Rich Text Editor**: Format replies with bold, italic, lists, quotes, and code blocks
- **💬 Threaded Conversations**: All messages organized in a clean timeline view
- **📝 Internal Notes**: Add private notes that aren't sent to customers
- **💾 Auto-Save Drafts**: Never lose your work - drafts save automatically as you type
- **🏷️ Status Management**: Track tickets as New, Open, Awaiting Customer, or Resolved
- **⚡ Priority Levels**: Flag urgent issues with Low, Normal, High, and Urgent priorities
- **👤 Assignment**: Assign tickets to team members for clear ownership

### Real-Time Collaboration

- **⚡ Live Updates**: See new tickets and messages instantly without refreshing
- **👥 Customer Sidebar**: Quick view of customer info and ticket history
- **🔔 Instant Notifications**: Know immediately when customers respond

### Modern User Experience

- **🎯 Clean Interface**: Built with React and shadcn/ui components
- **📱 Responsive Design**: Works great on desktop, tablet, and mobile
- **🎨 Color-Coded Messages**: Easily distinguish between customer, agent, and internal messages
- **⌨️ Fast Navigation**: Keyboard-friendly interface for power users

---

## How It Works

### Email Flow

**Incoming Messages (Customer → Support)**
1. Customer sends email to your support address (e.g., `support@yourcompany.com`)
2. Support Inbox polls your email via IMAP every 30 seconds
3. New emails automatically become tickets in the system
4. Replies to existing tickets add messages to the conversation thread
5. Attachments are uploaded to S3 and linked to messages
6. Team members see new tickets instantly via real-time updates

**Outgoing Replies (Support → Customer)**
1. Agent writes a reply in the rich text editor
2. Message is saved to the database and sent via SMTP
3. Email includes proper threading headers so replies stay organized
4. Customer receives a normal email and can reply directly
5. Their reply comes back as a new message on the same ticket

**Internal Collaboration**
- Agents can add internal notes that customers never see
- Drafts save automatically and persist across browser sessions
- Status updates (New → Open → Resolved) track ticket progress
- Assignment ensures clear ownership of each conversation

---

## Requirements

### System Requirements
- **Node.js 20+** for running the application
- **IMAP/SMTP Email Account** (Gmail, Outlook, Dreamhost, etc.)
- **AWS S3 Bucket** (optional, for attachments)
- **~100-200MB RAM** (very lightweight!)
- **~50-200MB Disk Space** depending on ticket volume

### Email Provider Compatibility
Works with any email provider supporting IMAP/SMTP:
- ✅ Gmail (app-specific passwords required)
- ✅ Microsoft 365 / Outlook.com
- ✅ Dreamhost / cPanel hosting
- ✅ ProtonMail Bridge
- ✅ FastMail, Mailbox.org, etc.

---

## Tech Stack

Built with modern, production-ready technologies:

- **Backend**: Node.js, Fastify, TypeScript
- **Database**: SQLite (embedded, no separate server needed)
- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Rich Text**: TipTap Editor
- **Email**: Nodemailer (SMTP), imap-simple (IMAP)
- **Real-Time**: Server-Sent Events (SSE)
- **File Storage**: Local file system or AWS S3 (auto-detects based on configuration)

---

## Getting Started

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/bookatechie/support-inbox.git
cd support-inbox

# 2. Install dependencies
npm install
cd src/client && npm install && cd ../..

# 3. Copy environment template
cp .env.example .env

# 4. Edit .env with your email credentials
nano .env
```

### Configuration

Edit the `.env` file with your email credentials and settings. See `.env.example` for all available configuration options and detailed comments.

**Key settings you'll need:**
- Email credentials (IMAP/SMTP)
- JWT secret for authentication
- Optional: S3 credentials for cloud storage (auto-enables when configured)
- Optional: API key for integrations
- Optional: Webhook URLs for external services

### Running the Application

**Development Mode (with hot reload):**
```bash
# Terminal 1: Start backend
npm run dev

# Terminal 2: Start frontend
npm run dev:client

# Open http://localhost:3000 in your browser
```

**Production Mode:**
```bash
# Build once
npm run build

# Start the server
npm start

# Open http://localhost:3001 in your browser
```

**Default Login:**
- Email: `admin@example.com` (or your `DEFAULT_ADMIN_EMAIL`)
- Password: `admin123` (or your `DEFAULT_ADMIN_PASSWORD`)

> ⚠️ **Security Note**: Configure `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` in your `.env` file before first run. The default admin account is created automatically when the database is empty. For production, you must change these from the defaults!

### Managing Users

Use the built-in Admin section to:
- Create new agent accounts
- Manage user roles (agent/admin)
- Set agent signatures
- Configure AI profiles

---

## Usage Guide

### Basic Workflow

1. **Incoming Emails**: Customers email your support address → Automatically become tickets
2. **View Tickets**: See all tickets in the main inbox view with status filters
3. **Reply to Customer**: Click a ticket, type your reply, send (customer gets email)
4. **Add Internal Notes**: Use the "Add Note" button for private team communication
5. **Manage Status**: Update ticket status as you work (New → Open → Resolved)
6. **Assign Tickets**: Assign to specific agents for clear ownership

### Key Features Explained

**🎨 Rich Text Editing**
- Bold, italic, lists, quotes, and code formatting
- Compose professional responses with ease

**📎 Attachments**
- Upload files with replies (stored in local file system or AWS S3)
- Automatic UUID-based filenames for security
- Download customer attachments from the interface
- Public URLs blocked when using S3 (private access only)

**💾 Auto-Save Drafts**
- Drafts save automatically while you type
- Come back later and continue where you left off

**📝 Internal Notes**
- Add private notes visible only to your team
- Never accidentally sent to customers

**🔔 Real-Time Updates**
- See new tickets instantly without refreshing
- Live indicators when teammates view tickets

**⚡ Canned Responses**
- Create templates for common responses
- Save time with frequently-used replies

---

## Deployment

### Simple Deployment (Development/Testing)
```bash
npm run build
npm start
# Access at http://your-server:3001
```

### Production Deployment with systemd
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

## Webhooks & Automation

Support Inbox can send webhook notifications for ticket events, enabling powerful automation workflows with tools like n8n, Zapier, Make.com, or custom scripts.

### Webhook Events

Configure `WEBHOOK_URL` in your `.env` file to receive POST requests for these events:

**1. `new_ticket`** - Triggered when a new ticket is created
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

**2. `customer_reply`** - Triggered when a customer replies to an existing ticket
```json
{
  "event": "customer_reply",
  "ticket": { /* ticket details */ },
  "message": { /* new message details */ }
}
```

**3. `new_reply`** - Triggered when an agent sends a reply
```json
{
  "event": "new_reply",
  "ticket": { /* ticket details */ },
  "message": { /* reply message details */ }
}
```

**4. `ticket_update`** - Triggered when ticket status, priority, or assignee changes
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

### Automation Use Cases

**Auto-Assignment with n8n/Zapier:**
- Assign urgent tickets to senior agents automatically
- Route tickets by keyword to specialized teams
- Balance workload across available agents

**AI-Powered Responses:**
- Generate draft responses with your own AI workflows (OpenAI, Claude, Gemini)
- Use `AI_RESPONSE_API_URL` to integrate your custom AI endpoint
- Or build your own with n8n/Zapier + AI providers
- **Not locked into any provider** - bring your own AI service
- Analyze sentiment and suggest appropriate tone
- Auto-generate responses based on knowledge base

**Smart Tagging & Categorization:**
- Analyze ticket content with AI to auto-tag by category
- Set priority based on urgency detection
- Route to specialized teams based on topic classification
- Customer tier detection (VIP, standard, etc.)

**External Integrations:**
- Create Slack notifications for urgent tickets
- Log tickets to Google Sheets or Airtable
- Sync with CRM systems (Salesforce, HubSpot)
- Create tasks in project management tools

**Example n8n AI Workflow:**
1. Webhook receives `new_ticket` event
2. Send ticket content to OpenAI/Claude API
3. AI analyzes: urgency, category, suggested response
4. If urgent → set priority to "high" and notify Slack
5. If billing-related → auto-assign to billing agent
6. Generate draft response and save to Support Inbox
7. Agent reviews and sends (or auto-send for simple cases)

---

## API Integration

Support Inbox includes a REST API for integrations and automation.

### API Authentication

**API Key Method** (recommended for automation):
```bash
# 1. Generate a secure key
openssl rand -base64 32

# 2. Add to your .env file
INTERNAL_API_KEY=sk_internal_your-secure-random-key

# 3. Use in API requests
curl http://localhost:3001/tickets \
  -H "X-API-Key: sk_internal_your-secure-random-key"
```

### Example: Create Ticket via API
```bash
curl -X POST http://localhost:3001/tickets \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Automated ticket",
    "customer_email": "customer@example.com",
    "message_body": "Created by automation"
  }'
```

### Common Endpoints
- `GET /tickets` - List tickets with filters
- `POST /tickets` - Create new ticket
- `GET /tickets/:id` - Get ticket details
- `POST /tickets/:id/reply` - Send reply
- `PATCH /tickets/:id` - Update ticket (status, priority, assignee)
- `POST /tickets/:id/internal-note` - Add internal note

Full API documentation available in the codebase at `src/server/api/routes.ts`.

---

## FAQ

**Q: Can I use this with my existing email?**
A: Yes! Works with any IMAP/SMTP email provider. Your existing emails are not affected.

**Q: Do I need a separate database server?**
A: No, SQLite is embedded. Everything runs in one process.

**Q: How do I backup my data?**
A: Copy the `data/` folder (contains database and attachments if using local storage). If using S3, your attachments are already backed up in the cloud.

**Q: Can I customize the UI?**
A: Yes! The frontend is built with React and Tailwind CSS, easy to customize.

**Q: Is this production-ready?**
A: Currently in active development. Basic features work well, but expect updates.

**Q: How much does it cost?**
A: It's open source and free to use. Only costs are your email provider and server hosting.

---

## License

MIT License - see LICENSE file for details.

---

## Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Contributing**: Pull requests welcome!
