import React, { useRef, useEffect, useMemo } from 'react';
import { ChatMessage } from './components/chat-message';
import { ChatInput } from './components/chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Sparkles } from 'lucide-react';
import { useAgent } from './hooks/use-agent';
import { useNavigation } from '@/contexts/navigation-context';
import { motion, AnimatePresence } from 'framer-motion';

export const AgentPage: React.FC<{ portalContainer?: HTMLElement | null }> = ({
  portalContainer,
}) => {
  const { messages, isAgentLoading, sendMessage } = useAgent();
  const { current } = useNavigation();

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);

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
  }, [messages, isAgentLoading]);

  // Handle initial message from navigation
  useEffect(() => {
    const params = current.params as { initialMessage?: string };
    if (params?.initialMessage && !hasSentInitial.current && !isAgentLoading) {
      hasSentInitial.current = true;
      sendMessage(params.initialMessage);
    }
  }, [current.params, isAgentLoading, sendMessage]);

  return (
    <div className="flex flex-col h-full w-full bg-background relative">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-6 shrink-0 bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">QA Agent</h3>
          </div>
        </div>

      </div>

      <ScrollArea className="flex-1 w-full" ref={scrollRef}>
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col min-h-full justify-end">
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {messages.map(msg => (
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="w-full shrink-0">
        <div className="max-w-3xl mx-auto px-4 pb-6">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative"
          >
            <ChatInput onSend={(val) => sendMessage(val)} isLoading={isAgentLoading} />
            {!isAgentLoading && messages.length === 1 && (
              <div className="absolute -top-12 left-0 right-0 flex justify-center pointer-events-none">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-muted-foreground flex items-center gap-1.5 bg-background/50 px-3 py-1 rounded-full border shadow-sm"
                >
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span>
                    Try asking to list your projects or create an issue
                  </span>
                </motion.div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
