import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Zap,
  MoreVertical,
  Clock,
  Bot,
  FileCode,
  FileJson,
  Copy,
  Trash2,
  Download,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TestBlueprint } from '@/types/recording';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

interface RecordingItemProps {
  recording: TestBlueprint;
  isSelected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  viewMode?: 'grid' | 'list';
  onRun: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  onExportPlaywright: (e: React.MouseEvent) => void;
  onExportJson: (e: React.MouseEvent) => void;
  onRunInAgent: (e: React.MouseEvent) => void;
  onCopyScript: (e: React.MouseEvent) => void;
  portalContainer?: HTMLElement | null;
}

export const RecordingItem: React.FC<RecordingItemProps> = ({
  recording,
  isSelected,
  onClick,
  onDoubleClick,
  viewMode = 'grid',
  onRun,
  onDelete,
  onRename,
  onExportPlaywright,
  onExportJson,
  onRunInAgent,
  onCopyScript,
  portalContainer,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [editName, setEditName] = useState(recording.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleStartEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(true);
    setEditName(recording.name);
  };

  const handleSave = () => {
    if (editName.trim() && editName !== recording.name) {
      onRename(recording.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditName(recording.name);
      setIsEditing(false);
    }
  };

  const Actions = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        container={portalContainer ?? undefined}
        onClick={e => e.stopPropagation()}
      >
        <DropdownMenuItem className="gap-2" onClick={onRunInAgent}>
          <Bot className="w-4 h-4 text-gray-900" /> Run in Agent
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2" onClick={handleStartEdit}>
          <Pencil className="w-4 h-4" /> Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Download className="w-4 h-4" /> Export
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem className="gap-2" onClick={onExportPlaywright}>
              <FileCode className="w-4 h-4" /> Playwright Test
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={onExportJson}>
              <FileJson className="w-4 h-4" /> JSON Data
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem className="gap-2" onClick={onCopyScript}>
          <Copy className="w-4 h-4" /> Copy Test Script
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-red-600 focus:text-red-600"
          onClick={e => {
            e.stopPropagation();
            setIsConfirmingDelete(true);
          }}
        >
          <Trash2 className="w-4 h-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const DeleteConfirmation = () => (
    <div
      className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded-md border border-red-100"
      onClick={e => e.stopPropagation()}
    >
      <span className="text-[10px] font-bold text-red-600 uppercase tracking-tighter mr-1">
        Delete?
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-red-600 hover:bg-red-100"
        onClick={onDelete}
      >
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-gray-500 hover:bg-gray-100"
        onClick={e => {
          e.stopPropagation();
          setIsConfirmingDelete(false);
        }}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  if (viewMode === 'list') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 cursor-pointer border-b transition-colors group',
          isSelected && 'bg-zinc-100 hover:bg-zinc-200/50'
        )}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <Terminal className="w-5 h-5 text-zinc-600" />
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              ref={inputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              onClick={e => e.stopPropagation()}
              className="h-7 text-sm py-0"
            />
          ) : (
            <span className="font-medium text-gray-700 truncate block">
              {recording.name}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500 w-24 text-right flex items-center justify-end gap-1">
          <Clock className="w-3 h-3" /> {recording.steps.length} steps
        </span>
        <div className="flex items-center gap-1">
          {isConfirmingDelete ? (
            <DeleteConfirmation />
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs gap-1.5 text-zinc-600 hover:text-zinc-900 opacity-0 group-hover:opacity-100 bg-zinc-50 hover:bg-zinc-100 border transition-all"
                onClick={onRun}
              >
                <Zap className="w-3.5 h-3.5 fill-current" /> Run Test
              </Button>
              <Actions />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col border rounded-xl overflow-hidden hover:shadow-md hover:border-zinc-300 cursor-pointer transition-all bg-white group relative',
        isSelected
          ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900'
          : 'border-gray-200'
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {isConfirmingDelete && (
        <div
          className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-200"
          onClick={e => e.stopPropagation()}
        >
          <Trash2 className="w-8 h-8 text-red-500 mb-2" />
          <p className="text-sm font-bold text-gray-900 mb-1">
            Delete this test script?
          </p>
          <p className="text-xs text-gray-500 mb-4">
            This action cannot be undone.
          </p>
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1 h-9 text-xs"
              onClick={e => {
                e.stopPropagation();
                setIsConfirmingDelete(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-9 text-xs bg-red-600 hover:bg-red-700"
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
      <div className="aspect-[4/3] bg-zinc-900 flex items-center justify-center relative overflow-hidden group/thumb">
        <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden p-2 font-mono text-[8px] leading-tight text-white select-none">
          {`// Test Script: ${recording.name}\n// Steps: ${recording.steps.length}\n\nawait page.goto(baseUrl);\nawait page.click('[data-testid="login"]');\nawait page.fill('#user', 'test_user');\nawait page.fill('#pass', '********');\nawait page.click('button[type="submit"]');\nawait expect(page).toHaveURL(/dashboard/);`}
        </div>
        <Terminal className="w-12 h-12 text-zinc-700/50" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200 backdrop-blur-[1px]">
          <Button
            size="sm"
            className="rounded-full bg-white hover:bg-zinc-100 text-zinc-900 gap-2 px-4 shadow-xl translate-y-2 group-hover:translate-y-0 transition-all duration-300"
            onClick={onRun}
          >
            <Zap className="w-4 h-4 fill-current" /> Run Test
          </Button>
        </div>
        {recording.projectId && (
          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-gray-600 uppercase">
            Project {recording.projectId}
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                ref={inputRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                onClick={e => e.stopPropagation()}
                className="h-7 text-sm py-0"
              />
            ) : (
              <p className="font-semibold text-gray-900 truncate group-hover:text-zinc-900 transition-colors">
                {recording.name}
              </p>
            )}
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" /> {recording.steps.length} steps
            </p>
          </div>
          <Actions />
        </div>
      </div>
    </div>
  );
};
