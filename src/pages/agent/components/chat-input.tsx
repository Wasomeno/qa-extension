import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowUp,
  Loader2,
  Plus,
  Terminal,
  CheckSquare,
  Folder,
  PlayCircle,
  X,
  Image,
  File,
  Paperclip,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const COMMANDS = [
  { id: 'projects', icon: Folder, label: 'Projects', description: 'List and manage your projects' },
  { id: 'issue', icon: CheckSquare, label: 'Create Issue', description: 'Create a new ticket or bug' },
  { id: 'tests', icon: PlayCircle, label: 'Run Tests', description: 'Execute automated test scenarios' },
  { id: 'help', icon: Terminal, label: 'Help', description: 'Show available actions and usage' },
];

export interface Attachment {
  id: string;
  file: File;
  preview?: string;
  name: string;
  size: number;
  type: string;
}

interface ChatInputProps {
  onSend: (message: string, attachments?: File[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onCommandStateChange?: (show: boolean, query: string) => void;
  commands?: Array<{ id: string; icon: any; label: string; description: string }>;
  hideCommandsPopover?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isLoading = false,
  disabled = false,
  placeholder = 'Message...',
  onCommandStateChange,
  commands = COMMANDS,
  hideCommandsPopover = false,
}) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter(c => 
    c.id.toLowerCase().includes(commandQuery.toLowerCase()) || 
    c.label.toLowerCase().includes(commandQuery.toLowerCase())
  );

  useEffect(() => {
    onCommandStateChange?.(showCommands, commandQuery);
  }, [showCommands, commandQuery, onCommandStateChange]);

  // Handle clipboard paste for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageItems: DataTransferItem[] = [];
      
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          imageItems.push(item);
        }
      }

      if (imageItems.length > 0) {
        e.preventDefault();
        
        for (const item of imageItems) {
          const file = item.getAsFile();
          if (file) {
            addAttachment(file);
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Create preview URL for a file
  const createPreview = (file: File): string | undefined => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return undefined;
  };

  // Add attachment from file
  const addAttachment = (file: File) => {
    const attachment: Attachment = {
      id: crypto.randomUUID(),
      file,
      preview: createPreview(file),
      name: file.name,
      size: file.size,
      type: file.type,
    };
    setAttachments(prev => [...prev, attachment]);
  };

  // Remove attachment
  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter(a => a.id !== id);
    });
  };

  // Handle file selection from input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        addAttachment(file);
      }
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Trigger file input click
  const handlePlusClick = () => {
    fileInputRef.current?.click();
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get file icon based on type
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return Image;
    return File;
  };

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading || disabled) return;

    const files = attachments.map(a => a.file);
    onSend(input, files);
    setInput('');
    setAttachments([]);
    setShowCommands(false);

    // Clear previews
    attachments.forEach(a => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, attachments, isLoading, disabled, onSend]);

  const applyCommand = (commandId: string) => {
    const newValue = input.replace(/(?:^|\s)\/([a-zA-Z0-9-]*)$/, ` /${commandId} `);
    setInput(newValue.trimStart());
    setShowCommands(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands) {
      if (e.key === 'Escape') {
        setShowCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;

    const slashMatch = value.match(/(?:^|\s)\/([a-zA-Z0-9-]*)$/);
    if (slashMatch) {
      setShowCommands(true);
      setCommandQuery(slashMatch[1]);
    } else {
      setShowCommands(false);
    }
  };

  const handleFocus = () => setIsFocused(true);
  const handleBlur = (e: React.FocusEvent) => {
    // delay hiding to allow clicks on commands
    setTimeout(() => setIsFocused(false), 200);
  };

  const hasContent = input.trim().length > 0 || attachments.length > 0;
  const isActive = isFocused || hasContent;

  return (
    <div className="relative w-full flex flex-col justify-end min-h-[60px] pb-2 z-10">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Attachment previews */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="flex flex-wrap gap-2 mb-2 px-1"
          >
            {attachments.map((attachment) => {
              const FileIcon = getFileIcon(attachment.type);
              return (
                <motion.div
                  key={attachment.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative group"
                >
                  {attachment.preview ? (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border bg-muted">
                      <img 
                        src={attachment.preview} 
                        alt={attachment.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                        <span className="text-[9px] text-white truncate block">
                          {attachment.name.length > 12 
                            ? attachment.name.slice(0, 12) + '...' 
                            : attachment.name}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex items-center gap-2 px-3 py-2 bg-card border rounded-lg min-w-[140px] max-w-[200px] group-hover:border-primary/30 transition-colors">
                      <div className="flex-shrink-0 h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                        <FileIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium truncate">
                          {attachment.name.length > 20 
                            ? attachment.name.slice(0, 20) + '...' 
                            : attachment.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatFileSize(attachment.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Local commands popover only if we don't have external handler */}
      {!hideCommandsPopover && (
        <AnimatePresence>
          {showCommands && filteredCommands.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute bottom-[calc(100%+12px)] left-0 w-[320px] bg-white border border-neutral-200 shadow-xl rounded-xl overflow-hidden z-50"
            >
              <div className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-100 bg-neutral-50/50">
                Commands
              </div>
              <div className="p-1.5 max-h-[300px] overflow-y-auto space-y-0.5">
                {filteredCommands.map((cmd) => (
                  <button
                    key={cmd.id}
                    onClick={() => applyCommand(cmd.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors hover:bg-neutral-50 group"
                  >
                    <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-md border transition-colors bg-neutral-50 border-transparent text-neutral-500 group-hover:bg-white group-hover:border-neutral-200 group-hover:shadow-sm">
                      <cmd.icon className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-medium text-neutral-900 truncate">/{cmd.id}</span>
                      <span className="text-xs text-neutral-500 truncate">{cmd.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <div
        className={cn(
          "relative flex flex-col w-full transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] border overflow-hidden",
          isActive
            ? "bg-white border-neutral-300 shadow-[0_4px_24px_rgba(0,0,0,0.06)] rounded-[24px]"
            : "bg-white border-neutral-200 shadow-sm rounded-[32px] hover:border-neutral-300 hover:shadow-md"
        )}
      >
        <div className="flex items-end gap-1.5 px-3 py-2 z-10 relative bg-white">
          <div className="flex items-center pb-0.5 shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={handlePlusClick}
                    className={cn(
                      "h-9 w-9 rounded-full transition-colors shrink-0",
                      isActive ? "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50"
                    )}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={8}>
                  <p className="text-xs">Attach files or paste images</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            className="flex-1 min-h-[36px] max-h-[200px] py-2 px-1 resize-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 border-0 shadow-none text-neutral-900 placeholder:text-neutral-500 text-[15px] leading-relaxed scrollbar-thin scrollbar-thumb-neutral-200 hover:scrollbar-thumb-neutral-300"
            rows={1}
          />

          <div className="flex items-center pb-0.5 shrink-0">
             <Button
                onClick={() => handleSubmit()}
                disabled={!hasContent || isLoading || disabled}
                size="icon"
                className={cn(
                  "h-9 w-9 rounded-full transition-all duration-200 shrink-0",
                  hasContent
                    ? "bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm"
                    : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                )}
             >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
                <span className="sr-only">Send</span>
             </Button>
          </div>
        </div>
        
        <AnimatePresence initial={false}>
          {isActive && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 32, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="flex items-center justify-between px-4 text-[11px] font-medium text-neutral-400 overflow-hidden bg-white"
            >
              <div className="flex gap-4 pb-2.5">
                 <span className="flex items-center cursor-pointer hover:text-neutral-600 transition-colors">
                    / for commands
                 </span>
                 <span className="flex items-center cursor-pointer hover:text-neutral-600 transition-colors">
                    <Paperclip className="h-3 w-3 mr-1" />
                    to attach
                 </span>
              </div>
              <div className="pb-2.5">
                Shift + Return for new line
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};