import React, { useState } from 'react';
import { Search, X, FolderGit2, Check } from 'lucide-react';
import { Input } from '@/src/components/ui/ui/input';
import { Button } from '@/src/components/ui/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/ui/popover';
import { useQuery } from '@tanstack/react-query';
import apiService from '@/services/api';
import { cn } from '@/lib/utils';
import type { MRFilters as MRFiltersType } from '../types';

interface MRFiltersProps {
  filters: MRFiltersType;
  search: string;
  onSearchChange: (value: string) => void;
  onToggleProject: (projectId: string) => void;
  onToggleState: (state: 'opened' | 'closed' | 'merged' | 'all') => void;
  onClearProjects: () => void;
  portalContainer?: Element | null;
  isLoading?: boolean;
}

export const MRFilters: React.FC<MRFiltersProps> = ({
  filters,
  search,
  onSearchChange,
  onToggleProject,
  onToggleState,
  onClearProjects,
  portalContainer,
  isLoading,
}) => {
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  // Fetch projects
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await apiService.getProjects();
      return res.success ? res.data || [] : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredProjects = React.useMemo(() => {
    if (!projects) return [];
    const q = projectSearch.toLowerCase().trim();
    return projects.filter((p: any) =>
      q ? p.name.toLowerCase().includes(q) : true
    );
  }, [projects, projectSearch]);

  const selectedProjects = React.useMemo(() => {
    if (filters.projectIds.length === 0) return [];
    const lookup = projects
      ? new Map(projects.map((p: any) => [p.id, p]))
      : new Map();
    return filters.projectIds.map(id => {
      const project = lookup.get(id);
      if (project) return project;
      return { id, name: id };
    });
  }, [projects, filters.projectIds]);

  const projectButtonLabel = React.useMemo(() => {
    if (selectedProjects.length === 0) return 'All Projects';
    if (selectedProjects.length === 1) {
      return selectedProjects[0].name || selectedProjects[0].id;
    }
    const remaining = selectedProjects.length - 1;
    const firstName = selectedProjects[0].name || selectedProjects[0].id;
    return `${firstName} +${remaining}`;
  }, [selectedProjects]);

  const stateOptions: Array<{
    value: 'opened' | 'closed' | 'merged' | 'all';
    label: string;
  }> = [
    { value: 'opened', label: 'Open' },
    { value: 'merged', label: 'Merged' },
    { value: 'closed', label: 'Closed' },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="p-3 border-b border-gray-100 space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <Input
          type="text"
          placeholder="Search merge requests..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-sm"
          disabled={isLoading}
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-2 p-0.5 hover:bg-gray-100 rounded pointer-events-auto"
          >
            <X className="w-3 h-3 text-gray-400" />
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {/* Project filter */}
        <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs pointer-events-auto"
              disabled={isLoading}
            >
              <FolderGit2 className="w-3 h-3" />
              {projectButtonLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-2 w-64"
            container={portalContainer || undefined}
            align="start"
          >
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Search projects..."
                value={projectSearch}
                onChange={e => setProjectSearch(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
              <div className="max-h-56 overflow-auto">
                {filteredProjects.length === 0 ? (
                  <div className="text-xs text-gray-500 px-2 py-1">
                    No projects found
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {/* "All Projects" option */}
                    <button
                      type="button"
                      onClick={() => {
                        onClearProjects();
                        setProjectPickerOpen(false);
                        setProjectSearch('');
                      }}
                      className={cn(
                        'w-full flex items-center justify-between text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100',
                        filters.projectIds.length === 0 &&
                          'bg-gray-100 font-medium'
                      )}
                    >
                      All Projects
                    </button>
                    {filteredProjects.map((project: any) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => {
                          onToggleProject(project.id);
                          setProjectSearch('');
                        }}
                        className={cn(
                          'w-full flex items-center justify-between text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100',
                          filters.projectIds.includes(project.id) &&
                            'bg-gray-100 font-medium'
                        )}
                        disabled={isLoading}
                      >
                        <span>{project.name}</span>
                        {filters.projectIds.includes(project.id) && (
                          <Check className="w-3 h-3 text-gray-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* State filter */}
        <div className="flex items-center gap-1">
          {stateOptions.map(option => (
            <Button
              key={option.value}
              variant={filters.state === option.value ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs pointer-events-auto"
              onClick={() => onToggleState(option.value)}
              disabled={isLoading}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Selected project pills */}
      {selectedProjects.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {selectedProjects.map(project => (
            <button
              key={project.id}
              type="button"
              onClick={() => onToggleProject(project.id)}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200 disabled:opacity-60"
              disabled={isLoading}
            >
              <span className="truncate max-w-[10rem]">{project.name}</span>
              <X className="w-3 h-3 text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
