import { useEffect, useRef, useCallback, useState } from 'react';

export interface StreamEvent {
  type: string;
  resourceType?: string;
  resourceId?: string;
  stage: string;
  message: string;
  stepInfo?: {
    currentStep: number;
    totalSteps: number;
    stepName: string;
    action?: string;
  };
  timestamp: string;
}

type StreamEventHandler = (event: StreamEvent) => void;

interface UseStreamEventsOptions {
  resourceId?: string;
  type?: string;
  onEvent?: StreamEventHandler;
  enabled?: boolean;
}

/**
 * Subscribes to the unified SSE stream endpoint and calls onEvent for each event.
 */
export const useStreamEvents = (options: UseStreamEventsOptions = {}) => {
  const { resourceId, type, onEvent, enabled = true } = options;
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    // Build URL with optional filters - endpoint is public (no auth needed)
    const params = new URLSearchParams();
    if (resourceId) params.set('resourceId', resourceId);
    if (type) params.set('type', type);

    const url = `https://playground-qa-extension.online/api/stream${params.toString() ? `?${params.toString()}` : ''}`;
    console.log('[useStreamEvents] Connecting to:', url);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[useStreamEvents] SSE connection opened');
    };

    eventSource.onmessage = (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        console.log('[useStreamEvents] Received event:', data);
        if (onEventRef.current) {
          onEventRef.current(data);
        }
      } catch (e) {
        console.warn('[useStreamEvents] Failed to parse event:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.warn('[useStreamEvents] SSE error:', error);
    };
  }, [resourceId, type]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('[useStreamEvents] Disconnecting SSE');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    connect();

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    disconnect,
    reconnect: connect,
  };
};

export default useStreamEvents;