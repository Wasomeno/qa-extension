import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  filterOptions?: FilterOption[];
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterPlaceholder?: string;
  showFilter?: boolean;
  className?: string;
  portalContainer?: HTMLElement | null;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filterOptions,
  filterValue,
  onFilterChange,
  filterPlaceholder = 'All',
  showFilter = true,
  className,
  portalContainer,
}) => {
  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder={searchPlaceholder}
          className="pl-9 h-10 bg-white border-theme-border rounded-xl focus-visible:ring-2 focus-visible:ring-zinc-900"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      {/* Filter Dropdown */}
      {showFilter && (filterOptions?.length ?? 0) > 0 && (
        <Select value={filterValue ?? undefined} onValueChange={onFilterChange}>
          <SelectTrigger className="w-[180px] h-10 bg-white border-theme-border rounded-xl">
            <SelectValue placeholder={filterPlaceholder} />
          </SelectTrigger>
          <SelectContent container={portalContainer}>
            {(filterOptions ?? []).map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};
