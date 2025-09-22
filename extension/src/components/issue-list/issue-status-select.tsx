import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/src/components/ui/ui/select';
import { cn } from '@/lib/utils';

interface IssueStatusSelectProps {
  value: 'open' | 'closed';
  onChange: (val: 'open' | 'closed') => void;
  portalContainer?: Element | null;
}

const IssueStatusSelect: React.FC<IssueStatusSelectProps> = ({
  value,
  onChange,
  portalContainer,
}) => {
  const handleStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleValueChange = (val: string) => {
    const next = val === 'closed' ? 'closed' : 'open';
    onChange(next);
  };

  const isClosed = value === 'closed';

  return (
    <div onClick={handleStopPropagation}>
      <Select value={value} onValueChange={handleValueChange}>
        <SelectTrigger className="h-7 w-[100px] text-[12px] glass-input">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block w-2.5 h-2.5 rounded-full',
                isClosed ? 'bg-gray-400' : 'bg-emerald-500'
              )}
            />
            <span className="capitalize">{value}</span>
          </div>
        </SelectTrigger>
        <SelectContent container={portalContainer || undefined} sideOffset={6}>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default IssueStatusSelect;

