import { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '../components/chat-message';
import { MessageType } from '@/types/messages';
import { useStreamEvents, StreamEvent } from './use-stream-events';

interface UseAgentOptions {
  sessionId?: string;
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
}

export const useAgent = (options?: UseAgentOptions) => {
  const [messages, setMessages] = useState<Message[]>(
    options?.initialMessages || []
  );
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [sessionId] = useState(() => options?.sessionId || crypto.randomUUID());

  // Track which session is currently being processed for stream events
  const activeSessionIdRef = useRef<string | null>(null);

  // Store the callback in a ref to avoid dependency issues
  const onMessagesChangeRef = useRef(options?.onMessagesChange);
  onMessagesChangeRef.current = options?.onMessagesChange;

  // Track if this is the initial mount to avoid calling onMessagesChange on first render
  const isInitialMountRef = useRef(true);

  // Subscribe to stream events to update progress message dynamically
  // We don't filter by resourceId so we receive all events
  useStreamEvents({
    enabled: isAgentLoading,
    onEvent: (event: StreamEvent) => {
      // Update progress message for any agent event that has a meaningful message
      if (event.type === 'agent') {
        if (event.stage === 'start' || event.stage === 'thinking') {
          // Show actual progress message
          if (event.message && event.message !== 'Agent is processing...') {
            setProgressMessage(event.message);
          }
        }
        // For done stage, keep the current message briefly then it will be cleared by port
      }
    },
  });

  // Notify parent when messages change - but skip initial mount to avoid circular updates
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    
    // Call the ref-based callback to avoid dependency issues
    onMessagesChangeRef.current?.(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string, files: File[] = []) => {
      // Create attachment entries for files
      const attachments = files.map(file => ({
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
      }));

      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
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
    },
    [sessionId]
  );

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
