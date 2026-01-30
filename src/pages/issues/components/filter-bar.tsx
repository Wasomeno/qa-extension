import React from 'react';
import { Search, ChevronDown, Filter } from 'lucide-react';
import { IssueFilterState } from '@/types/issues';
import { Input } from '@/components/ui/input';
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
          <Input
            type="text"
            placeholder="Search issues..."
            value={filters.search}
            onChange={e => onFilterChange('search', e.target.value)}
            className="pl-9 bg-white border-gray-200 rounded-xl focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Project Filter */}
        <div className="min-w-[140px]">
          <Select
            value={filters.projectId}
            onValueChange={val => onFilterChange('projectId', val)}
          >
            <SelectTrigger className="bg-white border-gray-200 rounded-xl text-gray-700 focus:ring-blue-500/20 focus:border-blue-500">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value="ALL">All Projects</SelectItem>
              {projectOptions.map(p => (
                <SelectItem key={p.value} value={String(p.value)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Label Filter */}
        <div className="min-w-[140px]">
          <Select
            value={filters.labels?.[0] || 'ALL'}
            onValueChange={val => {
              onFilterChange('labels', val === 'ALL' ? [] : [val]);
            }}
          >
            <SelectTrigger className="bg-white border-gray-200 rounded-xl text-gray-700 focus:ring-blue-500/20 focus:border-blue-500">
              <SelectValue placeholder="All Labels" />
            </SelectTrigger>
            <SelectContent container={portalContainer}>
              <SelectItem value="ALL">All Labels</SelectItem>
              {labelOptions.map(l => (
                <SelectItem key={l.value} value={String(l.value)}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort Filter */}
        <div className="min-w-[140px]">
          <Select
            value={filters.sort}
            onValueChange={val =>
              onFilterChange('sort', val as IssueFilterState['sort'])
            }
          >
            <SelectTrigger className="bg-white border-gray-200 rounded-xl text-gray-700 focus:ring-blue-500/20 focus:border-blue-500">
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
    </div>
  );
};
