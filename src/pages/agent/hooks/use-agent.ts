import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '../components/chat-message';
import { useSessionUser } from '@/hooks/use-session-user';
import { uploadService } from '@/services/upload';
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
  const portRef = useRef<chrome.runtime.Port | null>(null);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (portRef.current) {
        portRef.current.disconnect();
      }
    };
  }, []);

  const sendMessage = async (content: string, files: File[] = []) => {
    const fileToData = async (file: File): Promise<{ mimeType: string; data: string; url: string }> => {
      // 1. Upload to R2 for persistence
      const fileName = `${Date.now()}-${file.name}`;
      const url = await uploadService.uploadFile(file, fileName);
      
      // 2. Convert to base64 for Gemini
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ mimeType: file.type, data: base64, url });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments: files.map(f => ({ name: f.name, type: f.type })),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsAgentLoading(true);

    let responseId = (Date.now() + 1).toString();
    let messageCreated = false;

    try {
      // Process files if any
      const processedFiles = await Promise.all(files.map(fileToData));

      // Update user message with URLs
      setMessages(prev =>
        prev.map(msg =>
          msg.id === userMsg.id
            ? {
                ...msg,
                attachments: processedFiles.map((pf, i) => ({
                  name: files[i].name,
                  type: pf.mimeType,
                  url: pf.url,
                })),
              }
            : msg
        )
      );

      // Connect to background agent via Port
      const port = chrome.runtime.connect({ name: 'agent-chat' });
      portRef.current = port;

      port.onMessage.addListener((event) => {
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
                    activities: [
                      ...(msg.activities || []),
                      { id: event.id, tool: event.tool, status: 'running' },
                    ],
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
                    activities: (msg.activities || []).map(a =>
                      a.id === event.id
                        ? { ...a, status: 'completed', result: event.result }
                        : a
                    ),
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
        } else if (event.type === 'done') {
          setIsAgentLoading(false);
        }
      });

      port.onDisconnect.addListener(() => {
        setIsAgentLoading(false);
        portRef.current = null;
      });

      port.postMessage({
        type: MessageType.AGENT_CHAT,
        data: {
          content,
          attachments: processedFiles.map(pf => ({
            mimeType: pf.mimeType,
            data: pf.data,
          })),
        },
      });

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
      setIsAgentLoading(false);
    }
  };

  return {
    messages,
    isAgentLoading,
    sendMessage,
  };
};
