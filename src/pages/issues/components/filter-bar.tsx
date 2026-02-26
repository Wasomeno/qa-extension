import React from 'react';
import { Search, Filter, User } from 'lucide-react';
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
  const assigneeOptions: Option[] = [
    { label: 'Me', value: 'ME' },
    { label: 'Unassigned', value: 'None' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Search Input Row */}
      <div className="relative w-full">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10"
        />
        <Input
          type="text"
          aria-label="Search issues"
          placeholder="Search issues…"
          value={filters.search}
          onChange={e => onFilterChange('search', e.target.value)}
          className="pl-9 bg-white border-theme-border rounded-xl focus:ring-blue-500/20 focus:border-blue-500"
        />
      </div>

      {/* Filters Grid Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Project Filter */}
        <SearchablePicker
          multiple
          options={projectOptions}
          value={filters.projectIds}
          onSelect={val => onFilterChange('projectIds', val as string[])}
          placeholder="All Projects"
          searchPlaceholder="Search projects…"
          portalContainer={portalContainer}
          className="w-full"
        />

        {/* Assignee Filter */}
        <SearchablePicker
          multiple
          options={assigneeOptions}
          value={filters.assigneeIds || ['ALL']}
          onSelect={val => onFilterChange('assigneeIds', val as (string | number)[])}
          placeholder="All Assignees"
          searchPlaceholder="Search assignees…"
          allOption={{ label: 'All Assignees', value: 'ALL' }}
          portalContainer={portalContainer}
          className="w-full"
        />

        {/* Label Filter */}
        <SearchablePicker
          multiple
          options={labelOptions}
          value={filters.labels || ['ALL']}
          onSelect={val =>
            onFilterChange('labels', val as string[])
          }
          placeholder="All Labels"
          searchPlaceholder="Search labels…"
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
          <SelectTrigger className="bg-white border-theme-border rounded-xl text-theme-text focus:ring-blue-500/20 focus:border-blue-500 w-full">
            <div className="flex items-center gap-2">
              <Filter
                aria-hidden="true"
                className="w-3.5 h-3.5 text-gray-400"
              />
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
