import React, { useEffect } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/utils/useDebounce';
import useInfiniteIssues from '@/hooks/useInfiniteIssues';
import api, { GitLabUser, Project } from '@/services/api';
import { cn } from '@/lib/utils';
import { useKeyboardIsolation } from '@/hooks/useKeyboardIsolation';
import { Button } from '@/src/components/ui/ui/button';
import { Input } from '@/src/components/ui/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/ui/select';
import { Badge } from '@/src/components/ui/ui/badge';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/src/components/ui/ui/dialog';
import AvatarGroup from '@/components/issue-list/AvatarGroup';
import { Label } from '@/src/components/ui/ui/label';
import { FiStar } from 'react-icons/fi';
import { AiFillStar } from 'react-icons/ai';
import { storageService } from '@/services/storage';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

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
  const [projectId, setProjectId] = React.useState<string | undefined>(
    undefined
  );
  const [assigneeId, setAssigneeId] = React.useState<string | undefined>(
    undefined
  );
  const [createdBy, setCreatedBy] = React.useState<'me' | 'any'>('me');
  const [sort, setSort] = React.useState<'newest' | 'oldest'>('newest');
  const debouncedSearch = useDebounce(search, 300);

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [users, setUsers] = React.useState<GitLabUser[]>([]);
  const [loadingMeta, setLoadingMeta] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = React.useState<any | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingMeta(true);
      setAuthError(null);
      const projectsRes = await api.getProjects();
      if (!mounted) return;
      if (projectsRes.success && projectsRes.data) {
        setProjects(projectsRes.data);
      } else if (!projectsRes.success) {
        setAuthError(projectsRes.error || 'Authentication required');
      }
      setLoadingMeta(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Load users when a project is selected
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!projectId) {
        setUsers([]);
        return;
      }
      const res = await api.getUsersInProject(projectId);
      if (!mounted) return;
      if (res.success && res.data) setUsers(res.data);
      else setUsers([]);
    })();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  const {
    items,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useInfiniteIssues({
    search: debouncedSearch || undefined,
    projectId,
    assigneeId,
    createdBy,
    // omit status to show all states
    limit: 5,
    sort,
  });

  // Build the same query key used in useInfiniteIssues for cache updates
  const issuesQueryKey = React.useMemo(
    () => [
      'issues',
      {
        search: (debouncedSearch || '') as string,
        projectId: (projectId || '') as string,
        labels: '',
        assigneeId: (assigneeId || '') as string,
        createdBy: createdBy || 'me',
        status: '',
        limit: 5,
        sort: sort || 'newest',
      },
    ],
    [debouncedSearch, projectId, assigneeId, createdBy, sort]
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
      labels.forEach(l => inner.set(l.name, l));
      map[pid] = inner;
    });
    return map;
  }, [labelQueries, projectIds]);

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

    // Save the whole item as snapshot (no extra fetch)
    console.log('ITEM', item);
    try {
      await storageService.upsertPinnedSnapshot(
        id,
        Object.assign({}, item as any, { lastSyncedAt: Date.now() }) as any
      );
    } catch {}
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
            onChange={e => setSearch(e.target.value)}
            placeholder="Search issues..."
            className="text-sm glass-input text-white placeholder:text-white"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Scope</Label>
            <Select
              value={createdBy}
              onValueChange={(v: any) => setCreatedBy(v)}
            >
              <SelectTrigger className="text-xs h-8 glass-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                container={portalContainer || undefined}
                sideOffset={8}
                className="glass-panel"
              >
                <SelectItem value="me">Created by me</SelectItem>
                <SelectItem value="any">All accessible</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Project</Label>
            <Select
              value={projectId ?? 'all'}
              onValueChange={(v: string) =>
                setProjectId(v === 'all' ? undefined : v)
              }
            >
              <SelectTrigger className="text-xs h-8 glass-input">
                <SelectValue
                  placeholder={loadingMeta ? 'Loading...' : 'All projects'}
                />
              </SelectTrigger>
              <SelectContent
                container={portalContainer || undefined}
                sideOffset={8}
                className="glass-panel"
              >
                <SelectItem value="all">All projects</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Assignee</Label>
            <Select
              value={assigneeId ?? 'any'}
              onValueChange={(v: string) =>
                setAssigneeId(v === 'any' ? undefined : v)
              }
            >
              <SelectTrigger className="text-xs h-8 glass-input">
                <SelectValue
                  placeholder={loadingMeta ? 'Loading...' : 'Anyone'}
                />
              </SelectTrigger>
              <SelectContent
                container={portalContainer || undefined}
                sideOffset={8}
                className="glass-panel"
              >
                <SelectItem value="any">Anyone</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} @{u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-2 space-y-2">
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
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
            ))}
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

        {items.map(item => {
          const anyItem: any = item as any;
          const assignees = Array.isArray(anyItem.assignees)
            ? anyItem.assignees
            : item.assignee
              ? [item.assignee]
              : [];
          const openedAgo = item.createdAt
            ? dayjs(item.createdAt).fromNow()
            : '';
          return (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onSelect ? onSelect(item) : setSelectedIssue(item)
              }
              className="group glass-card shadow-none w-full text-left rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50/25"
              aria-label={`Open issue ${item.title}`}
            >
              <div className="flex flex-col gap-2">
                {/* Row 1: Title left, number + status right */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="truncate max-w-[260px] text-[13px] font-semibold text-black hover:text-blue-600">
                          {item.title}
                        </div>
                      </div>
                      <div className="mt-0.5 text-[12px] text-black/70 truncate">
                        {item.project?.name ?? 'Project'}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <div className="text-[12px] text-black/70">#{item.number ?? '—'}</div>
                    {(() => {
                      const projectId = item.project?.id as string | undefined;
                      const iid = item.number as number | undefined;
                      const isClosed = (item as any)?.state === 'closed';
                      const value = isClosed ? 'closed' : 'open';
                      const handleChange = async (val: string) => {
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
                      return (
                        <div onClick={e => e.stopPropagation()}>
                          <Select value={value} onValueChange={handleChange}>
                            <SelectTrigger className="h-7 w-[100px] text-[12px] glass-input">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'inline-block w-2.5 h-2.5 rounded-full',
                                    isClosed ? 'bg-gray-400' : 'bg-emerald-500'
                                  )}
                                />
                                <span className="capitalize">{value}</span>
                              </div>
                            </SelectTrigger>
                            <SelectContent
                              container={portalContainer || undefined}
                              sideOffset={6}
                              className="glass-modal rounded-lg"
                            >
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Row 2: Opened by ... | star + more */}
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] text-black/70 truncate">
                    {openedAgo ? <span>Opened {openedAgo}</span> : null}
                    {item.author?.name ? (
                      <>
                        <span className="mx-1">•</span>
                        <span>by {item.author.name}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 glass-button"
                      title={
                        pinnedIds.has(item.id)
                          ? 'Unpin'
                          : pinnedCount >= 5
                            ? 'Pinned limit reached'
                            : 'Pin'
                      }
                      onClick={e => {
                        e.stopPropagation();
                        togglePin(item.id, item);
                      }}
                      disabled={!pinnedIds.has(item.id) && pinnedCount >= 5}
                    >
                      {pinnedIds.has(item.id) ? (
                        <AiFillStar className="w-4 h-4 text-amber-500" />
                      ) : (
                        <FiStar className="w-4 h-4 text-gray-400" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 glass-button text-black/60"
                      title="More"
                      onClick={e => e.stopPropagation()}
                    >
                      ⋯
                    </Button>
                  </div>
                </div>

                {/* Row 3: spacer */}
                <div className="h-1" />

                {/* Row 4: Labels heading + selector */}
                <div className="space-y-1" onClick={e => e.stopPropagation()}>
                  <div className="text-[11px] font-medium text-black/70">Labels</div>
                  {(() => {
                    const projectId = item.project?.id as string | undefined;
                    const palette = projectId ? labelPalettes[projectId] : undefined;
                    const labelsArray = palette ? Array.from(palette.values()) : [];
                    const selectedLabel =
                      item.labels && item.labels.length ? item.labels[0] : undefined;
                    const iid = item.number as number | undefined;
                    const handleSelect = async (val: string) => {
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
                                ? { ...it, labels: [val] }
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
                        return sameIssue ? { ...prevSelected, labels: [val] } : prevSelected;
                      });
                      try {
                        const res = await api.updateGitLabIssue(projectId, iid, {
                          labels: [val],
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
                    return (
                      <Select value={selectedLabel} onValueChange={handleSelect}>
                        <SelectTrigger className="h-7 w-40 text-[12px] glass-input">
                          {selectedLabel && palette ? (
                            <div className="flex items-center gap-2 truncate">
                              {palette.get(selectedLabel)?.color ? (
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
                                  style={{
                                    backgroundColor: (palette.get(selectedLabel) as any).color,
                                  }}
                                />
                              ) : null}
                              <span className="truncate">{selectedLabel}</span>
                            </div>
                          ) : (
                            <SelectValue placeholder="Select label" />
                          )}
                        </SelectTrigger>
                        <SelectContent
                          container={portalContainer || undefined}
                          sideOffset={6}
                          className="glass-modal rounded-lg"
                        >
                          {labelsArray.map((l: any) => (
                            <SelectItem key={l.id} value={l.name}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
                                  style={{ backgroundColor: l.color }}
                                />
                                <span>{l.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>
              </div>
            </button>
          );
        })}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} />
        {isFetchingNextPage && (
          <div className="text-xs text-white/70">Loading more…</div>
        )}
      </div>
      {/* Detail dialog */}
      {!onSelect && (
        <Dialog
          open={!!selectedIssue}
          onOpenChange={open => !open && setSelectedIssue(null)}
        >
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
                  {(() => {
                    const anyItem: any = selectedIssue as any;
                    const assignees = Array.isArray(anyItem.assignees)
                      ? anyItem.assignees
                      : selectedIssue.assignee
                        ? [selectedIssue.assignee]
                        : [];
                    return assignees.length ? (
                      <div>
                        <div className="text-xs font-medium text-gray-700 mb-1">
                          Assignees
                        </div>
                        <AvatarGroup users={assignees as any} size={28} />
                      </div>
                    ) : null;
                  })()}

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
