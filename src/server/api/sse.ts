/**
 * Server-Sent Events (SSE) for real-time updates
 */

import { EventEmitter } from 'events';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Ticket, Message, SSEEventType } from '../lib/types.js';
import type { Socket } from 'net';

// Global event emitter for SSE events
export const sseEmitter = new EventEmitter();

// Track connected clients with their request logger
const clients: Map<FastifyReply, FastifyRequest['log']> = new Map();

// Max write buffer size before we consider a client slow (64KB).
// Beyond this, events are dropped for that client to prevent heap growth.
const MAX_WRITE_BUFFER_SIZE = 64 * 1024;

/**
 * Check if a client's socket write buffer is backed up (slow consumer)
 */
function isClientBackpressured(reply: FastifyReply): boolean {
  const socket = reply.raw.socket as Socket | null;
  if (!socket || socket.destroyed) return true;
  return socket.writableLength > MAX_WRITE_BUFFER_SIZE;
}

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
      // If client's write buffer is backed up, disconnect it
      // to prevent unbounded memory growth
      if (isClientBackpressured(reply)) {
        request.log.warn({ clientCount: clients.size }, 'SSE client backpressured, disconnecting');
        clearInterval(heartbeat);
        clients.delete(reply);
        try { reply.raw.end(); } catch { /* already closed */ }
        return;
      }
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
 * Broadcast event to all connected clients.
 * Skips clients with backed-up write buffers to prevent memory growth.
 */
function broadcast(event: SSEEventType, data: unknown): void {
  if (clients.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify({ type: event, data })}\n\n`;
  let successCount = 0;

  clients.forEach((logger, client) => {
    // Skip backpressured clients — drop the event rather than buffer it
    if (isClientBackpressured(client)) {
      return;
    }

    try {
      client.raw.write(payload);
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
}
