import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

export interface SortHeaderProps<T extends string = string> {
  label: string;
  field: T;
  currentSortField: T;
  currentSortDirection: SortDirection;
  onSort: (field: T) => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export const SortHeader: React.FC<SortHeaderProps> = ({
  label,
  field,
  currentSortField,
  currentSortDirection,
  onSort,
  className,
  align = 'left',
}) => {
  const isActive = currentSortField === field;

  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 px-2 font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors gap-1',
        alignClasses[align],
        isActive && 'text-gray-900 bg-gray-100',
        className
      )}
      onClick={() => onSort(field)}
    >
      <span>{label}</span>
      {isActive ? (
        currentSortDirection === 'asc' ? (
          <ArrowUp className="w-4 h-4" />
        ) : (
          <ArrowDown className="w-4 h-4" />
        )
      ) : (
        <ArrowUpDown className="w-4 h-4 opacity-50" />
      )}
    </Button>
  );
};
