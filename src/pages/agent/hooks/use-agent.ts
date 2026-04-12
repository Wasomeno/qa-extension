import { useState, useCallback, useEffect, useRef } from 'react';
import { Message } from '../components/chat-message';
import { MessageType } from '@/types/messages';
import { useStreamEvents, StreamEvent } from './use-stream-events';

interface UseAgentOptions {
  sessionId?: string;
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
}

export const useAgent = (options?: UseAgentOptions) => {
  const [messages, setMessages] = useState<Message[]>(options?.initialMessages || []);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [sessionId] = useState(
    () => options?.sessionId || crypto.randomUUID()
  );

  // Track which session is currently being processed for stream events
  const activeSessionIdRef = useRef<string | null>(null);

  // Subscribe to stream events to update progress message dynamically
  // We don't filter by resourceId so we receive all events
  useStreamEvents({
    enabled: isAgentLoading,
    onEvent: useCallback((event: StreamEvent) => {
      // Only process thinking/stage events during agent processing
      if (event.type === 'agent' && event.stage === 'thinking') {
        // Update progress message with actual server-side status
        if (event.message && event.message !== '[Agent completed]') {
          setProgressMessage(event.message);
        }
      }
      // Handle done/error stages
      if (event.type === 'agent' && (event.stage === 'done' || event.stage === 'error')) {
        // The final event will come through the SSE port connection
        // This just helps keep UI in sync
      }
    }, []),
  });

  // Notify parent when messages change
  useEffect(() => {
    options?.onMessagesChange?.(messages);
  }, [messages, options]);

  const sendMessage = useCallback(async (content: string, _files: File[] = []) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsAgentLoading(true);
    setProgressMessage('Agent is thinking...');
    activeSessionIdRef.current = sessionId;

    const responseId = (Date.now() + 1).toString();

    try {
      const port = chrome.runtime.connect({ name: 'agent-chat-sse' });

      port.onMessage.addListener(msg => {
        const { event, data } = msg;
        console.log(`[useAgent] Received Port Event: "${event}"`, data);

        switch (event) {
          case 'progress':
            if (data && data.message) {
              console.log(`[useAgent] Progress update: ${data.message}`);
              setProgressMessage(data.message);
            }
            break;

          case 'final':
            console.log('[useAgent] Final response received. Data:', data);
            setIsAgentLoading(false);
            setProgressMessage(null);
            activeSessionIdRef.current = null;

            const content =
              data?.content ||
              data?.response ||
              (typeof data === 'string' ? data : null);

            if (content) {
              setMessages(prev => [
                ...prev,
                {
                  id: responseId,
                  role: 'assistant',
                  content: content,
                  timestamp: Date.now(),
                },
              ]);
            } else {
              console.warn(
                '[useAgent] Final event received but no content found in data'
              );
            }

            console.log('[useAgent] Disconnecting port after final event');
            port.disconnect();
            break;

          case 'heartbeat':
            console.log('[useAgent] Heartbeat received');
            break;

          case 'message':
            console.log(
              '[useAgent] Raw message event received (unexpected for this backend):',
              data
            );
            break;

          case 'error':
            console.error('[useAgent] Error event received:', data);
            setIsAgentLoading(false);
            setProgressMessage(null);
            activeSessionIdRef.current = null;
            setMessages(prev => [
              ...prev,
              {
                id: responseId,
                role: 'error',
                content: `Error: ${data?.message || data || 'Unknown error'}`,
                timestamp: Date.now(),
              },
            ]);
            port.disconnect();
            break;

          default:
            console.log(`[useAgent] Unhandled event type: ${event}`);
        }
      });

      port.onDisconnect.addListener(() => {
        console.log('[useAgent] Port disconnected');
        setIsAgentLoading(current => {
          if (current) {
            console.log(
              '[useAgent] Port disconnected while loading, clearing loading state'
            );
            setProgressMessage(null);
            activeSessionIdRef.current = null;
            return false;
          }
          return current;
        });
      });

      port.postMessage({
        type: MessageType.AGENT_CHAT_SSE,
        data: { input: content, session_id: sessionId },
      });
    } catch (error: any) {
      setMessages(prev => [
        ...prev,
        {
          id: responseId,
          role: 'error',
          content: `Error: ${error.message}`,
          timestamp: Date.now(),
        },
      ]);
      setIsAgentLoading(false);
      setProgressMessage(null);
      activeSessionIdRef.current = null;
    }
  }, [sessionId]);

  // Reset messages
  const resetMessages = useCallback((newMessages?: Message[]) => {
    setMessages(newMessages || []);
  }, []);

  return {
    messages,
    isAgentLoading,
    progressMessage,
    sendMessage,
    resetMessages,
    sessionId,
  };
};
