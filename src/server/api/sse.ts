/**
 * Server-Sent Events (SSE) for real-time updates
 */

import { EventEmitter } from 'events';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Ticket, Message, SSEEventType } from '../lib/types.js';

// Global event emitter for SSE events
export const sseEmitter = new EventEmitter();

// Track connected clients with their request logger
const clients: Map<FastifyReply, FastifyRequest['log']> = new Map();

/**
 * SSE endpoint handler
 */
export function handleSSE(request: FastifyRequest, reply: FastifyReply): void {
  // Set SSE headers
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection event
  reply.raw.write('data: {"type":"connected"}\n\n');

  // Add client to map with its logger
  clients.set(reply, request.log);
  request.log.info({ clientCount: clients.size }, 'SSE client connected');

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(':heartbeat\n\n');
    } catch (error) {
      clearInterval(heartbeat);
      clients.delete(reply);
    }
  }, 30000);

  // Clean up on disconnect
  request.raw.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(reply);
    request.log.info({ clientCount: clients.size }, 'SSE client disconnected');
  });
}

/**
 * Broadcast event to all connected clients
 */
function broadcast(event: SSEEventType, data: any): void {
  const payload = JSON.stringify({ type: event, data });
  let successCount = 0;

  clients.forEach((logger, client) => {
    try {
      client.raw.write(`event: ${event}\n`);
      client.raw.write(`data: ${payload}\n\n`);
      successCount++;
    } catch (error) {
      logger.error(error, 'Error broadcasting to client');
      clients.delete(client);
    }
  });

  // Log broadcast if we have clients
  if (successCount > 0) {
    const firstLogger = clients.values().next().value;
    if (firstLogger) {
      firstLogger.info({ event, clientCount: successCount }, 'Broadcasted SSE event');
    }
  }
}

// Event handlers
sseEmitter.on('new-ticket', (ticket: Ticket) => {
  broadcast('new-ticket', ticket);
});

sseEmitter.on('ticket-update', (ticket: Ticket) => {
  broadcast('ticket-update', ticket);
});

sseEmitter.on('new-message', (data: { ticketId: number; message: Message }) => {
  broadcast('new-message', data);
});

sseEmitter.on('message-deleted', (data: { ticketId: number; messageId: number }) => {
  broadcast('message-deleted', data);
});

sseEmitter.on('viewer-joined', (data: { ticketId: number; userEmail: string; userName: string }) => {
  broadcast('viewer-joined', data);
});

sseEmitter.on('viewer-left', (data: { ticketId: number; userEmail: string }) => {
  broadcast('viewer-left', data);
});

sseEmitter.on('user-composing', (data: { ticketId: number; userEmail: string; userName: string }) => {
  broadcast('user-composing', data);
});

/**
 * Get count of connected clients
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Close all SSE connections
 */
export function closeAllConnections(): void {
  clients.forEach((logger, client) => {
    try {
      client.raw.end();
    } catch (error) {
      logger.error(error, 'Error closing client connection');
    }
  });
  clients.clear();

  // Log to first logger if available
  const firstLogger = clients.values().next().value;
  if (firstLogger) {
    firstLogger.info('All SSE connections closed');
  }
}
