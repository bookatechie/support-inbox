/**
 * Support Inbox - Main Entry Point
 * Starts Fastify server, email daemon, and initializes all services
 */

import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// Import components
import { ensureDefaultUser, setDatabaseLogger, testDatabaseConnection } from "./lib/database-pg.js";
import { setLogger, setSseEmitter } from "./lib/ticket.js";
import { sseEmitter, closeAllConnections } from "./api/sse.js";
import { startEmailDaemon, stopEmailDaemon } from "./workers/email-daemon.js";
import { startScheduledEmailWorker, stopScheduledEmailWorker } from "./workers/scheduled-email-worker.js";
import { verifyEmailConnection, setEmailSenderLogger } from "./lib/email-sender.js";
import { setFileStorageLogger, initFileStorage } from "./lib/file-storage.js";
import { setWebhookLogger } from "./lib/webhook.js";
import apiRoutes from "./api/routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "3001");

// ============================================================================
// Create Fastify Instance
// ============================================================================

const fastify = Fastify({
  logger:
    process.env.NODE_ENV === "production"
      ? true
      : {
          transport: {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          },
        },
  disableRequestLogging: false,
  requestIdLogLabel: "reqId",
});

// ============================================================================
// Error Handler
// ============================================================================

fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error, "Unhandled error");
  reply.status(500).send({ error: "Internal server error" });
});

// ============================================================================
// Initialize Services
// ============================================================================

async function initialize() {
  fastify.log.info("=".repeat(60));
  fastify.log.info("Support Inbox - Starting...");
  fastify.log.info("=".repeat(60));

  // 1. Initialize loggers for all modules
  const log = fastify.log;
  setDatabaseLogger(log);
  setLogger(log);
  setEmailSenderLogger(log);
  setFileStorageLogger(log);
  setWebhookLogger(log);

  // 2. Test database connection (now that logger is set)
  testDatabaseConnection();

  // 3. Initialize file storage (logs configuration)
  initFileStorage();

  // 4. Ensure database has default user
  ensureDefaultUser();

  // 5. Connect SSE emitter to ticket module
  setSseEmitter(sseEmitter);

  // 6. Verify SMTP connection
  fastify.log.info("Verifying SMTP connection...");
  const smtpOk = await verifyEmailConnection();
  if (smtpOk) {
    fastify.log.info("✓ SMTP connection verified");
  } else {
    fastify.log.warn("✗ SMTP connection failed - check configuration");
  }

  // 7. Start email daemon (if configured)
  if (process.env.IMAP_USER && process.env.IMAP_PASSWORD) {
    fastify.log.info("Starting email daemon...");
    startEmailDaemon(fastify.log);
    fastify.log.info("✓ Email daemon started");
  } else {
    fastify.log.warn("⚠️  Email daemon not started (IMAP credentials missing)");
    fastify.log.warn(
      "   Set IMAP_USER and IMAP_PASSWORD to enable email polling"
    );
  }

  // 8. Start scheduled email worker
  fastify.log.info("Starting scheduled email worker...");
  startScheduledEmailWorker(fastify.log);
  fastify.log.info("✓ Scheduled email worker started");

  fastify.log.info("=".repeat(60));
}

// ============================================================================
// Start Server
// ============================================================================

// Graceful Shutdown
const closeGracefully = async (signal: string) => {
  fastify.log.info(`${signal} received, shutting down gracefully...`);

  // Set a timeout to force exit if graceful shutdown hangs
  const forceExitTimeout = setTimeout(() => {
    fastify.log.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 5000);

  try {
    // Stop email daemon
    fastify.log.info("Stopping email daemon...");
    stopEmailDaemon();

    // Stop scheduled email worker
    fastify.log.info("Stopping scheduled email worker...");
    stopScheduledEmailWorker();

    // Close all SSE connections first
    fastify.log.info("Closing SSE connections...");
    closeAllConnections();

    // Close Fastify server (closes all connections)
    fastify.log.info("Closing server connections...");
    await fastify.close();

    clearTimeout(forceExitTimeout);
    fastify.log.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    fastify.log.error(error, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => closeGracefully("SIGTERM"));
process.on("SIGINT", () => closeGracefully("SIGINT"));

// Global error handlers to prevent crashes from uncaught errors
// This catches errors from libraries like 'imap' that throw uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  fastify.log.error({ err: error.message, stack: error.stack }, "Uncaught exception (handled - not crashing)");
});

process.on("unhandledRejection", (reason: unknown) => {
  fastify.log.error({ reason }, "Unhandled promise rejection (handled - not crashing)");
});

// ============================================================================
// Start Server Function
// ============================================================================

async function start() {
  try {
    // ============================================================================
    // Middleware Plugins
    // ============================================================================

    // Security
    await fastify.register(helmet, {
      contentSecurityPolicy: false, // Allow inline scripts for dev
    });

    // CORS
    await fastify.register(cors, {
      origin: "*",
      credentials: true,
    });

    // Compression
    await fastify.register(compress);

    // ============================================================================
    // API Routes
    // ============================================================================

    await fastify.register(apiRoutes, { prefix: "/api" });

    // ============================================================================
    // Serve Frontend (if built)
    // ============================================================================

    const clientPath = path.join(__dirname, "../client");

    // Only serve static files if client directory exists
    if (existsSync(clientPath)) {
      // Serve static files
      await fastify.register(fastifyStatic, {
        root: clientPath,
        prefix: "/",
      });

      // SPA fallback - serve index.html for all non-API routes
      fastify.setNotFoundHandler((request, reply) => {
        // Only serve index.html for non-API routes
        if (!request.url.startsWith("/api")) {
          reply.sendFile("index.html", clientPath);
        } else {
          reply.status(404).send({ error: "Not found" });
        }
      });
    } else {
      fastify.log.warn(
        `Client directory not found at ${clientPath}. Frontend will not be served.`
      );
    }

    // ============================================================================
    // Start Listening
    // ============================================================================

    // Wait for all plugins to be ready
    await fastify.ready();

    // Initialize services before listening
    await initialize();

    // Start listening
    await fastify.listen({ port: PORT, host: "0.0.0.0" });

    fastify.log.info(`
╔═══════════════════════════════════════════════════════════╗
║                   SUPPORT INBOX                           ║
║                   Running on port ${PORT}                    ║
╚═══════════════════════════════════════════════════════════╝

  API:      http://localhost:${PORT}/api
  Frontend: http://localhost:${PORT}
  Status:   http://localhost:${PORT}/api/status
  SSE:      http://localhost:${PORT}/api/events

  Environment: ${process.env.NODE_ENV || "development"}
  Database:    PostgreSQL (${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB})

`);

    fastify.log.info("Ready to accept requests!");
  } catch (err) {
    fastify.log.error(err, "Fatal error during startup");
    process.exit(1);
  }
}

// Start the server
start();
