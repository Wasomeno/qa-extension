import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/src/components/ui/ui/scroll-area';
import { Badge } from '@/src/components/ui/ui/badge';
import { Button } from '@/src/components/ui/ui/button';
import { Input } from '@/src/components/ui/ui/input';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import { Checkbox } from '@/src/components/ui/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/ui/popover';
import { Label } from '@/src/components/ui/ui/label';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/utils/useDebounce';
import { apiService } from '@/services/api';
import type {
  ListIssuesParams,
  IssueListItem,
  GitLabLabel,
  Project,
  GitLabUser,
} from '@/services/api';
import useAuth from '@/hooks/useAuth';
import { formatProjectName } from '@/utils/project-formatter';
import { ChevronRight } from 'lucide-react';

interface CompactIssueListProps {
  onClose: () => void;
  onSelect?: (issue: IssueListItem) => void;
  portalContainer: HTMLElement | null;
}

interface FilterState {
  search: string;
  projectIds: string[];
  assigneeIds: string[];
  labels: string[];
  statuses: string[];
}

const INITIAL_FILTERS: FilterState = {
  search: '',
  projectIds: [],
  assigneeIds: [],
  labels: [],
  statuses: [],
};

const CompactIssueList: React.FC<CompactIssueListProps> = ({
  onClose,
  onSelect,
  portalContainer,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filter state
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const debouncedSearch = useDebounce(filters.search, 500);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Build query params
  const queryParams = useMemo<ListIssuesParams>(
    () => ({
      search: debouncedSearch || undefined,
      projectId:
        filters.projectIds.length === 1 ? filters.projectIds[0] : undefined,
      assigneeId:
        filters.assigneeIds.length === 1 ? filters.assigneeIds[0] : undefined,
      labels: filters.labels.length > 0 ? filters.labels : undefined,
      status: getStatusFilter(filters.statuses),
      cursor: String(currentPage),
      limit: ITEMS_PER_PAGE,
      sort: 'newest',
    }),
    [debouncedSearch, filters, currentPage]
  );

  // Fetch issues
  const {
    data: issuesData,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['compact-issues', queryParams],
    queryFn: async () => {
      const result = await apiService.listGitLabIssuesGlobal(queryParams);
      if (!result.success) {
        throw new Error(result.error || 'Failed to load issues');
      }
      return result.data;
    },
    staleTime: 60_000, // 1 minute
    enabled: !!user,
  });

  const issues = issuesData?.items || [];
  const hasNextPage = !!issuesData?.nextCursor;
  const projectLabels = issuesData?.projectLabels || {};

  // Filter update handlers
  const updateFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters(prev => ({ ...prev, [key]: value }));
      setCurrentPage(1); // Reset to page 1 on filter change
    },
    []
  );

  const toggleArrayFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: string) => {
      setFilters(prev => {
        const current = prev[key] as string[];
        const updated = current.includes(value)
          ? current.filter(v => v !== value)
          : [...current, value];
        return { ...prev, [key]: updated };
      });
      setCurrentPage(1);
    },
    []
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetching) {
      setCurrentPage(prev => prev + 1);
    }
  }, [hasNextPage, isFetching]);

  return (
    <div className="flex flex-col h-[380px] bg-white">
      {/* Filters */}
      <CompactFilters
        filters={filters}
        onSearchChange={value => updateFilter('search', value)}
        onToggleProject={id => toggleArrayFilter('projectIds', id)}
        onToggleAssignee={id => toggleArrayFilter('assigneeIds', id)}
        onToggleLabel={name => toggleArrayFilter('labels', name)}
        onToggleStatus={status => toggleArrayFilter('statuses', status)}
        projectLabels={projectLabels}
        portalContainer={portalContainer}
        isLoading={isLoading}
      />

      {/* Issue List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading && <LoadingState />}

          {isError && (
            <ErrorState
              message={
                error instanceof Error ? error.message : 'Failed to load issues'
              }
            />
          )}

          {!isLoading && !isError && issues.length === 0 && <EmptyState />}

          {!isLoading && !isError && issues.length > 0 && (
            <>
              {issues.map(issue => (
                <IssueCard key={issue.id} issue={issue} onSelect={onSelect} />
              ))}

              {isFetching && <LoadingMoreState />}

              {hasNextPage && !isFetching && (
                <div className="flex justify-center pt-2">
                  <Button
                    onClick={handleLoadMore}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

// ==================== Sub-Components ====================

interface CompactFiltersProps {
  filters: FilterState;
  onSearchChange: (value: string) => void;
  onToggleProject: (id: string) => void;
  onToggleAssignee: (id: string) => void;
  onToggleLabel: (name: string) => void;
  onToggleStatus: (status: string) => void;
  projectLabels: Record<string, GitLabLabel[]>;
  portalContainer: HTMLElement | null;
  isLoading: boolean;
}

const CompactFilters: React.FC<CompactFiltersProps> = ({
  filters,
  onSearchChange,
  onToggleProject,
  onToggleAssignee,
  onToggleLabel,
  onToggleStatus,
  projectLabels,
  portalContainer,
  isLoading,
}) => {
  return (
    <div className="p-3 border-b space-y-2">
      {/* Search */}
      <Input
        value={filters.search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search issues..."
        className="text-xs h-8"
        disabled={isLoading}
      />

      {/* Filter Row */}
      <div className="grid grid-cols-3 gap-2">
        <ProjectFilter
          selectedIds={filters.projectIds}
          onToggle={onToggleProject}
          portalContainer={portalContainer}
          isLoading={isLoading}
        />

        <LabelsStatusFilter
          selectedLabels={filters.labels}
          selectedStatuses={filters.statuses}
          selectedProjectIds={filters.projectIds}
          onToggleLabel={onToggleLabel}
          onToggleStatus={onToggleStatus}
          projectLabels={projectLabels}
          portalContainer={portalContainer}
          isLoading={isLoading}
        />

        <AssigneeFilter
          selectedIds={filters.assigneeIds}
          selectedProjectIds={filters.projectIds}
          onToggle={onToggleAssignee}
          portalContainer={portalContainer}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};

// Project Filter
interface ProjectFilterProps {
  selectedIds: string[];
  onToggle: (id: string) => void;
  portalContainer: HTMLElement | null;
  isLoading: boolean;
}

const ProjectFilter: React.FC<ProjectFilterProps> = ({
  selectedIds,
  onToggle,
  portalContainer,
  isLoading,
}) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: async () => {
      const result = await apiService.getProjects();
      return result.success ? result.data || [] : [];
    },
    enabled: !!user,
    staleTime: 300_000,
  });

  const filteredProjects = useMemo(() => {
    if (!debouncedQuery) return projects.slice(0, 5);
    return projects
      .filter(p =>
        formatProjectName(p)
          .toLowerCase()
          .includes(debouncedQuery.toLowerCase())
      )
      .slice(0, 5);
  }, [projects, debouncedQuery]);

  const displayLabel = useMemo(() => {
    if (selectedIds.length === 0) return 'All projects';
    if (selectedIds.length === 1) {
      const project = projects.find(p => String(p.id) === selectedIds[0]);
      return project ? formatProjectName(project) : '1 selected';
    }
    return `${selectedIds.length} selected`;
  }, [selectedIds, projects]);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">Project</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="text-xs h-8 w-full justify-between"
            disabled={isLoading}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-gray-400 transition-transform',
                open && 'rotate-90'
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-2 w-64"
          container={portalContainer ?? undefined}
          align="start"
          sideOffset={4}
        >
          <div className="space-y-2">
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects"
              className="text-xs h-8"
            />
            <div className="max-h-56 overflow-auto space-y-1">
              {projectsLoading ? (
                <LoadingSkeleton count={3} />
              ) : filteredProjects.length === 0 ? (
                <p className="text-xs text-gray-500 p-2">No projects found</p>
              ) : (
                filteredProjects.map(project => {
                  const id = String(project.id);
                  const checked = selectedIds.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => onToggle(id)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center gap-2"
                    >
                      <Checkbox checked={checked} />
                      <span className="text-xs truncate">
                        {formatProjectName(project)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Labels & Status Filter
interface LabelsStatusFilterProps {
  selectedLabels: string[];
  selectedStatuses: string[];
  selectedProjectIds: string[];
  onToggleLabel: (name: string) => void;
  onToggleStatus: (status: string) => void;
  projectLabels: Record<string, GitLabLabel[]>;
  portalContainer: HTMLElement | null;
  isLoading: boolean;
}

const LabelsStatusFilter: React.FC<LabelsStatusFilterProps> = ({
  selectedLabels,
  selectedStatuses,
  selectedProjectIds,
  onToggleLabel,
  onToggleStatus,
  projectLabels,
  portalContainer,
  isLoading,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);

  const combinedLabels = useMemo(() => {
    const map = new Map<string, GitLabLabel>();
    selectedProjectIds.forEach(projectId => {
      const labels = projectLabels[projectId] || [];
      labels.forEach(label => {
        const key = label.name.toLowerCase();
        if (!map.has(key)) map.set(key, label);
      });
    });
    return Array.from(map.values());
  }, [projectLabels, selectedProjectIds]);

  const filteredLabels = useMemo(() => {
    if (!debouncedQuery) return combinedLabels.slice(0, 5);
    return combinedLabels
      .filter(l => l.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
      .slice(0, 5);
  }, [combinedLabels, debouncedQuery]);

  const totalSelected = selectedLabels.length + selectedStatuses.length;
  const displayLabel = useMemo(() => {
    if (totalSelected === 0) {
      return selectedProjectIds.length ? 'Select...' : 'Select project first';
    }
    const combined = [...selectedStatuses, ...selectedLabels];
    return totalSelected === 1 ? combined[0] : `${totalSelected} selected`;
  }, [totalSelected, selectedLabels, selectedStatuses, selectedProjectIds]);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">Labels & Status</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="text-xs h-8 w-full justify-between"
            disabled={isLoading}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-gray-400 transition-transform',
                open && 'rotate-90'
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-2 w-64"
          container={portalContainer ?? undefined}
          align="start"
          sideOffset={4}
        >
          <div className="space-y-2">
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search labels"
              className="text-xs h-8"
            />
            <div className="max-h-56 overflow-auto space-y-1">
              {/* Status Options */}
              {['open', 'closed'].map(status => {
                const checked = selectedStatuses.includes(status);
                const displayName =
                  status.charAt(0).toUpperCase() + status.slice(1);
                const dotColor = status === 'closed' ? '#6b7280' : '#22c55e';

                return (
                  <button
                    key={status}
                    onClick={() => onToggleStatus(status)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Checkbox checked={checked} />
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: dotColor }}
                    />
                    <span className="text-xs">{displayName}</span>
                  </button>
                );
              })}

              {/* Separator */}
              {filteredLabels.length > 0 && (
                <div className="border-t border-gray-200 my-1" />
              )}

              {/* Label Options */}
              {filteredLabels.length === 0 && selectedProjectIds.length > 0 ? (
                <p className="text-xs text-gray-500 p-2">No labels found</p>
              ) : filteredLabels.length === 0 ? (
                <p className="text-xs text-gray-500 p-2">
                  Select a project to see labels
                </p>
              ) : (
                filteredLabels.map(label => {
                  const checked = selectedLabels.includes(label.name);
                  return (
                    <button
                      key={label.id}
                      onClick={() => onToggleLabel(label.name)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center gap-2"
                    >
                      <Checkbox checked={checked} />
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="text-xs truncate">{label.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Assignee Filter
interface AssigneeFilterProps {
  selectedIds: string[];
  selectedProjectIds: string[];
  onToggle: (id: string) => void;
  portalContainer: HTMLElement | null;
  isLoading: boolean;
}

const AssigneeFilter: React.FC<AssigneeFilterProps> = ({
  selectedIds,
  selectedProjectIds,
  onToggle,
  portalContainer,
  isLoading,
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);

  const projectId =
    selectedProjectIds.length === 1 ? selectedProjectIds[0] : '';

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users', projectId, debouncedQuery],
    queryFn: async () => {
      const result = await apiService.searchUsersInProject(projectId, {
        search: debouncedQuery || undefined,
        limit: 5,
      });
      return result.success ? result.data || [] : [];
    },
    enabled: !!projectId,
    staleTime: 300_000,
  });

  const displayLabel = useMemo(() => {
    if (selectedIds.length === 0) return 'Anyone';
    if (selectedIds.includes('unassigned')) return 'Unassigned';
    if (selectedIds.length === 1) {
      const user = users.find(u => String(u.id) === selectedIds[0]);
      return user ? user.name : '1 selected';
    }
    return `${selectedIds.length} selected`;
  }, [selectedIds, users]);

  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">Assignee</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="text-xs h-8 w-full justify-between"
            disabled={isLoading}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-gray-400 transition-transform',
                open && 'rotate-90'
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-2 w-64"
          container={portalContainer ?? undefined}
          align="end"
          sideOffset={4}
        >
          <div className="space-y-2">
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search assignees"
              className="text-xs h-8"
            />
            <div className="max-h-56 overflow-auto space-y-1">
              {usersLoading ? (
                <LoadingSkeleton count={3} />
              ) : (
                <>
                  <button
                    onClick={() => onToggle('unassigned')}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Checkbox checked={selectedIds.includes('unassigned')} />
                    <span className="text-xs">Unassigned</span>
                  </button>

                  {users.map(user => {
                    const id = String(user.id);
                    const checked = selectedIds.includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => onToggle(id)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center gap-2"
                      >
                        <Checkbox checked={checked} />
                        <span className="text-xs truncate">
                          {user.name} {user.username && `@${user.username}`}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// Issue Card Component
interface IssueCardProps {
  issue: IssueListItem;
  onSelect?: (issue: IssueListItem) => void;
}

const IssueCard: React.FC<IssueCardProps> = ({ issue, onSelect }) => {
  return (
    <button
      onClick={() => onSelect?.(issue)}
      className="w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
            {issue.title}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            {issue.number && <span>#{issue.number}</span>}
            <span>·</span>
            <span className="truncate">{issue.project?.name}</span>
          </div>
          {issue.labels && issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {issue.labels.slice(0, 3).map((label, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {label}
                </Badge>
              ))}
              {issue.labels.length > 3 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{issue.labels.length - 3}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

// Loading States
const LoadingState: React.FC = () => (
  <div className="space-y-2">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="p-3 rounded-lg border">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    ))}
  </div>
);

const LoadingMoreState: React.FC = () => (
  <div className="flex items-center justify-center py-4">
    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
  </div>
);

const LoadingSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <>
    {[...Array(count)].map((_, i) => (
      <div key={i} className="flex items-center gap-2 px-2 py-1.5">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 flex-1" />
      </div>
    ))}
  </>
);

// Error State
const ErrorState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
    <p className="text-sm text-red-600">{message}</p>
  </div>
);

// Empty State
const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <p className="text-sm text-gray-500">No issues found</p>
    <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
  </div>
);

// Helper function
function getStatusFilter(
  selectedStatuses: string[]
): 'draft' | 'submitted' | 'in_progress' | 'resolved' | 'closed' | undefined {
  if (selectedStatuses.length === 0) return undefined;
  if (
    selectedStatuses.includes('open') &&
    selectedStatuses.includes('closed')
  ) {
    return undefined; // Show both
  }
  return selectedStatuses.includes('closed') ? 'closed' : undefined;
}

export default CompactIssueList;
