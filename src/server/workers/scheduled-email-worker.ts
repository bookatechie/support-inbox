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
    // Fetch only IDs to avoid holding all message bodies in memory at once
    const dueIds = await messageQueries.getScheduledDueIds();

    if (dueIds.length === 0) {
      logger?.debug('No scheduled messages due');
      return;
    }

    logger?.info(`Processing ${dueIds.length} scheduled message(s)`);

    for (let i = 0; i < dueIds.length; i++) {
      try {
        // Load full message one at a time so GC can reclaim between iterations
        const message = await messageQueries.getById(dueIds[i].id);
        if (!message) {
          logger?.error({ messageId: dueIds[i].id }, 'Scheduled message not found, skipping');
          continue;
        }
        // Skip if already sent (e.g. by a concurrent process or manual send)
        if (message.sent_at) continue;

        await sendScheduledMessage(message);
      } catch (error) {
        logger?.error(error, `Failed to send scheduled message #${dueIds[i].id}`);
      }

      // Add delay between sends to avoid rate limits (skip after last message)
      if (i < dueIds.length - 1) {
        await sleep(SEND_DELAY_MS);
      }
    }
  } catch (error) {
    logger?.error(error, 'Error checking scheduled messages');
  }
}
