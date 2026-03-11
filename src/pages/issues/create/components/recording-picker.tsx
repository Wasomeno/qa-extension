import React from 'react';
import {
  FileText,
  Check,
  ChevronsUpDown,
  Search,
  Loader2,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { TestBlueprint } from '@/types/recording';
import { useQuery } from '@tanstack/react-query';
import { storageService } from '@/services/storage';

interface RecordingPickerProps {
  recordings: TestBlueprint[];
  isLoading: boolean;
  selectedRecording: TestBlueprint | null;
  onSelect: (recording: TestBlueprint | null) => void;
  portalContainer?: HTMLElement | null;
  disabled?: boolean;
}

export const RecordingPicker: React.FC<RecordingPickerProps> = ({
  recordings,
  isLoading,
  selectedRecording,
  onSelect,
  portalContainer,
  disabled = false,
}) => {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className="w-full justify-between bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500 hover:bg-gray-50 transition-all font-normal"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading recordings...</span>
            </div>
          ) : selectedRecording ? (
            <div className="flex items-center gap-2 truncate">
              <FileText className="w-4 h-4 text-zinc-500" />
              <span className="truncate">{selectedRecording.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <FileText className="w-4 h-4" />
              <span>Select a recording to include...</span>
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 shadow-xl border-gray-200"
        align="start"
        container={portalContainer}
      >
        <Command className="bg-white">
          <CommandInput placeholder="Search recordings..." className="h-9" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No recordings found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
                className="flex items-center gap-2 py-2.5"
              >
                <div className="w-4 flex items-center justify-center">
                  {!selectedRecording && (
                    <Check className="h-3.5 w-3.5 text-blue-600" />
                  )}
                </div>
                <span>None</span>
              </CommandItem>
              {recordings.map(recording => (
                <CommandItem
                  key={recording.id}
                  onSelect={() => {
                    onSelect(recording);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 py-2.5"
                >
                  <div className="w-4 flex items-center justify-center">
                    {selectedRecording?.id === recording.id && (
                      <Check className="h-3.5 w-3.5 text-blue-600" />
                    )}
                  </div>
                  <FileText className="h-4 w-4 text-zinc-500 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">
                      {recording.name}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {recording.steps?.length || 0} steps •{' '}
                      {recording.project_id
                        ? `Project #${recording.project_id}`
                        : 'No project'}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
