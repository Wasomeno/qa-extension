import React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Bot, User, Sparkles, AlertCircle, FileText, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentActivity } from './agent-activity';

export interface AgentActivity {
  id: string;
  tool: string;
  status: 'running' | 'completed' | 'error';
  result?: any;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  timestamp: number;
  activities?: AgentActivity[];
  attachments?: Array<{ name: string; type: string; url?: string }>;
}

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="flex w-full justify-center py-4"
      >
        <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
          {message.content}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.3,
        ease: [0.23, 1, 0.32, 1]
      }}
      className={cn(
        'flex w-full gap-3 py-4',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <Avatar
        className={cn(
          'h-9 w-9 border transition-all duration-300',
          !isUser &&
            'bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20 shadow-sm shadow-primary/10'
        )}
      >
        {isUser ? (
          <>
            <AvatarFallback className="bg-primary/90 text-primary-foreground">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </>
        ) : (
          <>
            <AvatarFallback
              className={cn('bg-transparent', isError && 'text-destructive')}
            >
              {isError ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Bot className="h-5 w-5 text-primary" />
              )}
            </AvatarFallback>
          </>
        )}
      </Avatar>

      <div
        className={cn(
          'flex flex-col max-w-[85%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn(
            "flex flex-wrap gap-2 mb-2",
            isUser ? "justify-end" : "justify-start"
          )}>
            {message.attachments.map((file, i) => (
              <div key={i} className="group relative">
                {file.type.startsWith('image/') ? (
                  <div className="relative rounded-lg overflow-hidden border shadow-sm h-32 w-32 bg-muted">
                    {file.url ? (
                      <>
                        <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
                        <a 
                          href={file.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                        >
                          <ExternalLink className="h-5 w-5" />
                        </a>
                      </>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center animate-pulse">
                         <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ) : (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-card border rounded-lg text-xs hover:bg-muted transition-colors pr-8 relative"
                  >
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground absolute right-2" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <div
          className={cn(
            'px-4 py-2.5 rounded-2xl shadow-sm text-sm relative overflow-hidden',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-none shadow-primary/10'
              : cn(
                  'bg-card/50 backdrop-blur-md border rounded-tl-none shadow-black/5',
                  isError && 'border-destructive/30 bg-destructive/5'
                )
          )}
        >
          <div className="relative z-10">
            {isUser ? (
              <div className="whitespace-pre-wrap leading-relaxed">
                {message.content}
              </div>
            ) : (
              <div className="space-y-3">
                <MarkdownRenderer
                  content={message.content}
                  className="prose-sm dark:prose-invert leading-relaxed"
                />

                {message.activities && message.activities.length > 0 && (
                  <motion.div className="pt-1 border-t border-muted/30">
                    <AnimatePresence initial={false}>
                      {message.activities.map(activity => (
                        <AgentActivity key={activity.id} activity={activity} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 px-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </motion.div>
  );
};
