import React, { useState } from 'react';
import { Loader2, User as UserIcon, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface AssigneePickerProps {
  members: any[];
  isLoading: boolean;
  selectedAssignee: any | null;
  onSelect: (member: any) => void;
  disabled: boolean;
  portalContainer?: HTMLElement | null;
}

export const AssigneePicker: React.FC<AssigneePickerProps> = ({
  members,
  isLoading,
  selectedAssignee,
  onSelect,
  disabled,
  portalContainer,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredMembers =
    members.filter(
      m =>
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.username.toLowerCase().includes(query.toLowerCase())
    ) || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-100"
          disabled={disabled}
        >
          <div className="flex items-center truncate">
            {selectedAssignee ? (
              <>
                <img
                  src={selectedAssignee.avatar_url}
                  alt={selectedAssignee.name}
                  className="w-5 h-5 rounded-full mr-2"
                />
                <span className="truncate">{selectedAssignee.name}</span>
              </>
            ) : (
              <span className="text-gray-500">Unassigned</span>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start" container={portalContainer}>
        <div className="p-2 border-b border-gray-100">
          <input
            className="w-full bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
            placeholder="Search users..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[200px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="p-1">
              <div
                className={cn(
                  'flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100',
                  !selectedAssignee && 'bg-blue-50 text-blue-700'
                )}
                onClick={() => {
                  onSelect(null);
                  setOpen(false);
                }}
              >
                <UserIcon className="w-4 h-4 mr-2 text-gray-500" />
                Unassigned
                {!selectedAssignee && (
                  <Check className="w-4 h-4 ml-auto text-blue-600" />
                )}
              </div>
              {filteredMembers.map(member => (
                <div
                  key={member.id}
                  className={cn(
                    'flex items-center px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-gray-100',
                    selectedAssignee?.id === member.id &&
                      'bg-blue-50 text-blue-700'
                  )}
                  onClick={() => {
                    onSelect(member);
                    setOpen(false);
                  }}
                >
                  <img
                    src={member.avatar_url}
                    alt={member.name}
                    className="w-5 h-5 rounded-full mr-2"
                  />
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate font-medium">
                      {member.name}
                    </span>
                    <span className="truncate text-xs text-gray-500">
                      @{member.username}
                    </span>
                  </div>
                  {selectedAssignee?.id === member.id && (
                    <Check className="w-4 h-4 ml-auto text-blue-600" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
