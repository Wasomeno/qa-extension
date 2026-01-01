import React from 'react';
import { Search, ChevronDown, Filter } from 'lucide-react';
import { IssueFilterState, IssueStatus } from './types';
import { MOCK_PROJECTS } from './mock-data';
import { cn } from '@/lib/utils';

// Using native select for simplicity in this iteration, can be upgraded to custom Select component later
interface IssueFilterBarProps {
  filters: IssueFilterState;
  onFilterChange: <K extends keyof IssueFilterState>(
    key: K,
    value: IssueFilterState[K]
  ) => void;
}

export const IssueFilterBar: React.FC<IssueFilterBarProps> = ({
  filters,
  onFilterChange,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search issues..."
            value={filters.search}
            onChange={e => onFilterChange('search', e.target.value)}
            className="w-full h-10 pl-9 pr-4 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
          />
        </div>

        {/* Project Filter */}
        <div className="relative min-w-[140px]">
          <select
            value={filters.projectId}
            onChange={e => onFilterChange('projectId', e.target.value)}
            className="w-full h-10 pl-3 pr-8 bg-white border border-gray-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer text-gray-700"
          >
            <option value="ALL">All Projects</option>
            {MOCK_PROJECTS.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Status Filter */}
        <div className="relative min-w-[120px]">
          <select
            value={filters.status}
            onChange={e =>
              onFilterChange('status', e.target.value as IssueStatus | 'ALL')
            }
            className="w-full h-10 pl-3 pr-8 bg-white border border-gray-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer text-gray-700"
          >
            <option value="ALL">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_QA">In QA</option>
            <option value="BLOCKED">Blocked</option>
            <option value="CLOSED">Closed</option>
            <option value="MERGED">Merged</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Sort Filter */}
        <div className="relative min-w-[140px]">
          <select
            value={filters.sort}
            onChange={e => onFilterChange('sort', e.target.value as any)}
            className="w-full h-10 pl-3 pr-8 bg-white border border-gray-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer text-gray-700"
          >
            <option value="UPDATED">Recently Updated</option>
            <option value="NEWEST">Newest Created</option>
            <option value="OLDEST">Oldest Created</option>
            <option value="PRIORITY">Priority</option>
          </select>
          <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>
    </div>
  );
};
