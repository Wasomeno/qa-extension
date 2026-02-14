import { useState, useEffect, useCallback, useRef } from 'react';
import { QAAgent } from '@/agent/agent/qa-agent';
import { Message } from '../components/chat-message';
import { useSessionUser } from '@/hooks/use-session-user';

declare const __GOOGLE_API_KEY__: string;

export const useAgent = () => {
  const { user } = useSessionUser();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'assistant',
      content:
        "Hello! I'm your GitLab QA Agent. I can help you create issues, search projects, or answer questions about your repository.",
      timestamp: Date.now(),
    },
  ]);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const agentRef = useRef<QAAgent | null>(null);

  // Update initial message with user name found
  useEffect(() => {
    if (user?.name) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === 'init'
            ? {
                ...msg,
                content: `Hello ${user.name}! I'm your GitLab QA Agent. I can help you create issues, search projects, or answer questions about your repository. What can I help you with?`,
              }
            : msg
        )
      );
    }
  }, [user?.name]);

  // Initialize agent on mount
  useEffect(() => {
    if (!__GOOGLE_API_KEY__) {
      console.error('GOOGLE_API_KEY is not defined in the environment');
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'error',
          content:
            'Critical Error: GOOGLE_API_KEY is missing from build. Please contact support.',
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    try {
      agentRef.current = new QAAgent({
        googleApiKey: __GOOGLE_API_KEY__,
      });
    } catch (e) {
      console.error('Failed to initialize agent', e);
    }
  }, []);

  const sendMessage = async (content: string) => {
    if (!agentRef.current) {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'error',
          content: 'Agent is not initialized. Please check your settings.',
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsAgentLoading(true);

    let responseId = (Date.now() + 1).toString();
    let messageCreated = false;
    let currentContent = '';

    try {
      const stream = agentRef.current.chat(content);

      for await (const event of stream) {
        if (!messageCreated) {
          setIsAgentLoading(false);
          setMessages(prev => [
            ...prev,
            {
              id: responseId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
            },
          ]);
          messageCreated = true;
        }

        if (event.type === 'text') {
          currentContent = event.content;
          setMessages(prev =>
            prev.map(msg =>
              msg.id === responseId ? { ...msg, content: event.content } : msg
            )
          );
        } else if (event.type === 'tool_call') {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === responseId
                ? {
                    ...msg,
                    content:
                      currentContent + `\n\n_Calling tool: ${event.tool}..._`,
                  }
                : msg
            )
          );
        } else if (event.type === 'tool_result') {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === responseId
                ? {
                    ...msg,
                    content:
                      currentContent + `\n\n_Tool ${event.tool} completed._`,
                  }
                : msg
            )
          );
        } else if (event.type === 'error') {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === responseId
                ? {
                    ...msg,
                    role: 'error',
                    content: event.message,
                  }
                : msg
            )
          );
        }
      }
    } catch (error: any) {
      if (!messageCreated) {
        setMessages(prev => [
          ...prev,
          {
            id: responseId,
            role: 'error',
            content: `Error: ${error.message}`,
            timestamp: Date.now(),
          },
        ]);
      } else {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === responseId
              ? {
                  ...msg,
                  role: 'error',
                  content: `Error: ${error.message}`,
                }
              : msg
          )
        );
      }
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
