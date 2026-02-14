import React, { useRef, useEffect } from 'react';
import { ChatMessage } from './components/chat-message';
import { ChatInput } from './components/chat-input';
import { AgentSettingsForm } from './components/agent-settings-form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Settings } from 'lucide-react';
import { useAgent } from './hooks/use-agent';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export const AgentPage: React.FC = () => {
  const { messages, isAgentLoading, sendMessage } = useAgent();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

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
            <p className="text-[10px] text-muted-foreground">
              Powered by Gemini & GitLab
            </p>
          </div>
        </div>

        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agent Settings</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <AgentSettingsForm />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 w-full p-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto flex flex-col min-h-full justify-end pb-4">
          <div className="space-y-6">
            {messages.map(msg => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isAgentLoading && (
              <div className="flex w-full gap-3 py-4">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-center space-x-1 h-8">
                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="w-full max-w-3xl mx-auto">
        <ChatInput onSend={sendMessage} isLoading={isAgentLoading} />
      </div>
    </div>
  );
};
