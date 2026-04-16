import React from 'react';
import { useNavigation } from '@/contexts/navigation-context';
import { useChatSessions, ChatSession } from './hooks/use-chat-sessions';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  Clock, 
  Trash2, 
  MessageSquare,
  Calendar,
  MessageCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

export const SessionsListPage: React.FC = () => {
  const { push, pop } = useNavigation();
  const { sessions, deleteSession } = useChatSessions();

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

  // Format full date
  const formatFullDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Handle session click
  const handleSessionClick = (session: ChatSession) => {
    push('chat-view', { sessionId: session.id });
  };

  // Handle delete session
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
  };

  return (
    <div className="flex flex-col h-full w-full bg-background relative">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b bg-card/50 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => pop()}
          className="h-9 w-9"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Chat Sessions</h1>
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No sessions yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Start a new conversation from the home page to see it listed here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {sessions.map((session: ChatSession, index: number) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ delay: index * 0.03, duration: 0.2 }}
                    onClick={() => handleSessionClick(session)}
                    className={cn(
                      'group relative flex items-start gap-4 p-4 rounded-xl border cursor-pointer',
                      'hover:bg-accent/50 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5',
                      'transition-all duration-200'
                    )}
                  >
                    {/* Icon */}
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <h3 className="text-sm font-medium truncate pr-8">
                          {session.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {session.messages.length > 0 
                            ? session.messages[session.messages.length - 1].content.slice(0, 100) + '...'
                            : 'No messages yet'}
                        </p>
                      </div>

                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatRelativeTime(session.updatedAt)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          <span>{session.messages.length} message{session.messages.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="hidden sm:flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatFullDate(session.createdAt)}</span>
                        </div>
                      </div>

                      {/* Preview of last message */}
                      {session.messages.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 p-2 bg-muted/30 rounded-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          <p className="text-xs text-muted-foreground truncate">
                            Last: {session.messages[session.messages.length - 1].content.slice(0, 60)}...
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Delete button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-red-50 hover:text-red-600 text-gray-400"
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
          )}
        </div>
      </ScrollArea>
    </div>
  );
};