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
 * Events are filtered server-side by resourceId and type if provided.
 */
export const useStreamEvents = (options: UseStreamEventsOptions = {}) => {
  const { resourceId, type, onEvent, enabled = true } = options;
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Get session ID from cookie
  useEffect(() => {
    // Use chrome.cookies API to get session_id from the backend domain
    chrome.cookies.get({
      url: 'https://playground-qa-extension.online',
      name: 'session_id',
    }).then(cookie => {
      if (cookie?.value) {
        setSessionId(cookie.value);
      }
    }).catch(err => {
      console.log('[useStreamEvents] Failed to get cookie:', err);
    });
  }, []);

  const connect = useCallback(() => {
    if (!sessionId) {
      console.log('[useStreamEvents] No session ID available, skipping connection');
      return;
    }

    // Build URL with optional filters and session_id for auth
    const params = new URLSearchParams();
    params.set('session_id', sessionId);
    if (resourceId) params.set('resourceId', resourceId);
    if (type) params.set('type', type);

    const url = `https://playground-qa-extension.online/api/stream?${params.toString()}`;
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
        onEventRef.current?.(data);
      } catch (e) {
        console.error('[useStreamEvents] Failed to parse event:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[useStreamEvents] SSE error:', error);
      // EventSource will automatically attempt to reconnect
    };
  }, [sessionId, resourceId, type]);

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