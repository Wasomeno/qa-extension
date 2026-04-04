import React, { useRef, useEffect, useMemo } from 'react';
import { ChatMessage } from './components/chat-message';
import { ChatInput } from './components/chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Sparkles, MessageSquare } from 'lucide-react';
import { useAgent } from './hooks/use-agent';
import { useNavigation } from '@/contexts/navigation-context';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export const AgentPage: React.FC<{ portalContainer?: HTMLElement | null }> = ({
  portalContainer,
}) => {
  const { messages, isAgentLoading, sendMessage, progressMessage } = useAgent();
  const { current } = useNavigation();

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);

  // Check if there are any user messages
  const hasUserMessages = useMemo(() => {
    return messages.some(msg => msg.role === 'user');
  }, [messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current && hasUserMessages) {
      const scrollContainer = scrollRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isAgentLoading, progressMessage, hasUserMessages]);

  // Handle initial message from navigation
  useEffect(() => {
    const params = current.params as { initialMessage?: string };
    if (params?.initialMessage && !hasSentInitial.current && !isAgentLoading) {
      hasSentInitial.current = true;
      sendMessage(params.initialMessage);
    }
  }, [current.params, isAgentLoading, sendMessage]);

  // Example prompts for the welcome page
  const examplePrompts = [
    {
      label: 'List my projects',
      prompt: 'List all my projects',
      icon: MessageSquare,
    },
    {
      label: 'Create an issue',
      prompt: 'Create a new issue for my project',
      icon: MessageSquare,
    },
    {
      label: 'Run tests',
      prompt: 'Run my recorded automation tests',
      icon: MessageSquare,
    },
    {
      label: 'Help me with...',
      prompt: 'Help me with my QA workflow',
      icon: Sparkles,
    },
  ];

  // Handle sending a message (used by both welcome and chat view)
  const handleSendMessage = (value: string) => {
    sendMessage(value);
  };

  // Show welcome page when no user messages exist
  if (!hasUserMessages) {
    return (
      <div className="flex flex-col h-full w-full bg-background relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        
        {/* Centered Welcome Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-2xl space-y-8"
          >
            {/* Logo and Title */}
            <div className="flex flex-col items-center text-center space-y-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10"
              >
                <Bot className="h-8 w-8 text-primary" />
              </motion.div>
              
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Welcome to QA Agent
                </h1>
                <p className="text-sm text-muted-foreground max-w-md">
                  Your intelligent assistant for managing GitLab issues, browsing projects, and running automation tests.
                </p>
              </div>
            </div>

            {/* Example Prompts */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="grid grid-cols-2 gap-3"
            >
              {examplePrompts.map((item, index) => (
                <motion.button
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.05, duration: 0.3 }}
                  onClick={() => handleSendMessage(item.prompt)}
                  disabled={isAgentLoading}
                  className={cn(
                    "group flex items-center gap-3 p-4 rounded-xl border bg-card/50 backdrop-blur-sm",
                    "hover:bg-card hover:border-primary/30 hover:shadow-md hover:shadow-primary/5",
                    "transition-all duration-200 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  )}
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">
                    {item.label}
                  </span>
                </motion.button>
              ))}
            </motion.div>

            {/* Centered Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="relative"
            >
              <ChatInput
                onSend={handleSendMessage}
                isLoading={isAgentLoading}
                placeholder="Ask me anything about your projects, issues, or tests..."
              />
              
              {/* Hint text */}
              <div className="absolute -bottom-8 left-0 right-0 flex justify-center pointer-events-none">
                <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary/50" />
                  <span>Press Enter to send, Shift+Enter for new line</span>
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Chat view (after user has sent messages)
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
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative"
          >
            <ChatInput
              onSend={val => sendMessage(val)}
              isLoading={isAgentLoading}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
};
