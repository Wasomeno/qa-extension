import { useState, useEffect, useCallback } from 'react';
import { Message } from '../components/chat-message';

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'qa-agent-chat-sessions';
const MAX_SESSIONS = 50;

export const useChatSessions = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSessions(parsed.sessions || []);
        setCurrentSessionId(parsed.currentSessionId || null);
      }
    } catch (error) {
      console.error('[useChatSessions] Error loading sessions:', error);
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sessions, currentSessionId })
      );
    } catch (error) {
      console.error('[useChatSessions] Error saving sessions:', error);
    }
  }, [sessions, currentSessionId]);

  // Create a new session
  const createSession = useCallback((): ChatSession => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setSessions(prev => {
      const updated = [newSession, ...prev];
      return updated.slice(0, MAX_SESSIONS);
    });
    setCurrentSessionId(newSession.id);

    return newSession;
  }, []);

  // Load an existing session
  const loadSession = useCallback((sessionId: string): ChatSession | null => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSessionId(sessionId);
      return session;
    }
    return null;
  }, [sessions]);

  // Save current session messages
  const saveSession = useCallback(
    (sessionId: string, messages: Message[]) => {
      setSessions(prev =>
        prev.map(s => {
          if (s.id === sessionId) {
            // Generate title from first user message if still default
            let title = s.title;
            if (title === 'New Chat' && messages.length > 0) {
              const firstUserMsg = messages.find(m => m.role === 'user');
              if (firstUserMsg) {
                title =
                  firstUserMsg.content.slice(0, 50) +
                  (firstUserMsg.content.length > 50 ? '...' : '');
              }
            }
            return {
              ...s,
              messages,
              title,
              updatedAt: Date.now(),
            };
          }
          return s;
        })
      );
    },
    []
  );

  // Delete a session
  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    setCurrentSessionId(prev => (prev === sessionId ? null : prev));
  }, []);

  // Clear current session
  const clearCurrentSession = useCallback(() => {
    setCurrentSessionId(null);
  }, []);

  // Get current session
  const getCurrentSession = useCallback((): ChatSession | null => {
    if (!currentSessionId) return null;
    return sessions.find(s => s.id === currentSessionId) || null;
  }, [currentSessionId, sessions]);

  return {
    sessions,
    currentSessionId,
    createSession,
    loadSession,
    saveSession,
    deleteSession,
    clearCurrentSession,
    getCurrentSession,
  };
};
