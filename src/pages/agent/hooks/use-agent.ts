import { useState, useEffect } from 'react';
import { Message } from '../components/chat-message';
import { useSessionUser } from '@/hooks/use-session-user';
import { api } from '@/services/api';

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

  const sendMessage = async (content: string, files: File[] = []) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsAgentLoading(true);

    const responseId = (Date.now() + 1).toString();

    try {
      const response = await api.post<any>('/agent/chat', {
        body: JSON.stringify({ session_id: sessionId, input: content }),
      });

      if (response.success && response.data) {
        setMessages(prev => [
          ...prev,
          {
            id: responseId,
            role: 'assistant',
            content:
              response.data.response || response.data.content || response.data,
            timestamp: Date.now(),
          },
        ]);
      } else {
        throw new Error(response.error || 'Failed to get response from agent');
      }
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
    } finally {
      setIsAgentLoading(false);
    }
  };

  return {
    messages,
    isAgentLoading,
    sendMessage,
  };
};
