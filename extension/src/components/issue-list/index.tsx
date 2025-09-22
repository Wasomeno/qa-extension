import React, { useEffect } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/utils/useDebounce';
import useInfiniteIssues from '@/hooks/useInfiniteIssues';
import api, { GitLabUser, Project } from '@/services/api';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { Button } from '@/src/components/ui/ui/button';
import { Input } from '@/src/components/ui/ui/input';
// Select components are used in subcomponents
import { Badge } from '@/src/components/ui/ui/badge';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/src/components/ui/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/src/components/ui/ui/popover';
import { Checkbox } from '@/src/components/ui/ui/checkbox';
import AvatarGroup from '@/components/issue-list/AvatarGroup';
import { Label } from '@/src/components/ui/ui/label';
// Icons used in subcomponents
import { storageService } from '@/services/storage';
import IssueRow from '@/components/issue-list/issue-row';

// Custom query hooks
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

const useLabelsQuery = (projectId: string, enabled: boolean) => {
  return useQuery({
    queryKey: ['labels', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.getGitLabProjectLabels(projectId);
      if (!res.success) throw new Error(res.error || 'Failed to load labels');
      return res.data?.items || [];
    },
    enabled: !!projectId && enabled,
    staleTime: 300_000,
  });
};

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 px-2">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

interface IssueListProps {
  className?: string;
  portalContainer?: Element | null;
  onSelect?: (item: any) => void;
}

const IssueListInner: React.FC<IssueListProps> = ({
  className,
  onSelect,
  portalContainer,
}) => {
  const queryClient = useQueryClient();
  const keyboardIsolation = useKeyboardIsolation();
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const [search, setSearch] = React.useState('');
  // Filters
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<string[]>(
    []
  );
  const [selectedAssigneeIds, setSelectedAssigneeIds] = React.useState<
    string[]
  >([]);
  const [selectedLabels, setSelectedLabels] = React.useState<string[]>([]);
  const [createdBy] = React.useState<'me' | 'any'>('any');
  const [sort, setSort] = React.useState<'newest' | 'oldest'>('newest');
  const debouncedSearch = useDebounce(search, 500);

  // Popover/search states for filters
  const [openProjects, setOpenProjects] = React.useState(false);
  const [openAssignees, setOpenAssignees] = React.useState(false);
  const [openLabels, setOpenLabels] = React.useState(false);
  const [projectQuery, setProjectQuery] = React.useState('');
  const [assigneeQuery, setAssigneeQuery] = React.useState('');
  const [labelsQuery, setLabelsQuery] = React.useState('');
  const debouncedProjectQuery = useDebounce(projectQuery, 500);
  const debouncedAssigneeQuery = useDebounce(assigneeQuery, 500);
  const debouncedLabelsQuery = useDebounce(labelsQuery, 500);

  // Use custom query hooks instead of local state
  const projectsQuery = useProjectsQuery(debouncedProjectQuery);
  const usersQuery = useUsersQuery(
    selectedProjectIds.length === 1 ? selectedProjectIds[0] : '',
    debouncedAssigneeQuery
  );
  const projectLabelsQuery = useLabelsQuery(
    selectedProjectIds.length === 1 ? selectedProjectIds[0] : '',
    openLabels
  );

  // Extract data and states from queries
  const projects = projectsQuery.data || [];
  const users = usersQuery.data || [];
  const labelsOptions = projectLabelsQuery.data || [];
  const loadingProjects = projectsQuery.isLoading;
  const loadingUsers = usersQuery.isLoading;
  const loadingLabels = projectLabelsQuery.isLoading;
  const authError = projectsQuery.error?.message || usersQuery.error?.message || projectLabelsQuery.error?.message || null;
  const [selectedIssue, setSelectedIssue] = React.useState<any | null>(null);

  // Removed ineffective useEffects - now handled by React Query hooks above

  const {
    items,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
  } = useInfiniteIssues({
    search: debouncedSearch || undefined,
    projectId:
      selectedProjectIds.length === 1 ? selectedProjectIds[0] : undefined,
    assigneeId:
      selectedAssigneeIds.length === 1 &&
      selectedAssigneeIds[0] !== 'unassigned'
        ? selectedAssigneeIds[0]
        : undefined,
    labels: selectedLabels,
    limit: 5,
    sort,
  });

  const issuesQueryKey = React.useMemo(
    () => [
      'issues',
      {
        search: (debouncedSearch || '') as string,
        projectId: (selectedProjectIds.length === 1
          ? selectedProjectIds[0]
          : '') as string,
        labels: selectedLabels.slice().sort().join(','),
        assigneeId: (selectedAssigneeIds.length === 1
          ? selectedAssigneeIds[0]
          : '') as string,
        createdBy: createdBy || 'me',
        status: '',
        limit: 5,
        sort: sort || 'newest',
      },
    ],
    [
      debouncedSearch,
      selectedProjectIds,
      selectedAssigneeIds,
      selectedLabels,
      createdBy,
      sort,
    ]
  );

  // Fetch project label palettes to color label dots (GitLab-like)
  const projectIds = React.useMemo(
    () =>
      Array.from(
        new Set((items || []).map(it => it.project?.id).filter(Boolean))
      ) as string[],
    [items]
  );
  const labelQueries = useQueries({
    queries: projectIds.map(pid => ({
      queryKey: ['gitlab-labels', pid],
      enabled: !!pid,
      staleTime: 300_000,
      queryFn: async () => {
        const res = await api.getGitLabProjectLabels(pid);
        if (!res.success) throw new Error(res.error || 'Failed to load labels');
        return res.data?.items || [];
      },
    })),
  });
  const labelPalettes = React.useMemo(() => {
    const map: Record<
      string,
      Map<
        string,
        {
          id: number;
          name: string;
          color: string;
          text_color?: string;
          description?: string;
        }
      >
    > = {};
    labelQueries.forEach((q, idx) => {
      const pid = projectIds[idx];
      const labels = (q.data as any[]) || [];
      const inner = new Map<string, any>();
      labels.forEach((l: any) => inner.set(l.name, l));
      map[pid] = inner;
    });
    return map;
  }, [labelQueries, projectIds]);

  // Helpers for filter UIs
  const visibleLabels = React.useMemo(() => {
    const q = (debouncedLabelsQuery || '').trim().toLowerCase();
    const list = (labelsOptions || []).filter((l: any) =>
      !q ? true : String(l.name).toLowerCase().includes(q)
    );
    return list.slice(0, 5);
  }, [labelsOptions, debouncedLabelsQuery]);

  const toggleLabel = (name: string) => {
    setSelectedLabels(prev =>
      prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]
    );
  };

  const toggleProject = (id: string) => {
    setSelectedProjectIds(prev => {
      const next = prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id];
      // If moving away from a single selected project, clear labels to avoid cross-project mismatch
      if (next.length !== 1 && selectedLabels.length) setSelectedLabels([]);
      return next;
    });
  };

  const toggleAssignee = (id: string) => {
    setSelectedAssigneeIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const visibleIssues = React.useMemo(() => {
    let out = items;
    if (selectedProjectIds.length) {
      const set = new Set(selectedProjectIds.map(String));
      out = out.filter(it =>
        it.project?.id ? set.has(String(it.project.id)) : false
      );
    }
    if (selectedAssigneeIds.length) {
      const set = new Set(selectedAssigneeIds.map(String));
      out = out.filter(it => {
        const anyItem: any = it as any;
        const assignees = Array.isArray(anyItem.assignees)
          ? anyItem.assignees
          : it.assignee
            ? [it.assignee]
            : [];
        const hasUnassigned = set.has('unassigned');
        const assignedIds = assignees.map((a: any) => String(a.id));
        const matchAssigned = assignedIds.some((id: string) => set.has(id));
        const isUnassigned = assignedIds.length === 0;
        return (hasUnassigned && isUnassigned) || matchAssigned;
      });
    }
    return out;
  }, [items, selectedProjectIds, selectedAssigneeIds]);

  // Pinned triage state
  const [pinnedIds, setPinnedIds] = React.useState<Set<string>>(new Set());
  const [pinnedCount, setPinnedCount] = React.useState(0);

  React.useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      const list = await storageService.getPinnedIssues();
      const ids = new Set(list.map(p => p.id));
      setPinnedIds(ids);
      setPinnedCount(ids.size);
      unsub = storageService.onChanged('pinnedIssues', v => {
        const arr = (v as any[]) || [];
        const s = new Set(arr.map((p: any) => p.id));
        setPinnedIds(s);
        setPinnedCount(s.size);
      });
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const togglePin = async (id: string, item: any) => {
    if (pinnedIds.has(id)) {
      await storageService.unpinIssue(id);
      return;
    }
    if (pinnedCount >= 5) {
      // Optional: could show a toast here
      return;
    }
    await storageService.pinIssue(id);
    // Persist GitLab reference (projectId + iid) for detail fetching
    const projectId = item?.project?.id;
    const iid = (item?.number ??
      (item as any)?.iid ??
      (item as any)?.gitlabIssueIid) as number | undefined;
    const webUrl = (item as any)?.webUrl || (item as any)?.web_url;
    if (projectId && typeof iid === 'number') {
      await storageService.updatePinnedRef(id, { projectId, iid, webUrl });
    }

    try {
      await storageService.upsertPinnedSnapshot(
        id,
        Object.assign({}, item as any, { lastSyncedAt: Date.now() }) as any
      );
    } catch {}
  };

  // Handlers and helpers moved out of JSX
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };
  const handleProjectQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectQuery(e.target.value);
  };
  const handleAssigneeQueryChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setAssigneeQuery(e.target.value);
  };
  const handleLabelsQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabelsQuery(e.target.value);
  };
  const handleDialogOpenChange = (open: boolean) => {
    if (!open) setSelectedIssue(null);
  };
  // (reserved) stopPropagation helper if needed in this component

  // Option click handlers maps
  const projectClickHandlers = React.useMemo(() => {
    const map = new Map<string, () => void>();
    (projects || []).forEach(p => {
      const id = String(p.id);
      map.set(id, () => toggleProject(id));
    });
    return map;
  }, [projects, selectedProjectIds, selectedLabels]);

  const assigneeClickHandlers = React.useMemo(() => {
    const map = new Map<string, () => void>();
    map.set('unassigned', () => toggleAssignee('unassigned'));
    (users || []).forEach(u => {
      const id = String(u.id);
      map.set(id, () => toggleAssignee(id));
    });
    return map;
  }, [users, selectedAssigneeIds]);

  const labelClickHandlers = React.useMemo(() => {
    const map = new Map<string, () => void>();
    (visibleLabels || []).forEach(l => {
      map.set(l.name, () => toggleLabel(l.name));
    });
    return map;
  }, [visibleLabels, selectedLabels]);

  const handleIssueOpen = (item: any) => {
    if (onSelect) onSelect(item);
    else setSelectedIssue(item);
  };

  const handleIssueStatusChange = async (
    projectId: string | undefined,
    iid: number | undefined,
    val: 'open' | 'closed'
  ) => {
    if (!projectId || !iid) return;
    try {
      await api.updateGitLabIssue(projectId, iid, {
        state: val === 'closed' ? 'close' : 'reopen',
      });
      await refetch();
    } catch (_) {
      await refetch();
    }
  };

  const handleIssueLabelsChange = async (
    projectId: string | undefined,
    iid: number | undefined,
    vals: string[]
  ) => {
    if (!projectId || !iid) return;
    await queryClient.cancelQueries({ queryKey: issuesQueryKey });
    const prev = queryClient.getQueryData(issuesQueryKey) as any;
    queryClient.setQueryData(issuesQueryKey, (old: any) => {
      if (!old || !old.pages) return old;
      return {
        ...old,
        pages: old.pages.map((p: any) => ({
          ...p,
          items: (p.items || []).map((it: any) =>
            String(it?.project?.id) === String(projectId) &&
            Number(it?.number) === Number(iid)
              ? { ...it, labels: vals }
              : it
          ),
        })),
      };
    });
    setSelectedIssue((prevSelected: any | null) => {
      if (!prevSelected) return prevSelected;
      const sameIssue =
        String((prevSelected as any)?.project?.id) === String(projectId) &&
        Number((prevSelected as any)?.number) === Number(iid);
      return sameIssue ? { ...prevSelected, labels: vals } : prevSelected;
    });
    try {
      const res = await api.updateGitLabIssue(projectId, iid, {
        labels: vals,
      });
      const serverLabels: string[] | undefined = Array.isArray(
        (res.data as any)?.labels
      )
        ? ((res.data as any).labels as string[])
        : undefined;
      if (serverLabels && serverLabels.length) {
        queryClient.setQueryData(issuesQueryKey, (old: any) => {
          if (!old || !old.pages) return old;
          return {
            ...old,
            pages: old.pages.map((p: any) => ({
              ...p,
              items: (p.items || []).map((it: any) =>
                String(it?.project?.id) === String(projectId) &&
                Number(it?.number) === Number(iid)
                  ? { ...it, labels: serverLabels }
                  : it
              ),
            })),
          };
        });
        setSelectedIssue((prevSelected: any | null) => {
          if (!prevSelected) return prevSelected;
          const sameIssue =
            String((prevSelected as any)?.project?.id) === String(projectId) &&
            Number((prevSelected as any)?.number) === Number(iid);
          return sameIssue
            ? { ...prevSelected, labels: serverLabels }
            : prevSelected;
        });
      }
    } catch (e) {
      queryClient.setQueryData(issuesQueryKey, prev);
    }
  };

  const visibleUsersList = React.useMemo(() => {
    return (users || [])
      .filter(u =>
        !debouncedAssigneeQuery
          ? true
          : `${u.name} ${u.username}`
              .toLowerCase()
              .includes(debouncedAssigneeQuery.toLowerCase())
      )
      .slice(0, 5);
  }, [users, debouncedAssigneeQuery]);

  const renderProjectOption = (p: Project) => {
    const id = String(p.id);
    const checked = selectedProjectIds.includes(id);
    const onClick = projectClickHandlers.get(id);
    return (
      <li key={id} role="option" aria-selected={checked}>
        <button
          type="button"
          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
          onClick={onClick}
        >
          <Checkbox
            className="mr-1 data-[state=checked]:accent-neutral-500"
            checked={checked}
          />
          <span className="truncate">{p.name}</span>
        </button>
      </li>
    );
  };

  const renderAssigneeOption = (u: GitLabUser) => {
    const id = String(u.id);
    const checked = selectedAssigneeIds.includes(id);
    const onClick = assigneeClickHandlers.get(id);
    return (
      <li key={id} role="option" aria-selected={checked}>
        <button
          type="button"
          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
          onClick={onClick}
        >
          <Checkbox className="mr-1" checked={checked} />
          <span className="truncate">
            {u.name} {u.username ? `@${u.username}` : ''}
          </span>
        </button>
      </li>
    );
  };

  const renderLabelOption = (l: {
    id: number;
    name: string;
    color: string;
  }) => {
    const checked = selectedLabels.includes(l.name);
    const onClick = labelClickHandlers.get(l.name);
    return (
      <li key={l.id} role="option" aria-selected={checked}>
        <button
          type="button"
          className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
          onClick={onClick}
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
  };

  const renderIssueRow = (item: any) => {
    const projectId = item.project?.id as string | undefined;
    const iid = item.number as number | undefined;
    const palette = projectId ? labelPalettes[projectId] : undefined;
    const selectedLabels = Array.isArray(item.labels) ? item.labels : [];
    return (
      <IssueRow
        key={item.id}
        item={item}
        pinned={pinnedIds.has(item.id)}
        pinDisabled={!pinnedIds.has(item.id) && pinnedCount >= 5}
        onTogglePin={() => togglePin(item.id, item)}
        onOpen={handleIssueOpen}
        projectLabelPalette={palette}
        selectedLabels={selectedLabels}
        onChangeLabels={(vals: string[]) =>
          handleIssueLabelsChange(projectId, iid, vals)
        }
        onChangeState={(val: 'open' | 'closed') =>
          handleIssueStatusChange(projectId, iid, val)
        }
        portalContainer={portalContainer}
      />
    );
  };

  const renderLoadingCard = (_: unknown, i: number) => (
    <div
      key={i}
      className="rounded-lg glass-card border border-gray-100 p-3 bg-white shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
      <div className="mt-3 flex gap-1">
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
    </div>
  );

  const renderDialogAssigneesSection = (issue: any) => {
    if (!issue) return null;
    const anyItem: any = issue as any;
    const assignees = Array.isArray(anyItem.assignees)
      ? anyItem.assignees
      : issue.assignee
        ? [issue.assignee]
        : [];
    return assignees.length ? (
      <div>
        <div className="text-xs font-medium text-gray-700 mb-1">Assignees</div>
        <AvatarGroup users={assignees as any} size={28} />
      </div>
    ) : null;
  };

  // Infinite scroll sentinel observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        const first = entries[0];
        if (first.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: null, rootMargin: '100px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items]);

  return (
    <div
      className={cn('flex flex-col h-full min-h-0', className)}
      {...keyboardIsolation}
    >
      <div className="p-4 space-y-3">
        {authError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
            {authError}. Please open the extension popup and sign in, then
            retry.
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search issues..."
            className="text-sm glass-input text-white placeholder:text-white"
            disabled={(isLoading && (!search || search === '')) || projectsQuery.isLoading}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Project</Label>
            <Popover open={openProjects} onOpenChange={setOpenProjects}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs h-8 glass-input w-full justify-between"
                  disabled={isLoading || projectsQuery.isLoading}
                >
                  <span className="truncate">
                    {selectedProjectIds.length > 0
                      ? `${selectedProjectIds.length} selected`
                      : 'All projects'}
                  </span>
                  {selectedProjectIds.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {selectedProjectIds.length}
                    </Badge>
                  )}
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
                    onChange={handleProjectQueryChange}
                    placeholder="Search projects"
                    className="text-xs h-8"
                  />
                  <div className="max-h-56 overflow-auto">
                    {loadingProjects ? (
                      <div className="space-y-2">
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                      </div>
                    ) : projects.length === 0 ? (
                      <div className="text-xs text-neutral-500 px-1 py-2">
                        No options found
                      </div>
                    ) : (
                      <ul
                        className="text-xs"
                        role="listbox"
                        aria-label="Projects"
                      >
                        {projects.slice(0, 5).map(renderProjectOption)}
                      </ul>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Labels</Label>
            <Popover open={openLabels} onOpenChange={setOpenLabels}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs h-8 glass-input w-full justify-between"
                  disabled={isLoading || selectedProjectIds.length !== 1 || projectLabelsQuery.isLoading}
                >
                  <span className="truncate">
                    {selectedLabels.length > 0
                      ? `${selectedLabels.length} selected`
                      : selectedProjectIds.length === 1
                        ? 'Select labels'
                        : 'Select a single project'}
                  </span>
                  {selectedLabels.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {selectedLabels.length}
                    </Badge>
                  )}
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
                    onChange={handleLabelsQueryChange}
                    placeholder="Search labels"
                    className="text-xs h-8"
                    disabled={loadingLabels}
                  />
                  <div className="max-h-56 overflow-auto">
                    {loadingLabels ? (
                      <div className="space-y-2">
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                      </div>
                    ) : visibleLabels.length === 0 ? (
                      <div className="text-xs text-neutral-500 px-1 py-2">
                        No options found
                      </div>
                    ) : (
                      <ul
                        className="text-xs"
                        role="listbox"
                        aria-label="Labels"
                      >
                        {visibleLabels.map(renderLabelOption)}
                      </ul>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Assignee (multi-select) */}
          <div className="space-y-1">
            <Label className="text-xs">Assignee</Label>
            <Popover open={openAssignees} onOpenChange={setOpenAssignees}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="text-xs h-8 glass-input w-full justify-between"
                  disabled={isLoading || usersQuery.isLoading}
                >
                  <span className="truncate">
                    {selectedAssigneeIds.length > 0
                      ? `${selectedAssigneeIds.length} selected`
                      : 'Anyone'}
                  </span>
                  {selectedAssigneeIds.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {selectedAssigneeIds.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-2 w-72"
                container={portalContainer || undefined}
                align="start"
              >
                <div className="space-y-2">
                  <Input
                    value={assigneeQuery}
                    onChange={handleAssigneeQueryChange}
                    placeholder="Search assignees"
                    className="text-xs h-8"
                    disabled={selectedProjectIds.length !== 1}
                  />
                  <div className="max-h-56 overflow-auto">
                    {loadingUsers ? (
                      <div className="space-y-2">
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                      </div>
                    ) : (
                      <ul
                        className="text-xs"
                        role="listbox"
                        aria-label="Assignees"
                      >
                        <li>
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-neutral-100 flex items-center gap-2"
                            onClick={assigneeClickHandlers.get('unassigned')}
                          >
                            <Checkbox
                              className="mr-1"
                              checked={selectedAssigneeIds.includes(
                                'unassigned'
                              )}
                            />
                            Unassigned
                          </button>
                        </li>
                        {visibleUsersList.map(renderAssigneeOption)}
                      </ul>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-scroll px-4 py-2 space-y-2">
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map(renderLoadingCard)}
          </div>
        )}
        {isError && (
          <div className="text-xs text-red-600">
            {(error as any)?.message || 'Failed to load issues'}
          </div>
        )}
        {!isLoading && !isError && items.length === 0 && (
          <div className="text-xs text-white/70">No issues found.</div>
        )}

        {visibleIssues.map(renderIssueRow)}

        <div ref={sentinelRef} />
        {isFetchingNextPage && (
          <div className="space-y-2">
            {[...Array(2)].map(renderLoadingCard)}
          </div>
        )}
      </div>
      {/* Detail dialog */}
      {!onSelect && (
        <Dialog open={!!selectedIssue} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="sm:max-w-lg">
            {selectedIssue && (
              <div>
                <DialogHeader>
                  <DialogTitle className="text-base leading-snug">
                    {selectedIssue.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    #{selectedIssue.number ?? '—'} ·{' '}
                    {selectedIssue.project?.name ?? 'Unknown project'} · by{' '}
                    {selectedIssue.author?.name ?? 'Unknown'}
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-3 space-y-3">
                  {renderDialogAssigneesSection(selectedIssue)}

                  {selectedIssue.labels?.length ? (
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-1">
                        Labels
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {selectedIssue.labels.map((l: string) => (
                          <Badge
                            key={l}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0.5"
                          >
                            {l}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="text-xs text-gray-500">
                    Created {new Date(selectedIssue.createdAt).toLocaleString()}
                  </div>

                  {/* Description may not be available in list data */}
                  {selectedIssue.description ? (
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-1">
                        Description
                      </div>
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-gray-800">
                        {selectedIssue.description}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

const IssueList: React.FC<IssueListProps> = props => {
  return <IssueListInner {...props} />;
};

export default IssueList;
