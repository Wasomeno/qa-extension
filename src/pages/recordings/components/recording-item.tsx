import React from 'react';
import {
  FileText,
  Play,
  MoreVertical,
  Clock,
  Bot,
  FileCode,
  FileJson,
  Copy,
  Trash2,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
  onExportPlaywright,
  onExportJson,
  onRunInAgent,
  onCopyScript,
  portalContainer,
}) => {
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
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
        <FileText className="w-5 h-5 text-zinc-600" />
        <span className="flex-1 font-medium text-gray-700 truncate">
          {recording.name}
        </span>
        <span className="text-xs text-gray-500 w-24 text-right flex items-center justify-end gap-1">
          <Clock className="w-3 h-3" /> {recording.steps.length} steps
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-900 opacity-0 group-hover:opacity-100"
            onClick={onRun}
          >
            <Play className="w-4 h-4 fill-current" />
          </Button>
          <Actions />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col border rounded-xl overflow-hidden hover:shadow-md hover:border-zinc-300 cursor-pointer transition-all bg-white group',
        isSelected
          ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900'
          : 'border-gray-200'
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="aspect-video bg-gray-100 flex items-center justify-center relative overflow-hidden">
        <FileText className="w-10 h-10 text-gray-300" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
          <Button
            size="icon"
            className="w-12 h-12 rounded-full bg-zinc-900 hover:bg-black text-white scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all shadow-lg"
            onClick={onRun}
          >
            <Play className="w-6 h-6 fill-current ml-1" />
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
            <p className="font-semibold text-gray-900 truncate group-hover:text-zinc-900 transition-colors">
              {recording.name}
            </p>
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
