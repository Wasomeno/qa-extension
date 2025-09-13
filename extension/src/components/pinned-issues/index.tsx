import React from 'react';
import { Button } from '@/src/components/ui/ui/button';
import { storageService, PinnedIssueSnapshot } from '@/services/storage';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '@/services/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/src/components/ui/ui/select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AiFillStar } from 'react-icons/ai';
import { FiStar } from 'react-icons/fi';

interface PinnedIssuesProps {
  className?: string;
  onSelect: (issue: PinnedIssueSnapshot) => void;
  portalContainer?: Element | null;
}

dayjs.extend(relativeTime);

const PinnedIssuesInner: React.FC<PinnedIssuesProps> = ({
  className,
  onSelect,
  portalContainer,
}) => {
  const [pinnedIds, setPinnedIds] = React.useState<Set<string>>(new Set());
  const [pinnedCount, setPinnedCount] = React.useState(0);

  const queryClient = useQueryClient();
  const pinnedIssues = useQuery({
    queryKey: ['pinnedIssues'],
    queryFn: async () => storageService.getParsedPinnedSnapshots(),
  });

  const unpin = async (id: string) => {
    try {
      await storageService.deletePinnedSnapshot(id);
    } catch {}
    try {
      await storageService.unpinIssue(id);
    } catch {}
  };

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

  // Drag-and-drop reordering removed

  return (
    <div
      className={cn(
        'flex flex-col w-[400px] overflow-y-scroll  h-full p-4',
        className
      )}
    >
      <div className="flex-1 p-1 space-y-1">
        {pinnedIssues.isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-2 glass-card border border-[color:var(--qa-border)] rounded-md p-1.5"
              >
                <Skeleton className="h-4 w-4 rounded" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="mt-2 flex gap-1">
                    <Skeleton className="h-4 w-14 rounded-full" />
                    <Skeleton className="h-4 w-10 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-4 w-8 rounded" />
                <Skeleton className="h-4 w-8 rounded" />
              </div>
            ))}
          </div>
        )}

        {!pinnedIssues.isLoading && pinnedIssues.data?.length === 0 ? (
          <div className="text-[10px] opacity-70 p-2">
            Pin issues from the Issue List to keep them handy here.
          </div>
        ) : null}

        {!pinnedIssues.isLoading && pinnedIssues.data?.length
          ? pinnedIssues.data?.map(issue => (
              <button
                key={issue.id}
                type="button"
                onClick={() => onSelect(issue)}
                className="glass-card shadow-none w-full text-left rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50/25"
                aria-label={`Open issue ${issue.title}`}
              >
                <div className="flex flex-col gap-2">
                  {/* Row 1: Title left, number + status right */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="truncate max-w-[260px] text-[13px] font-semibold text-black hover:text-blue-600">
                            {issue.title}
                          </div>
                        </div>
                        <div className="mt-0.5 text-[12px] text-black/70 truncate">
                          {issue.project?.name ?? 'Project'}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <div className="text-[12px] text-black/70">
                        #{issue.number ?? '—'}
                      </div>
                      {(() => {
                        const projectId = issue.project?.id as
                          | string
                          | undefined;
                        const iid = issue.number as number | undefined;
                        const isClosed = (issue as any)?.state === 'closed';
                        const value = isClosed ? 'closed' : 'open';
                        const handleChange = async (val: string) => {
                          if (!projectId || !iid) return;
                          await api.updateGitLabIssue(projectId, iid, {
                            state: val === 'closed' ? 'close' : 'reopen',
                          });
                        };
                        return (
                          <div onClick={e => e.stopPropagation()}>
                            <Select value={value} onValueChange={handleChange}>
                              <SelectTrigger className="h-7 w-[100px] text-[12px] glass-input">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      'inline-block w-2.5 h-2.5 rounded-full',
                                      isClosed
                                        ? 'bg-gray-400'
                                        : 'bg-emerald-500'
                                    )}
                                  />
                                  <span className="capitalize">{value}</span>
                                </div>
                              </SelectTrigger>
                              <SelectContent
                                container={portalContainer || undefined}
                                sideOffset={6}
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
                      {issue.author?.name ? (
                        <>
                          <span className="mx-1">•</span>
                          <span>by {issue.author.name}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 glass-button"
                        title={
                          pinnedIds.has(issue.id)
                            ? 'Unpin'
                            : pinnedCount >= 5
                              ? 'Pinned limit reached'
                              : 'Pin'
                        }
                        onClick={e => {
                          e.stopPropagation();
                          togglePin(issue.id, issue);
                        }}
                        disabled={!pinnedIds.has(issue.id) && pinnedCount >= 5}
                      >
                        {pinnedIds.has(issue.id) ? (
                          <AiFillStar className="w-4 h-4 text-amber-500" />
                        ) : (
                          <FiStar className="w-4 h-4 text-gray-400" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="h-1" />

                  {/* Row 4: Labels heading + selector */}
                  <div className="space-y-1" onClick={e => e.stopPropagation()}>
                    <div className="text-[11px] font-medium text-black/70">
                      Labels
                    </div>
                    {/*{(() => {
                      const projectId = issue.project?.id as string | undefined;
                      const palette = projectId
                        ? labelPalettes[projectId]
                        : undefined;
                      const labelsArray = palette
                        ? Array.from(palette.values())
                        : [];
                      const selectedLabel =
                        issue.labels && issue.labels.length
                          ? issue.labels[0]
                          : undefined;
                      const iid = issue.number as number | undefined;
                      const handleSelect = async (val: string) => {
                        if (!projectId || !iid) return;
                        await queryClient.cancelQueries({
                          queryKey: ['pinnedIssues'],
                        });
                        const prev = queryClient.getQueryData(
                            ['pinnedIssues']
                        ) as any;
                        queryClient.setQueryData(['pinnedIssues'], (old: any) => {
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
                        try {
                          const res = await api.updateGitLabIssue(
                            projectId,
                            iid,
                            {
                              labels: [val],
                            }
                          );
                          const serverLabels: string[] | undefined =
                            Array.isArray((res.data as any)?.labels)
                              ? ((res.data as any).labels as string[])
                              : undefined;
                          if (serverLabels && serverLabels.length) {
                            queryClient.setQueryData(
                              ['pinnedIssues'],
                              (old: any) => {
                                if (!old || !old.pages) return old;
                                return {
                                  ...old,
                                  pages: old.pages.map((p: any) => ({
                                    ...p,
                                    items: (p.items || []).map((it: any) =>
                                      String(it?.project?.id) ===
                                        String(projectId) &&
                                      Number(it?.number) === Number(iid)
                                        ? { ...it, labels: serverLabels }
                                        : it
                                    ),
                                  })),
                                };
                              }
                            );
                          }
                        } catch (e) {
                          queryClient.setQueryData(['pinnedIssues'], prev);
                        }
                      };
                      return (
                        <Select
                          value={selectedLabel}
                          onValueChange={handleSelect}
                        >
                          <SelectTrigger className="h-7 w-40 text-[12px] glass-input">
                            {selectedLabel && palette ? (
                              <div className="flex items-center gap-2 truncate">
                                {palette.get(selectedLabel)?.color ? (
                                  <span
                                    className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
                                    style={{
                                      backgroundColor: (
                                        palette.get(selectedLabel) as any
                                      ).color,
                                    }}
                                  />
                                ) : null}
                                <span className="truncate">
                                  {selectedLabel}
                                </span>
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
                    })()}*/}
                  </div>
                </div>
              </button>
            ))
          : null}
      </div>
    </div>
  );
};

const PinnedIssues: React.FC<PinnedIssuesProps> = props => (
  <PinnedIssuesInner {...props} />
);

export default PinnedIssues;
