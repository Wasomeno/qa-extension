import React, { useState } from 'react';
import { Search, X, FolderGit2 } from 'lucide-react';
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
  portalContainer?: Element | null;
  isLoading?: boolean;
}

export const MRFilters: React.FC<MRFiltersProps> = ({
  filters,
  search,
  onSearchChange,
  onToggleProject,
  onToggleState,
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

  const selectedProject = React.useMemo(() => {
    if (filters.projectIds.length === 0) return null;
    return projects?.find((p: any) => p.id === filters.projectIds[0]);
  }, [projects, filters.projectIds]);

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
              {selectedProject ? selectedProject.name : 'All Projects'}
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
                      onClick={() => {
                        if (filters.projectIds.length > 0) {
                          onToggleProject(filters.projectIds[0]);
                        }
                        setProjectPickerOpen(false);
                        setProjectSearch('');
                      }}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100',
                        filters.projectIds.length === 0 &&
                          'bg-gray-100 font-medium'
                      )}
                    >
                      All Projects
                    </button>
                    {filteredProjects.map((project: any) => (
                      <button
                        key={project.id}
                        onClick={() => {
                          onToggleProject(project.id);
                          setProjectPickerOpen(false);
                          setProjectSearch('');
                        }}
                        className={cn(
                          'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100',
                          filters.projectIds.includes(project.id) &&
                            'bg-gray-100 font-medium'
                        )}
                      >
                        {project.name}
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
    </div>
  );
};
