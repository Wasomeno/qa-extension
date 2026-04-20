import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from 'react';
import { useNavigation } from '@/contexts/navigation-context';

import { ChatMessage, Message } from './components/chat-message';
import { ChatInput } from './components/chat-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  ArrowLeft,
  Trash2,
  Clock,
  ChevronRight,
  List,
  Folder,
  CheckSquare,
  PlayCircle,
  Terminal,
} from 'lucide-react';
import { useAgent } from './hooks/use-agent';
import { useChatSessions, ChatSession } from './hooks/use-chat-sessions';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import useMeasure from 'react-use-measure';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const ANIMATION_SHOWN_KEY = 'qa-agent-welcome-animated';

export const AgentPage: React.FC<{ portalContainer?: HTMLElement | null }> = ({
  portalContainer,
}) => {
  const { push } = useNavigation();
  const [ref, bounds] = useMeasure();
  const {
    sessions,
    currentSessionId,
    createSession,
    loadSession,
    saveSession,
    deleteSession,
    clearCurrentSession,
    getCurrentSession,
  } = useChatSessions();

  const currentSession = getCurrentSession();

  // Use useState with a function to compute initial value properly
  const [view, setView] = useState<'home' | 'chat'>(() => {
    return currentSession && currentSession.messages.length > 0
      ? 'chat'
      : 'home';
  });

  const [isCommandMode, setIsCommandMode] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  // Track pending initial message to send after ChatView mounts
  const [pendingInitialMessage, setPendingInitialMessage] = useState<
    string | null
  >(null);

  // Track pending initial files
  const [pendingInitialFiles, setPendingInitialFiles] = useState<File[]>([]);

  // Track if welcome animation has been shown
  const [hasAnimated, setHasAnimated] = useState(() => {
    return localStorage.getItem(ANIMATION_SHOWN_KEY) === 'true';
  });

  // Track when bounds are measured (to avoid animate target change mid-animation)
  const [boundsReady, setBoundsReady] = useState(false);
  useEffect(() => {
    if (bounds.height > 0 && !boundsReady) {
      setBoundsReady(true);
    }
  }, [bounds.height, boundsReady]);

  // Commands definitions (match ChatInput)
  const COMMANDS = useMemo(
    () => [
      {
        id: 'projects',
        icon: Folder,
        label: 'Projects',
        description: 'List and manage your projects',
      },
      {
        id: 'issue',
        icon: CheckSquare,
        label: 'Create Issue',
        description: 'Create a new ticket or bug',
      },
      {
        id: 'tests',
        icon: PlayCircle,
        label: 'Run Tests',
        description: 'Execute automated test scenarios',
      },
      {
        id: 'help',
        icon: Terminal,
        label: 'Help',
        description: 'Show available actions and usage',
      },
    ],
    []
  );

  const filteredCommands = useMemo(() => {
    return COMMANDS.filter(
      c =>
        c.id.toLowerCase().includes(commandQuery.toLowerCase()) ||
        c.label.toLowerCase().includes(commandQuery.toLowerCase())
    );
  }, [COMMANDS, commandQuery]);

  const handleCommandStateChange = useCallback(
    (isCmdMode: boolean, query: string) => {
      setIsCommandMode(isCmdMode);
      setCommandQuery(query);
    },
    []
  );

  const startNewChat = (initialMessage?: string, initialFiles?: File[]) => {
    createSession();
    setView('chat');
    if (
      initialMessage !== undefined ||
      (initialFiles && initialFiles.length > 0)
    ) {
      // Store the initial message to be sent after ChatView mounts
      setPendingInitialMessage(initialMessage || null);
      setPendingInitialFiles(initialFiles || []);
    }
  };

  // Resume a session
  const handleResumeSession = (session: ChatSession) => {
    loadSession(session.id);
    setView('chat');
  };

  // Delete session
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
  };

  // Format relative time
  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Home View
  if (view === 'home') {
    return (
      <div className="flex flex-col h-full w-full bg-background relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative z-10 overflow-auto">
          <motion.div
            initial={hasAnimated ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: hasAnimated ? 0 : 0.5,
              ease: [0.23, 1, 0.32, 1],
            }}
            className="w-full max-w-2xl space-y-8"
            onAnimationComplete={() => {
              if (!hasAnimated) {
                localStorage.setItem(ANIMATION_SHOWN_KEY, 'true');
                setHasAnimated(true);
              }
            }}
          >
            {/* Logo and Title or Commands List */}
            <MotionConfig
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              <motion.div
                animate={boundsReady ? { height: bounds.height } : {}}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="w-[calc(100%+2rem)] -ml-4 px-4 pb-8 -mb-8 relative overflow-visible"
              >
                <div className="w-full relative px-1 py-1" ref={ref}>
                  <AnimatePresence mode="wait" initial={false}>
                    {isCommandMode ? (
                      <motion.div
                        key="commands"
                        initial={{
                          opacity: 0,
                          scale: 0.98,
                          filter: 'blur(4px)',
                        }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="flex flex-col w-full bg-background border rounded-3xl shadow-xl overflow-hidden origin-bottom"
                      >
                        <div className="px-5 py-3.5 text-[11px] font-bold text-muted-foreground border-b bg-muted/20">
                          Suggested Commands
                        </div>
                        <div className="p-2.5 max-h-[300px] overflow-y-auto space-y-1">
                          {filteredCommands.length > 0 ? (
                            filteredCommands.map(cmd => (
                              <button
                                key={cmd.id}
                                onClick={() => {
                                  startNewChat(`/${cmd.id}`);
                                }}
                                className="w-full flex items-center gap-4 px-4 py-3 text-left rounded-2xl transition-all duration-200 text-muted-foreground hover:bg-accent/80 hover:text-accent-foreground hover:shadow-sm group outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl border transition-all duration-200 bg-muted/50 border-transparent text-muted-foreground group-hover:bg-background group-hover:border-border group-hover:shadow-sm group-hover:text-primary group-hover:scale-105">
                                  <cmd.icon className="h-5 w-5" />
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="text-sm font-bold text-foreground transition-colors group-hover:text-primary">
                                    /{cmd.id}
                                  </span>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {cmd.description}
                                  </span>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                              No matching commands found.
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="welcome"
                        initial={{
                          opacity: 0,
                          scale: 0.98,
                          filter: 'blur(4px)',
                        }}
                        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, scale: 0.98, filter: 'blur(4px)' }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="flex flex-col items-center text-center space-y-4 py-6 w-full origin-bottom"
                      >
                        <div className="space-y-2">
                          <h1 className="text-2xl font-semibold tracking-tight">
                            Welcome to QA Agent
                          </h1>
                          <p className="text-sm text-muted-foreground max-w-md">
                            Your intelligent assistant for managing GitLab
                            issues, browsing projects, and running automation
                            tests.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </MotionConfig>

            {/* Chat Input */}
            <motion.div
              initial={hasAnimated ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: hasAnimated ? 0 : 0.2,
                duration: hasAnimated ? 0 : 0.4,
              }}
              className="relative w-full mt-8"
            >
              <ChatInput
                onSend={(value, files) => startNewChat(value, files)}
                placeholder="Ask me anything..."
                onCommandStateChange={handleCommandStateChange}
                hideCommandsPopover={true}
              />
            </motion.div>

            {/* Recent Sessions - Limited to 3 with View All link */}
            {sessions.length > 0 && (
              <motion.div
                initial={hasAnimated ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: hasAnimated ? 0 : 0.5, duration: 0.4 }}
                className="w-full mt-4"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Recent Chats
                  </h2>
                  {sessions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-xs h-7"
                      onClick={() => push('chat-sessions')}
                    >
                      <List className="h-3 w-3 mr-1" />
                      View all ({sessions.length})
                      <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <AnimatePresence>
                    {sessions.slice(0, 1).map((session, index) => (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ delay: 0.1 * index, duration: 0.2 }}
                        onClick={() => handleResumeSession(session)}
                        className={cn(
                          'group flex items-center gap-3 p-3 rounded-lg border cursor-pointer',
                          'hover:bg-accent/50 hover:border-primary/20 transition-all duration-200'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate pr-2">
                            {session.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatRelativeTime(session.updatedAt)} ·{' '}
                            {session.messages.length} messages
                          </p>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-red-50 hover:text-red-600 text-gray-400"
                              onClick={e => handleDeleteSession(e, session.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete session</TooltipContent>
                        </Tooltip>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // Chat View - use session ID as key to remount with correct messages
  return (
    <ChatView
      key={currentSessionId}
      sessionId={currentSessionId}
      initialMessages={currentSession?.messages || []}
      saveSession={saveSession}
      clearCurrentSession={clearCurrentSession}
      onBack={() => {
        if (currentSessionId) {
          // Messages will be saved via onMessagesChange
        }
        clearCurrentSession();
        setView('home');
      }}
      initialMessage={pendingInitialMessage}
      initialFiles={pendingInitialFiles}
      onInitialMessageHandled={() => {
        setPendingInitialMessage(null);
        setPendingInitialFiles([]);
      }}
    />
  );
};

// Separate ChatView component to ensure fresh agent state
interface ChatViewProps {
  sessionId: string | null;
  initialMessages: Message[];
  saveSession: (id: string, msgs: Message[]) => void;
  clearCurrentSession: () => void;
  onBack: () => void;
  initialMessage: string | null;
  initialFiles?: File[];
  onInitialMessageHandled: () => void;
}

const ChatView: React.FC<ChatViewProps> = ({
  sessionId,
  initialMessages,
  saveSession,
  clearCurrentSession,
  onBack,
  initialMessage,
  initialFiles,
  onInitialMessageHandled,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Guard: if sessionId is null, show a fallback UI
  if (!sessionId) {
    return (
      <div className="flex flex-col h-full w-full bg-background items-center justify-center">
        <p className="text-muted-foreground">Loading chat...</p>
      </div>
    );
  }

  const {
    messages,
    isAgentLoading,
    sendMessage,
    progressMessage,
    resetMessages,
  } = useAgent({
    sessionId,
    initialMessages,
    onMessagesChange: useCallback(
      (msgs: Message[]) => {
        if (sessionId && msgs.length > 0) {
          saveSession(sessionId, msgs);
        }
      },
      [sessionId, saveSession]
    ),
  });

  // Handle initial message from parent - send when component mounts and sendMessage is ready
  useEffect(() => {
    if (
      (initialMessage || (initialFiles && initialFiles.length > 0)) &&
      sendMessage
    ) {
      // Small delay to ensure component is fully rendered
      const timer = setTimeout(() => {
        sendMessage(initialMessage || '', initialFiles || []);
        onInitialMessageHandled();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [initialMessage, initialFiles, sendMessage, onInitialMessageHandled]);

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

  return (
    <div className="flex flex-col h-full w-full bg-background relative">
      {/* Floating Back Button */}
      <button
        type="button"
        className="absolute top-4 left-4 h-12 w-12 z-50 flex items-center justify-center rounded-md opacity-40 hover:opacity-100 transition-opacity"
        onClick={onBack}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

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
          <div className="relative">
            <ChatInput
              onSend={(val, files) => sendMessage(val, files)}
              isLoading={isAgentLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentPage;
