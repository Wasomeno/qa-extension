import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/utils/useDebounce';
import api from '@/services/api';
import { cn } from '@/lib/utils';
import { Button } from '@/src/components/ui/ui/button';
import { Input } from '@/src/components/ui/ui/input';
import { Badge } from '@/src/components/ui/ui/badge';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/ui/popover';
import { Checkbox } from '@/src/components/ui/ui/checkbox';
import { Label } from '@/src/components/ui/ui/label';
import { ChevronRight } from 'lucide-react';
import type { MRFilters as MRFiltersType } from '../types';
import { formatProjectName } from '@/utils/project-formatter';

export interface MRFiltersProps {
  filters: MRFiltersType;
  search: string;
  onSearchChange: (value: string) => void;
  onToggleProject: (id: string) => void;
  onToggleState: (state: 'opened' | 'closed' | 'merged' | 'all') => void;
  onClearProjects: () => void;
  portalContainer?: Element | null;
  isLoading?: boolean;
  stateCounts?: Partial<
    Record<'opened' | 'closed' | 'merged' | 'all', number | undefined>
  >;
}

const useProjectsQuery = (search: string) => {
  return useQuery({
    queryKey: ['projects', search],
    queryFn: async () => {
      const res = await api.searchProjects({
        search: search || undefined,
        limit: 5,
      });
      if (!res.success) throw new Error(res.error || 'Failed to load projects');
      return res.data || [];
    },
    staleTime: 300_000,
  });
};

const SkeletonRow = () => {
  return (
    <div className="flex items-center gap-2 px-2">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
};

export const MRFilters: React.FC<MRFiltersProps> = ({
  filters,
  search,
  onSearchChange,
  onToggleProject,
  onToggleState,
  portalContainer,
  isLoading = false,
}) => {
  // Popover states
  const [openProjects, setOpenProjects] = useState(false);
  const [openState, setOpenState] = useState(false);

  type PopoverKey = 'projects' | 'state';
  // Prevent Radix popovers from re-opening immediately when their trigger is re-clicked
  const suppressOpenRef = React.useRef<Record<PopoverKey, boolean>>({
    projects: false,
    state: false,
  });

  const handleTriggerPointerDown = (
    event: React.PointerEvent,
    isOpen: boolean,
    key: PopoverKey,
    setter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    if (!isOpen) return;
    event.preventDefault();
    suppressOpenRef.current[key] = true;
    setter(false);
  };

  const createOnOpenChange =
    (key: PopoverKey, setter: React.Dispatch<React.SetStateAction<boolean>>) =>
    (next: boolean) => {
      if (next && suppressOpenRef.current[key]) {
        suppressOpenRef.current[key] = false;
        return;
      }
      suppressOpenRef.current[key] = false;
      setter(next);
    };

  // Search queries for filters
  const [projectQuery, setProjectQuery] = useState('');

  const debouncedProjectQuery = useDebounce(projectQuery, 500);

  // Data queries
  const projectsQuery = useProjectsQuery(debouncedProjectQuery);

  const projects = projectsQuery.data || [];

  // Error state
  const authError = projectsQuery.error;

  return (
    <div className="p-4 space-y-3">
      {authError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {String(authError)}. Please open the extension popup and sign in, then
          retry.
        </div>
      )}

      {/* Search Input */}
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search merge requests..."
          className="text-sm glass-input text-neutral-800 placeholder:text-neutral-800/50"
          disabled={isLoading || projectsQuery.isLoading}
        />
      </div>

      {/* Filter Grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Project Filter */}
        <ProjectFilter
          projects={projects}
          selectedProjectIds={filters.projectIds}
          onToggleProject={onToggleProject}
          projectQuery={projectQuery}
          onProjectQueryChange={setProjectQuery}
          open={openProjects}
          onOpenChange={createOnOpenChange('projects', setOpenProjects)}
          onTriggerPointerDown={event =>
            handleTriggerPointerDown(
              event,
              openProjects,
              'projects',
              setOpenProjects
            )
          }
          isLoading={projectsQuery.isLoading || isLoading}
          portalContainer={portalContainer}
        />

        {/* State Filter */}
        <StateFilter
          selectedState={filters.state}
          onToggleState={onToggleState}
          open={openState}
          onOpenChange={createOnOpenChange('state', setOpenState)}
          onTriggerPointerDown={event =>
            handleTriggerPointerDown(event, openState, 'state', setOpenState)
          }
          isLoading={isLoading}
          portalContainer={portalContainer}
        />

        {/* Placeholder for third filter - can be used for Author, Reviewer, etc. */}
        <div className="space-y-1">
          <Label className="text-xs">Author</Label>
          <Button
            type="button"
            variant="outline"
            className="text-xs h-8 glass-input w-full justify-between"
            disabled={true}
          >
            <span className="truncate">Anyone</span>
            <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Project Filter Component
interface ProjectFilterProps {
  projects: any[];
  selectedProjectIds: string[];
  onToggleProject: (id: string) => void;
  projectQuery: string;
  onProjectQueryChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTriggerPointerDown: (event: React.PointerEvent) => void;
  isLoading: boolean;
  portalContainer?: Element | null;
}

const ProjectFilter: React.FC<ProjectFilterProps> = ({
  projects,
  selectedProjectIds,
  onToggleProject,
  projectQuery,
  onProjectQueryChange,
  open,
  onOpenChange,
  onTriggerPointerDown,
  isLoading,
  portalContainer,
}) => {
  const selectedProject = projects.find(
    p => String(p.id) === selectedProjectIds[0]
  );
  const selectedProjectLabel = selectedProject
    ? formatProjectName(selectedProject)
    : '1 selected';

  return (
    <div className="space-y-1">
      <Label className="text-xs">Project</Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="text-xs h-8 glass-input w-full justify-between"
            disabled={isLoading}
            onPointerDown={onTriggerPointerDown}
          >
            <div className="flex items-center gap-2 truncate">
              {selectedProjectIds.length === 0 && (
                <span className="truncate">All projects</span>
              )}
              {selectedProjectIds.length === 1 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-2 py-1 truncate max-w-[140px]"
                >
                  {selectedProjectLabel}
                </Badge>
              )}
              {selectedProjectIds.length > 1 && (
                <span className="truncate">
                  {selectedProjectLabel}
                  {selectedProjectIds.length > 1 &&
                    ` +${selectedProjectIds.length - 1}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedProjectIds.length > 1 && (
                <Badge variant="secondary" className="text-[10px]">
                  {selectedProjectIds.length}
                </Badge>
              )}
              <ChevronRight
                className={cn(
                  'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                  open && 'rotate-90'
                )}
              />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-2 w-72"
          container={portalContainer || undefined}
          align="start"
        >
          <div className="space-y-2">
            <Input
              value={projectQuery}
              onChange={e => onProjectQueryChange(e.target.value)}
              placeholder="Search projects"
              className="text-xs h-8"
            />
            <div className="max-h-56 overflow-auto">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="text-xs text-neutral-500 px-1 py-2">
                  No options found
                </div>
              ) : (
                <ul className="text-xs" role="listbox" aria-label="Projects">
                  {projects.slice(0, 5).map(p => {
                    const id = String(p.id);
                    const checked = selectedProjectIds.includes(id);
                    return (
                      <li key={id} role="option" aria-selected={checked}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
                          onClick={() => onToggleProject(id)}
                        >
                          <Checkbox
                            className="mr-1 data-[state=checked]:accent-neutral-500"
                            checked={checked}
                          />
                          <span className="truncate">
                            {formatProjectName(p)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// State Filter Component
interface StateFilterProps {
  selectedState: 'opened' | 'closed' | 'merged' | 'all';
  onToggleState: (state: 'opened' | 'closed' | 'merged' | 'all') => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTriggerPointerDown: (event: React.PointerEvent) => void;
  isLoading: boolean;
  portalContainer?: Element | null;
}

const StateFilter: React.FC<StateFilterProps> = ({
  selectedState,
  onToggleState,
  open,
  onOpenChange,
  onTriggerPointerDown,
  isLoading,
  portalContainer,
}) => {
  const stateOptions: Array<{
    value: 'opened' | 'closed' | 'merged' | 'all';
    label: string;
    color: string;
  }> = [
    { value: 'opened', label: 'Opened', color: '#22c55e' },
    { value: 'merged', label: 'Merged', color: '#8b5cf6' },
    { value: 'closed', label: 'Closed', color: '#6b7280' },
    { value: 'all', label: 'All', color: '#3b82f6' },
  ];

  const selectedOption = stateOptions.find(o => o.value === selectedState);
  const displayLabel = selectedOption?.label || 'Select state';

  return (
    <div className="space-y-1">
      <Label className="text-xs">State</Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="text-xs h-8 glass-input w-full justify-between"
            disabled={isLoading}
            onPointerDown={onTriggerPointerDown}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-neutral-400 transition-transform duration-200',
                open && 'rotate-90'
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-2 w-64"
          container={portalContainer || undefined}
          align="start"
        >
          <div className="max-h-56 overflow-auto">
            <ul className="text-xs" role="listbox" aria-label="State">
              {stateOptions.map(option => {
                const isSelected = selectedState === option.value;
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <button
                      type="button"
                      className={cn(
                        'w-full text-left px-3 py-2 hover:bg-neutral-100 flex items-center gap-2 transition-colors',
                        isSelected && 'bg-neutral-100 font-medium'
                      )}
                      onClick={() => {
                        onToggleState(option.value);
                        onOpenChange(false);
                      }}
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full border"
                        style={{ backgroundColor: option.color }}
                      />
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
