import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/ui/dialog';
import { Button } from '@/src/components/ui/ui/button';
import { Input } from '@/src/components/ui/ui/input';
import { cn } from '@/lib/utils';

interface EvidenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { file: File; text?: string }) => Promise<void>;
  busy?: boolean;
}

const EvidenceDialog: React.FC<EvidenceDialogProps> = ({
  open,
  onOpenChange,
  onSubmit,
  busy,
}) => {
  const [file, setFile] = React.useState<File | null>(null);
  const [text, setText] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const dropRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setText('');
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      try {
        const items = e.clipboardData?.items || [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.kind === 'file') {
            const f = it.getAsFile();
            if (f && f.type.startsWith('image/')) {
              setFile(f);
              e.preventDefault();
              break;
            }
          }
        }
      } catch {}
    };
    if (open) {
      window.addEventListener('paste', onPaste as any);
      return () => window.removeEventListener('paste', onPaste as any);
    }
  }, [open]);

  React.useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const fl = e.dataTransfer?.files;
      if (fl && fl.length) {
        const f = fl[0];
        if (f && f.type && f.type.startsWith('image/')) setFile(f as File);
        else setError('Please drop an image file');
      }
    };
    el.addEventListener('dragover', onDragOver as any);
    el.addEventListener('drop', onDrop as any);
    return () => {
      el.removeEventListener('dragover', onDragOver as any);
      el.removeEventListener('drop', onDrop as any);
    };
  }, [dropRef.current]);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type || !f.type.startsWith('image/')) {
      setError('Only image files are allowed');
      return;
    }
    setError(null);
    setFile(f);
  };

  const onConfirm = async () => {
    if (!file) {
      setError('Please paste or select an image');
      return;
    }
    setError(null);
    await onSubmit({ file, text: text.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add Passed Evidence</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div
            ref={dropRef}
            className={cn(
              'rounded-md border border-dashed p-4 text-center cursor-pointer glass-card',
              'hover:bg-white/5'
            )}
            onClick={() => inputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center gap-3">
                <img
                  src={URL.createObjectURL(file)}
                  alt="Preview"
                  className="h-16 w-16 object-cover rounded border"
                />
                <div className="text-sm text-neutral-800/80 truncate">
                  {file.name || 'image'}
                </div>
              </div>
            ) : (
              <div className="text-sm text-neutral-800/70">
                Paste an image, drag & drop, or click to choose
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePick}
          />
          <div className="space-y-1">
            <div className="text-xs opacity-80">Optional note</div>
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="e.g., Verified in staging"
              className="text-sm glass-input"
            />
          </div>
          {error ? <div className="text-xs text-red-400">{error}</div> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={!!busy}
            >
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={!file || !!busy}>
              {busy ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EvidenceDialog;
