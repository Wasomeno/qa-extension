import { useState, useEffect } from 'react';
import { Message } from '../components/chat-message';
import { useSessionUser } from '@/hooks/use-session-user';
import { MessageType } from '@/types/messages';

export const useAgent = () => {
  const { user } = useSessionUser();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'assistant',
      content:
        "Hello! I'm your QA Assistant. I can help you manage GitLab issues, browse projects, and run your recorded automation tests. What can I help you with?",
      timestamp: Date.now(),
    },
  ]);

  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());

  // Update initial message with user name found
  useEffect(() => {
    if (user?.name) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === 'init'
            ? {
                ...msg,
                content: `Hello ${user.name}! I'm your QA Assistant. I can help you manage GitLab issues, browse projects, and run your recorded automation tests. What can I help you with?`,
              }
            : msg
        )
      );
    }
  }, [user?.name]);

  const sendMessage = async (content: string, _files: File[] = []) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsAgentLoading(true);
    setProgressMessage('Agent is thinking...');

    const responseId = (Date.now() + 1).toString();

    try {
      const port = chrome.runtime.connect({ name: 'agent-chat-sse' });

      port.onMessage.addListener(msg => {
        const { event, data } = msg;
        console.log(`[useAgent] Received Port Event: "${event}"`, data);

        console.log('EVENT MESSAGe', msg);
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
    }
  };

  return {
    messages,
    isAgentLoading,
    progressMessage,
    sendMessage,
  };
};
