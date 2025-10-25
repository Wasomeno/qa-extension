import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/utils/useDebounce';
import api, { GitLabUser, Project } from '@/services/api';
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
import type { IssueFilterState, GitLabLabel } from '../types';

export interface IssueFiltersProps {
  filters: IssueFilterState;
  search: string;
  onSearchChange: (value: string) => void;
  onToggleProject: (id: string) => void;
  onToggleAssignee: (id: string) => void;
  onToggleLabel: (name: string) => void;
  onToggleStatus: (status: string) => void;
  allProjectLabels: Record<string, GitLabLabel[]>;
  portalContainer?: Element | null;
  isLoading?: boolean;
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

const useUsersQuery = (projectId: string, search: string) => {
  return useQuery({
    queryKey: ['users', projectId, search],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.searchUsersInProject(projectId, {
        search: search || undefined,
        limit: 5,
      });
      if (!res.success) throw new Error(res.error || 'Failed to load users');
      return res.data || [];
    },
    enabled: !!projectId,
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

export const IssueFilters: React.FC<IssueFiltersProps> = ({
  filters,
  search,
  onSearchChange,
  onToggleProject,
  onToggleAssignee,
  onToggleLabel,
  onToggleStatus,
  allProjectLabels,
  portalContainer,
  isLoading = false,
}) => {
  // Popover states
  const [openProjects, setOpenProjects] = useState(false);
  const [openAssignees, setOpenAssignees] = useState(false);
  const [openLabels, setOpenLabels] = useState(false);

  type PopoverKey = 'projects' | 'assignees' | 'labels';
  // Prevent Radix popovers from re-opening immediately when their trigger is re-clicked
  const suppressOpenRef = React.useRef<Record<PopoverKey, boolean>>({
    projects: false,
    assignees: false,
    labels: false,
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
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [labelsQuery, setLabelsQuery] = useState('');

  const debouncedProjectQuery = useDebounce(projectQuery, 500);
  const debouncedAssigneeQuery = useDebounce(assigneeQuery, 500);
  const debouncedLabelsQuery = useDebounce(labelsQuery, 500);

  // Data queries
  const projectsQuery = useProjectsQuery(debouncedProjectQuery);
  const usersQuery = useUsersQuery(
    filters.selectedProjectIds.length === 1
      ? filters.selectedProjectIds[0]
      : '',
    debouncedAssigneeQuery
  );

  const projects = projectsQuery.data || [];
  const users = usersQuery.data || [];

  // Combined labels from selected projects
  const combinedLabels = React.useMemo(() => {
    const map = new Map<string, GitLabLabel>();
    filters.selectedProjectIds.forEach(projectId => {
      const projectLabels = allProjectLabels[projectId] || [];
      projectLabels.forEach((label: GitLabLabel) => {
        const key = label.name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, label);
        }
      });
    });
    return Array.from(map.values());
  }, [allProjectLabels, filters.selectedProjectIds]);

  // Filtered labels based on search
  const visibleLabels = combinedLabels
    .filter(
      l =>
        !debouncedLabelsQuery ||
        l.name.toLowerCase().includes(debouncedLabelsQuery.toLowerCase())
    )
    .slice(0, 5);

  const visibleUsers = users
    .filter(
      u =>
        !debouncedAssigneeQuery ||
        `${u.name} ${u.username}`
          .toLowerCase()
          .includes(debouncedAssigneeQuery.toLowerCase())
    )
    .slice(0, 5);

  // Error state
  const authError = projectsQuery.error || usersQuery.error;

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
          placeholder="Search issues..."
          className="text-sm glass-input text-neutral-800 placeholder:text-neutral-800/50"
          disabled={isLoading || projectsQuery.isLoading}
        />
      </div>

      {/* Filter Grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Project Filter */}
        <ProjectFilter
          projects={projects}
          selectedProjectIds={filters.selectedProjectIds}
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

        {/* Labels & Status Filter */}
        <LabelsStatusFilter
          selectedLabels={filters.selectedLabels}
          selectedStatuses={filters.selectedStatuses}
          selectedProjectIds={filters.selectedProjectIds}
          onToggleLabel={onToggleLabel}
          onToggleStatus={onToggleStatus}
          visibleLabels={visibleLabels}
          labelsQuery={labelsQuery}
          onLabelsQueryChange={setLabelsQuery}
          open={openLabels}
          onOpenChange={createOnOpenChange('labels', setOpenLabels)}
          onTriggerPointerDown={event =>
            handleTriggerPointerDown(event, openLabels, 'labels', setOpenLabels)
          }
          isLoading={isLoading}
          portalContainer={portalContainer}
        />

        {/* Assignee Filter */}
        <AssigneeFilter
          users={visibleUsers}
          selectedAssigneeIds={filters.selectedAssigneeIds}
          onToggleAssignee={onToggleAssignee}
          assigneeQuery={assigneeQuery}
          onAssigneeQueryChange={setAssigneeQuery}
          open={openAssignees}
          onOpenChange={createOnOpenChange('assignees', setOpenAssignees)}
          onTriggerPointerDown={event =>
            handleTriggerPointerDown(
              event,
              openAssignees,
              'assignees',
              setOpenAssignees
            )
          }
          isLoading={usersQuery.isLoading || isLoading}
          portalContainer={portalContainer}
        />
      </div>
    </div>
  );
};

// Project Filter Component
interface ProjectFilterProps {
  projects: Project[];
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
                  {selectedProject?.name || '1 selected'}
                </Badge>
              )}
              {selectedProjectIds.length > 1 && (
                <span className="truncate">
                  {selectedProject?.name || 'Multiple'}
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
                          <span className="truncate">{p.name}</span>
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

// Labels & Status Filter Component
interface LabelsStatusFilterProps {
  selectedLabels: string[];
  selectedStatuses: string[];
  selectedProjectIds: string[];
  onToggleLabel: (name: string) => void;
  onToggleStatus: (status: string) => void;
  visibleLabels: GitLabLabel[];
  labelsQuery: string;
  onLabelsQueryChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTriggerPointerDown: (event: React.PointerEvent) => void;
  isLoading: boolean;
  portalContainer?: Element | null;
}

const LabelsStatusFilter: React.FC<LabelsStatusFilterProps> = ({
  selectedLabels,
  selectedStatuses,
  selectedProjectIds,
  onToggleLabel,
  onToggleStatus,
  visibleLabels,
  labelsQuery,
  onLabelsQueryChange,
  open,
  onOpenChange,
  onTriggerPointerDown,
  isLoading,
  portalContainer,
}) => {
  const totalSelected = selectedLabels.length + selectedStatuses.length;
  const combined = [...selectedStatuses, ...selectedLabels];

  return (
    <div className="space-y-1">
      <Label className="text-xs">Labels & Status</Label>
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
              {totalSelected === 0 && (
                <span className="truncate">
                  {selectedProjectIds.length
                    ? 'Select labels/status'
                    : 'Select a project first'}
                </span>
              )}
              {totalSelected === 1 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-2 py-1 truncate max-w-[140px]"
                >
                  {combined[0] || '1 selected'}
                </Badge>
              )}
              {totalSelected > 1 && (
                <span className="truncate">
                  {combined[0]}
                  {totalSelected > 1 && ` +${totalSelected - 1}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {totalSelected > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {totalSelected}
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
          className="p-2 w-64"
          container={portalContainer || undefined}
          align="start"
        >
          <div className="space-y-2">
            <Input
              value={labelsQuery}
              onChange={e => onLabelsQueryChange(e.target.value)}
              placeholder="Search labels"
              className="text-xs h-8"
            />
            <div className="max-h-56 overflow-auto">
              <ul
                className="text-xs"
                role="listbox"
                aria-label="Labels and Status"
              >
                {/* Status options */}
                {['open', 'closed'].map(status => {
                  const checked = selectedStatuses.includes(status);
                  const displayName =
                    status.charAt(0).toUpperCase() + status.slice(1);
                  const dotColor = status === 'closed' ? '#6b7280' : '#22c55e';

                  return (
                    <li key={status} role="option" aria-selected={checked}>
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
                        onClick={() => onToggleStatus(status)}
                      >
                        <Checkbox className="mr-1" checked={checked} />
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full border"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="truncate">{displayName}</span>
                      </button>
                    </li>
                  );
                })}

                {/* Separator */}
                {visibleLabels.length > 0 && (
                  <li className="border-t border-gray-200 my-1" />
                )}

                {/* Label options */}
                {visibleLabels.length === 0 ? (
                  <li className="text-xs text-neutral-500 px-1 py-2">
                    {selectedProjectIds.length
                      ? 'No labels found for selected projects'
                      : 'Select at least one project to load labels'}
                  </li>
                ) : (
                  visibleLabels.map(l => {
                    const checked = selectedLabels.includes(l.name);
                    return (
                      <li key={l.id} role="option" aria-selected={checked}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
                          onClick={() => onToggleLabel(l.name)}
                        >
                          <Checkbox className="mr-1" checked={checked} />
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full border"
                            style={{ backgroundColor: l.color }}
                          />
                          <span className="truncate">{l.name}</span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Assignee Filter Component
interface AssigneeFilterProps {
  users: GitLabUser[];
  selectedAssigneeIds: string[];
  onToggleAssignee: (id: string) => void;
  assigneeQuery: string;
  onAssigneeQueryChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTriggerPointerDown: (event: React.PointerEvent) => void;
  isLoading: boolean;
  portalContainer?: Element | null;
}

const AssigneeFilter: React.FC<AssigneeFilterProps> = ({
  users,
  selectedAssigneeIds,
  onToggleAssignee,
  assigneeQuery,
  onAssigneeQueryChange,
  open,
  onOpenChange,
  onTriggerPointerDown,
  isLoading,
  portalContainer,
}) => {
  const getDisplayText = () => {
    if (selectedAssigneeIds.length === 0) return 'Anyone';

    if (selectedAssigneeIds.length === 1) {
      const id = selectedAssigneeIds[0];
      if (id === 'unassigned') return 'Unassigned';

      const user = users.find(u => String(u.id) === id);
      return user ? user.name || user.username : '1 selected';
    }

    const firstId = selectedAssigneeIds[0];
    let firstLabel = 'Multiple';
    if (firstId === 'unassigned') {
      firstLabel = 'Unassigned';
    } else {
      const firstUser = users.find(u => String(u.id) === firstId);
      if (firstUser) {
        firstLabel = firstUser.name || `@${firstUser.username}`;
      }
    }
    const remaining = selectedAssigneeIds.length - 1;
    return `${firstLabel}${remaining > 0 ? ` +${remaining}` : ''}`;
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">Assignee</Label>
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
              {selectedAssigneeIds.length <= 1 ? (
                <span className="truncate">{getDisplayText()}</span>
              ) : (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-2 py-1 truncate max-w-[140px]"
                >
                  {getDisplayText()}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedAssigneeIds.length > 1 && (
                <Badge variant="secondary" className="text-[10px]">
                  {selectedAssigneeIds.length}
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
          align="end"
        >
          <div className="space-y-2">
            <Input
              value={assigneeQuery}
              onChange={e => onAssigneeQueryChange(e.target.value)}
              placeholder="Search assignees"
              className="text-xs h-8"
            />
            <div className="max-h-56 overflow-auto">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              ) : (
                <ul className="text-xs" role="listbox" aria-label="Assignees">
                  <li>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
                      onClick={() => onToggleAssignee('unassigned')}
                    >
                      <Checkbox
                        className="mr-1"
                        checked={selectedAssigneeIds.includes('unassigned')}
                      />
                      Unassigned
                    </button>
                  </li>
                  {users.map(u => {
                    const id = String(u.id);
                    const checked = selectedAssigneeIds.includes(id);
                    return (
                      <li key={id} role="option" aria-selected={checked}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
                          onClick={() => onToggleAssignee(id)}
                        >
                          <Checkbox className="mr-1" checked={checked} />
                          <span className="truncate">
                            {u.name} {u.username ? `@${u.username}` : ''}
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
