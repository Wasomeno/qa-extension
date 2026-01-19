import React, { useState } from 'react';
import { Loader2, Plus, Check, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface LabelPickerProps {
  labels: any[];
  isLoading: boolean;
  selectedLabels: any[];
  onToggle: (label: any) => void;
  disabled: boolean;
  portalContainer?: HTMLElement | null;
}

export const LabelPicker: React.FC<LabelPickerProps> = ({
  labels,
  isLoading,
  selectedLabels,
  onToggle,
  disabled,
  portalContainer,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredLabels =
    labels.filter(l => l.name.toLowerCase().includes(query.toLowerCase())) ||
    [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-auto py-2 px-3 w-full justify-start text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100 relative min-h-[42px]"
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-2 items-center pr-6">
            {selectedLabels.length === 0 && (
              <span className="text-gray-500">Select Labels...</span>
            )}
            {selectedLabels.map(label => (
              <div
                key={label.id}
                className="text-[10px] pl-2 pr-1 py-0.5 rounded border font-medium inline-flex items-center"
                style={{
                  backgroundColor: `${label.color}15`,
                  color: label.color,
                  borderColor: `${label.color}30`,
                }}
              >
                <span>{label.name}</span>
                <button
                  type="button"
                  className="ml-1 hover:bg-black/10 rounded p-0.5 transition-colors flex items-center justify-center shrink-0"
                  onClick={e => {
                    e.stopPropagation();
                    onToggle(label);
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Plus className="w-4 h-4 text-gray-400" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-0"
        align="start"
        container={portalContainer}
      >
        <div className="p-2 border-b border-gray-100">
          <input
            className="w-full bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
            placeholder="Search labels..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[200px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : filteredLabels.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              No labels found.
            </div>
          ) : (
            <div className="p-1">
              {filteredLabels.map(label => {
                const isSelected = selectedLabels.some(l => l.id === label.id);
                return (
                  <div
                    key={label.id}
                    className="flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100"
                    onClick={() => onToggle(label)}
                  >
                    <span
                      className="w-3 h-3 rounded-full mr-2 border border-black/10 shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 truncate">{label.name}</span>
                    {isSelected && (
                      <Check className="w-4 h-4 ml-2 text-blue-600" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
