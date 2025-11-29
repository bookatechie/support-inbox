/**
 * Scheduled email worker - polls for due scheduled messages and sends them
 */

import type { FastifyBaseLogger } from 'fastify';
import { messageQueries } from '../lib/database-pg.js';
import { sendScheduledMessage } from '../lib/ticket.js';

let isRunning = false;
let pollInterval: NodeJS.Timeout | null = null;
let logger: FastifyBaseLogger | null = null;

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Start scheduled email worker
 */
export function startScheduledEmailWorker(log: FastifyBaseLogger): void {
  logger = log;

  if (isRunning) {
    logger.info('Scheduled email worker already running');
    return;
  }

  isRunning = true;
  logger.info(`Starting scheduled email worker (polling every 10 minutes)`);

  // Initial check
  processScheduledMessages();

  // Set up interval
  pollInterval = setInterval(processScheduledMessages, POLL_INTERVAL_MS);
}

/**
 * Stop scheduled email worker
 */
export function stopScheduledEmailWorker(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  isRunning = false;
  logger?.info('Scheduled email worker stopped');
}

/**
 * Process all due scheduled messages
 */
async function processScheduledMessages(): Promise<void> {
  try {
    const dueMessages = await messageQueries.getScheduledDue();

    if (dueMessages.length === 0) {
      logger?.debug('No scheduled messages due');
      return;
    }

    logger?.info(`Processing ${dueMessages.length} scheduled message(s)`);

    for (const message of dueMessages) {
      try {
        await sendScheduledMessage(message);
      } catch (error) {
        logger?.error(error, `Failed to send scheduled message #${message.id}`);
      }
    }
  } catch (error) {
    logger?.error(error, 'Error checking scheduled messages');
  }
}
