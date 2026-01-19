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
const SEND_DELAY_MS = 1000; // 1 second delay between sends to avoid rate limits

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

    for (let i = 0; i < dueMessages.length; i++) {
      const message = dueMessages[i];
      try {
        await sendScheduledMessage(message);
      } catch (error) {
        logger?.error(error, `Failed to send scheduled message #${message.id}`);
      }

      // Add delay between sends to avoid rate limits (skip after last message)
      if (i < dueMessages.length - 1) {
        await sleep(SEND_DELAY_MS);
      }
    }
  } catch (error) {
    logger?.error(error, 'Error checking scheduled messages');
  }
}
