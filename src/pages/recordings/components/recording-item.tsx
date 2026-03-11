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
import { RecordingProjectPicker } from './recording-project-picker';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/api/project';
import { MessageType } from '@/types/messages';

interface RecordingItemProps {
  recording: TestBlueprint;
  onClick?: () => void;
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
  onClick,
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

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const projects = projectsData?.data?.projects || [];

  const handleUpdateProject = (projectId: number | null) => {
    chrome.runtime.sendMessage(
      {
        type: MessageType.UPDATE_BLUEPRINT,
        data: { id: recording.id, data: { project_id: projectId?.toString() } },
      },
      () => {
        // This should trigger refetching if set up correctly in the parent list
      }
    );
  };

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
      <span className="text-xs font-bold text-red-600 uppercase tracking-tighter mr-1">
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

  return (
    <div
      className={cn(
        'flex flex-col border rounded-xl overflow-hidden hover:shadow-md hover:border-zinc-300 cursor-pointer transition-all bg-white group relative h-full',
        'border-gray-200'
      )}
      onClick={onClick}
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

      <div className="p-4 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                ref={inputRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                onClick={e => e.stopPropagation()}
                className="h-7 text-sm py-0 mb-1"
              />
            ) : (
              <p className="font-bold text-gray-900 truncate group-hover:text-zinc-900 transition-colors">
                {recording.name}
              </p>
            )}
            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5 leading-relaxed">
              {recording.description || 'No description'}
            </p>
          </div>
          <Actions />
        </div>

        {/* Steps Snippet */}
        <div className="flex-1 min-h-[80px] bg-zinc-50 rounded-lg p-3 border border-zinc-100 mb-4 group-hover:bg-zinc-100/50 transition-colors">
          <div className="flex items-center gap-1.5 mb-2">
            <Terminal className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              Test Steps
            </span>
          </div>
          <div className="space-y-1.5">
            {recording.steps.slice(0, 4).map((step, idx) => (
              <div key={idx} className="flex gap-2 text-xs">
                <span className="text-zinc-400 font-medium tabular-nums shrink-0">
                  {idx + 1}.
                </span>
                <span className="text-zinc-600 truncate leading-tight">
                  {step.description || step.action}
                </span>
              </div>
            ))}
            {recording.steps.length > 4 && (
              <div className="flex gap-2 text-xs text-zinc-400 italic pl-5 mt-1">
                + {recording.steps.length - 4} more steps
              </div>
            )}
            {recording.steps.length === 0 && (
              <div className="text-xs text-zinc-400 italic py-2 text-center">
                No steps recorded
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-zinc-100">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {recording.steps.length} steps
            </span>
            <RecordingProjectPicker
              currentProjectId={recording.project_id}
              projects={projects}
              onSelect={handleUpdateProject}
              portalContainer={portalContainer}
            />
          </div>
          {recording.created_at && (
            <span className="text-xs text-gray-400 font-medium">
              {new Date(recording.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
