import React from 'react';
import { Search, Filter } from 'lucide-react';
import { IssueFilterState } from '@/types/issues';
import { Input } from '@/components/ui/input';
import { SearchablePicker } from './searchable-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Option {
  label: string;
  value: string | number;
}

interface IssueFilterBarProps {
  filters: IssueFilterState;
  onFilterChange: <K extends keyof IssueFilterState>(
    key: K,
    value: IssueFilterState[K]
  ) => void;
  projectOptions: Option[];
  labelOptions: Option[];
  portalContainer?: HTMLElement | null;
}

export const IssueFilterBar: React.FC<IssueFilterBarProps> = ({
  filters,
  onFilterChange,
  projectOptions,
  labelOptions,
  portalContainer,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Search Input Row */}
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
        <Input
          type="text"
          placeholder="Search issues..."
          value={filters.search}
          onChange={e => onFilterChange('search', e.target.value)}
          className="pl-9 bg-white border-gray-200 rounded-xl focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      {/* Filters Grid Row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Project Filter */}
        <SearchablePicker
          options={projectOptions}
          value={filters.projectId}
          onSelect={val => onFilterChange('projectId', String(val))}
          placeholder="All Projects"
          searchPlaceholder="Search projects..."
          allOption={{ label: 'All Projects', value: 'ALL' }}
          portalContainer={portalContainer}
          className="w-full"
        />

        {/* Label Filter */}
        <SearchablePicker
          options={labelOptions}
          value={filters.labels?.[0] || 'ALL'}
          onSelect={val =>
            onFilterChange('labels', val === 'ALL' ? [] : [String(val)])
          }
          placeholder="All Labels"
          searchPlaceholder="Search labels..."
          allOption={{ label: 'All Labels', value: 'ALL' }}
          portalContainer={portalContainer}
          className="w-full"
        />

        {/* Sort Filter */}
        <Select
          value={filters.sort}
          onValueChange={val =>
            onFilterChange('sort', val as IssueFilterState['sort'])
          }
        >
          <SelectTrigger className="bg-white border-gray-200 rounded-xl text-gray-700 focus:ring-blue-500/20 focus:border-blue-500 w-full">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent container={portalContainer}>
            <SelectItem value="UPDATED">Recently Updated</SelectItem>
            <SelectItem value="NEWEST">Newest Created</SelectItem>
            <SelectItem value="OLDEST">Oldest Created</SelectItem>
            <SelectItem value="PRIORITY">Priority</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
