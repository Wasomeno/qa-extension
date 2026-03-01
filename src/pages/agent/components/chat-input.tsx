import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SendHorizontal, Loader2, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string, files: File[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  isLoading = false,
  disabled = false,
  placeholder = 'Ask something...',
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading || disabled) return;

    onSend(input, attachments);
    setInput('');
    setAttachments([]);

    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Auto-resize
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachments(prev => [...prev, ...files]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1 || item.type === 'application/pdf' || item.type === 'text/plain') {
        const file = item.getAsFile();
        if (file) {
          setAttachments(prev => [...prev, file]);
        }
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2">
          {attachments.map((file, i) => (
            <div key={i} className="group relative flex items-center gap-2 p-2 bg-muted/50 rounded-lg border text-xs pr-8">
              {file.type.startsWith('image/') ? (
                <ImageIcon className="h-4 w-4 text-primary" />
              ) : (
                <FileText className="h-4 w-4 text-primary" />
              )}
              <span className="truncate max-w-[150px]">{file.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="relative flex items-end gap-2 p-3 bg-card border rounded-2xl shadow-lg shadow-black/5 mb-2 group focus-within:border-primary/50 transition-colors">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
          accept="image/*,application/pdf,text/plain"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground hover:text-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isLoading}
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            className="min-h-[20px] max-h-[200px] py-2 resize-none rounded-xl bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 border-0 shadow-none"
            rows={1}
          />
        </div>
        <Button
          onClick={() => handleSubmit()}
          disabled={(!input.trim() && attachments.length === 0) || isLoading || disabled}
          size="icon"
          className={cn(
            'h-9 w-9 shrink-0 rounded-xl transition-all',
            (input.trim() || attachments.length > 0) ? 'bg-primary shadow-md shadow-primary/20 scale-100' : 'bg-muted opacity-50 scale-95'
          )}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <SendHorizontal className="h-5 w-5" />
          )}
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
};
