import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useNavigation } from '@/contexts/navigation-context';
import { useChatSessions, ChatSession } from './hooks/use-chat-sessions';
import { useAgent } from './hooks/use-agent';
import { ChatMessage, Message } from './components/chat-message';
import { ChatInput } from './components/chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface ChatViewPageProps {
  sessionId: string;
}

export const ChatViewPage: React.FC<ChatViewPageProps> = ({ sessionId }) => {
  const { pop } = useNavigation();
  const { sessions, loadSession, saveSession } = useChatSessions();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Get session
  const session = sessions.find((s: ChatSession) => s.id === sessionId);
  
  // Initialize agent hook with session messages
  const {
    messages,
    isAgentLoading,
    progressMessage,
    sendMessage,
    resetMessages,
  } = useAgent({
    sessionId,
    initialMessages: session?.messages || [],
    onMessagesChange: useCallback(
      (msgs: Message[]) => {
        if (sessionId && msgs.length > 0) {
          saveSession(sessionId, msgs);
        }
      },
      [sessionId, saveSession]
    ),
  });

  // Load the session when component mounts
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isAgentLoading, progressMessage]);

  // Check if there are any user messages
  const hasUserMessages = useMemo(() => {
    return messages.some((msg: Message) => msg.role === 'user');
  }, [messages]);

  // Handle back
  const handleBack = () => {
    pop();
  };

  // Handle send message using the hook's sendMessage
  const handleSendMessage = useCallback(
    async (value: string, files?: File[]) => {
      if (!value.trim() && (!files || files.length === 0)) return;
      await sendMessage(value, files);
    },
    [sendMessage]
  );

  if (!session) {
    return (
      <div className="flex flex-col h-full w-full bg-background items-center justify-center">
        <p className="text-muted-foreground">Session not found</p>
        <Button onClick={handleBack} className="mt-4">
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background relative">
      {/* Floating Back Button */}
      <button
        type="button"
        className="absolute top-4 left-4 h-12 w-12 z-50 flex items-center justify-center rounded-md opacity-40 hover:opacity-100 transition-opacity"
        onClick={handleBack}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      {/* Session Title */}
      <div className="absolute top-4 left-16 right-4 z-40 flex items-center">
        <h2 className="text-sm font-medium truncate max-w-[calc(100%-8rem)]">
          {session.title}
        </h2>
      </div>

      <ScrollArea className="flex-1 w-full" ref={scrollRef}>
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col min-h-full justify-end">
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {messages.map((msg: Message) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {isAgentLoading && (
                <motion.div
                  key="loading-indicator"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    height: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    marginTop: 0,
                    marginBottom: 0,
                    overflow: 'hidden',
                    transition: { duration: 0.15 },
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className="flex w-full gap-3 py-4"
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 relative">
                    <Bot className="h-5 w-5 text-primary" />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                      transition={{
                        repeat: Infinity,
                        duration: 2,
                        ease: 'easeInOut',
                      }}
                      className="absolute inset-0 rounded-full bg-primary/20"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-1.5 px-4 py-3 bg-muted/40 backdrop-blur-sm rounded-2xl rounded-tl-none border shadow-sm">
                      <motion.div
                        animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: 0,
                          ease: 'easeInOut',
                        }}
                        className="w-1.5 h-1.5 bg-primary/60 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: 0.15,
                          ease: 'easeInOut',
                        }}
                        className="w-1.5 h-1.5 bg-primary/60 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                        transition={{
                          repeat: Infinity,
                          duration: 1.2,
                          delay: 0.3,
                          ease: 'easeInOut',
                        }}
                        className="w-1.5 h-1.5 bg-primary/60 rounded-full"
                      />
                    </div>
                    {progressMessage && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[10px] text-muted-foreground px-1 font-medium italic"
                      >
                        {progressMessage}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="w-full shrink-0">
        <div className="max-w-3xl mx-auto px-4 pb-6">
          <div className="relative">
            <ChatInput
              onSend={handleSendMessage}
              isLoading={isAgentLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};