<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/node-20%2B-brightgreen.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue.svg" alt="TypeScript" />
</p>

<h1 align="center">Support Inbox</h1>

<p align="center">
  <strong>Open-source customer support platform for email-first teams</strong><br/>
  A self-hosted alternative to Intercom, Zendesk, and Help Scout
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#api--webhooks">API & Webhooks</a> •
  <a href="#managed-services">Managed Services</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Why Support Inbox?

Most customer support tools are **expensive**, **complex**, and **overkill** for small teams. Support Inbox is different:

- **Free & Open Source** — No per-seat pricing, no feature gates
- **Email-First** — Works with your existing inbox (Gmail, Outlook, any IMAP/SMTP)
- **Lightweight** — Runs on ~100-200MB RAM, perfect for a $5/month VPS
- **Self-Hosted** — Your data stays on your servers
- **Modern Stack** — React, TypeScript, Tailwind, real-time updates

---

## Features

### 📧 Email Integration

Turn your support email into a powerful shared inbox. Customers email you normally, agents respond through a beautiful interface.

### ⚡ Real-Time Collaboration

See new tickets instantly. Know when teammates are viewing the same ticket. No more page refreshing.

### 📝 Rich Text Editor

Compose professional responses with formatting, lists, code blocks, and more. Auto-saving drafts ensure you never lose work.

### 🏷️ Ticket Management

- **Status tracking** — New, Open, Awaiting Customer, Resolved
- **Priority levels** — Low, Normal, High, Urgent
- **Assignment** — Clear ownership for every conversation
- **Tags** — Organize and filter tickets your way

### 💬 Internal Notes

Add private notes that customers never see. Perfect for team handoffs and context sharing.

### 📎 Attachments

Upload files with replies. Supports local storage or AWS S3 for cloud hosting.

### 🔌 Integrations

- **Webhooks** for automation (n8n, Zapier, Make.com)
- **REST API** for custom integrations
- **AI-ready** — Bring your own AI for response suggestions

### 👤 Customer Context Panel

Display rich customer information alongside every conversation. Connect to your ERP, CRM, or any data source to show order history, account details, subscription status, and more.

> **Need help integrating?** [Blue Leaf LLC](https://www.blle.co/box) builds custom integrations to pull data from your existing systems.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/bookatechie/support-inbox.git
cd support-inbox

# Install dependencies
npm install
cd src/client && npm install && cd ../..

# Configure your environment
cp .env.example .env
# Edit .env with your email credentials (IMAP/SMTP)

# Start development servers
npm run dev          # Backend (Terminal 1)
npm run dev:client   # Frontend (Terminal 2)

# Open http://localhost:3000
```

**Default login:** `admin@example.com` / `admin123` (configure in `.env` before first run)

---

## Deployment

### Production Build

```bash
npm run build
npm start
# Available at http://localhost:3001
```

### Cloud Hosting

Deploy to any Node.js-compatible platform:

- **DigitalOcean App Platform** — Connect your repo, auto-deploy on push
- **Railway** — Zero-config Node.js hosting
- **Render** — Free tier available for small teams
- **Fly.io** — Edge deployment with global distribution
- **Any VPS** — Ubuntu/Debian with Node.js 20+

> **Want us to handle deployment?** [Blue Leaf LLC](https://www.blle.co/box) provides fully managed hosting with security hardening, automatic backups, and ongoing maintenance.

### Systemd Service (VPS)

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

---

## API & Webhooks

### REST API

Generate a secure API key and add it to your `.env` file:

```bash
# Generate a secure key
openssl rand -base64 32

# Add to .env
INTERNAL_API_KEY=your-generated-key-here
```

Then authenticate requests with the `X-API-Key` header:

```bash
# Create a ticket
curl -X POST http://localhost:3001/tickets \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"subject": "Hello", "customer_email": "customer@example.com", "message_body": "Hi there"}'
```

### Webhooks

Configure `WEBHOOK_URL` to receive events:

- `new_ticket` — New ticket created
- `customer_reply` — Customer replied
- `new_reply` — Agent replied
- `ticket_update` — Status/priority/assignee changed

Build powerful automations with n8n, Zapier, or custom scripts.

> **Need automation expertise?** [Blue Leaf LLC](https://www.blle.co/box) builds custom workflows for auto-assignment, intelligent tagging, priority detection, and automated draft generation.

---

## Email Providers

Works with any IMAP/SMTP provider:

| Provider                | Status                       |
| ----------------------- | ---------------------------- |
| Gmail                   | ✅ Supported (app passwords) |
| Microsoft 365 / Outlook | ✅ Supported                 |
| Dreamhost / cPanel      | ✅ Supported                 |
| ProtonMail Bridge       | ✅ Supported                 |
| FastMail                | ✅ Supported                 |
| Any IMAP/SMTP           | ✅ Supported                 |

---

## Tech Stack

| Layer     | Technology                            |
| --------- | ------------------------------------- |
| Backend   | Node.js, Fastify, TypeScript          |
| Database  | PostgreSQL                            |
| Frontend  | React 19, Tailwind CSS, shadcn/ui     |
| Real-Time | Server-Sent Events (SSE)              |
| Email     | Nodemailer (SMTP), imap-simple (IMAP) |

---

## Managed Services

Don't want to manage infrastructure yourself? [Blue Leaf LLC](https://www.blle.co/box) offers complete Support Inbox implementation and hosting:

### 🚀 Deployment & Hosting

- Secure cloud deployment with SSL and backups
- Managed PostgreSQL database
- Ongoing maintenance and security updates
- 99.9% uptime SLA

### 🤖 AI-Powered Responses

- Connect to your FAQ and knowledge base for intelligent draft suggestions
- Customer context-aware responses using your CRM/ERP data
- Sentiment analysis and tone recommendations
- Works with OpenAI, Claude, or your preferred AI provider

### ⚙️ Automation & Workflows

- Auto-assignment rules based on ticket content, customer tier, or workload
- Intelligent tagging and categorization
- Priority detection for urgent issues
- Automated draft generation for common inquiries

### 🔗 Custom Integrations

- ERP/CRM data in the customer sidebar (order history, account status, etc.)
- Slack/Teams notifications for new tickets
- Two-way sync with your existing tools
- Custom API development

[View Pricing & Plans →](https://www.blle.co/box)

---

## FAQ

**Is this production-ready?**
Currently in active development. Core features work well, but expect updates.

**Do I need a separate database?**
Yes, PostgreSQL is required. We recommend managed database services (like DigitalOcean Managed Databases) for automatic backups and maintenance-free operation.

**How do I backup my data?**
Back up your PostgreSQL database and the `data/` folder (for local attachments).

**How much does it cost?**
Free and open source. Your only costs are hosting and email provider.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built for teams who value simplicity and ownership.</strong>
</p>
