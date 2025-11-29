/**
 * SSE (Server-Sent Events) hook for real-time updates
 * Connects to /api/events and handles all real-time event types
 */

import { useEffect, useRef, useCallback } from 'react';
import type { SSEEvent } from '@/types';

type EventHandler = (event: SSEEvent) => void;

interface UseSSEOptions {
  onEvent?: EventHandler;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useSSE({
  onEvent,
  onConnect,
  onDisconnect,
  onError,
  autoReconnect = true,
  reconnectInterval = 3000,
}: UseSSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isIntentionalCloseRef = useRef(false);

  // Store latest callbacks in refs so they're always current
  const onEventRef = useRef(onEvent);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onEventRef.current = onEvent;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onEvent, onConnect, onDisconnect, onError]);

  const connect = useCallback(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      console.warn('No auth token found, cannot connect to SSE');
      return;
    }

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Reset intentional close flag when connecting
    isIntentionalCloseRef.current = false;

    // Create new EventSource connection
    const url = `/api/events?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connection established');

      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      onConnectRef.current?.();
    };

    // Handle unnamed messages (like the initial connected event)
    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;

        // Ignore heartbeat messages
        if (event.type === 'heartbeat') {
          return;
        }

        onEventRef.current?.(event);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    // Handle named events (new-message, ticket-update, etc.)
    const handleNamedEvent = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        const event: SSEEvent = {
          type: e.type as SSEEvent['type'],
          data: payload.data
        };
        onEventRef.current?.(event);
      } catch (error) {
        console.error('Failed to parse named SSE message:', error);
      }
    };

    // Listen for all the specific event types
    eventSource.addEventListener('new-ticket', handleNamedEvent);
    eventSource.addEventListener('ticket-update', handleNamedEvent);
    eventSource.addEventListener('new-message', handleNamedEvent);
    eventSource.addEventListener('message-deleted', handleNamedEvent);
    eventSource.addEventListener('viewer-joined', handleNamedEvent);
    eventSource.addEventListener('viewer-left', handleNamedEvent);
    eventSource.addEventListener('user-composing', handleNamedEvent);

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      onErrorRef.current?.(error);

      // Close the errored connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      onDisconnectRef.current?.();

      // Attempt to reconnect if not intentionally closed
      if (autoReconnect && !isIntentionalCloseRef.current) {
        console.log(`SSE disconnected, reconnecting in ${reconnectInterval}ms...`);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log('Attempting to reconnect SSE...');
          connect();
        }, reconnectInterval);
      }
    };
  }, [autoReconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    isIntentionalCloseRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    onDisconnectRef.current?.();
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only connect once on mount

  return {
    connect,
    disconnect,
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN,
  };
}
