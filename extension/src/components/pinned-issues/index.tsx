import React from 'react';
import { Button } from '@/src/components/ui/ui/button';
import { storageService, PinnedIssueSnapshot } from '@/services/storage';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import AvatarGroup from '@/components/issue-list/AvatarGroup';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/src/components/ui/ui/collapsible';
import { Checkbox } from '@/src/components/ui/ui/checkbox';
import api from '@/services/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/src/components/ui/ui/select';

interface PinnedIssuesProps {
  className?: string;
}

dayjs.extend(relativeTime);

const PinnedIssuesInner: React.FC<PinnedIssuesProps> = ({ className }) => {
  // Local state driven by storage events (avoid render-time updates)
  const [snapshots, setSnapshots] = React.useState<
    Record<string, PinnedIssueSnapshot>
  >({});

  React.useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const initial = await storageService.getPinnedSnapshots();
        setSnapshots(initial || {});
      } catch {}
      unsub = storageService.onChanged('pinnedSnapshots', v => {
        setSnapshots(prev => {
          const next = (v as Record<string, PinnedIssueSnapshot>) || {};
          // Avoid unnecessary updates to prevent render loops
          if (Object.is(prev, next)) return prev;
          // Shallow compare keys length as a cheap guard
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(next);
          if (
            prevKeys.length === nextKeys.length &&
            prevKeys.every(k => prev[k] === next[k])
          ) {
            return prev;
          }
          return next;
        });
      });
    })();
    return () => {
      try {
        unsub && unsub();
      } catch {}
    };
  }, []);

  const orderedIds = React.useMemo(
    () => Object.keys(snapshots || {}),
    [snapshots]
  );

  const unpin = async (id: string) => {
    try {
      await storageService.deletePinnedSnapshot(id);
    } catch {}
    try {
      await storageService.unpinIssue(id);
    } catch {}
  };

  const openIssue = (issue: any) => {
    if (!issue) return;
    const url =
      issue.webUrl ||
      issue.web_url ||
      `${location.origin}/issues/${issue?.id ?? ''}`;
    window.open(url, '_blank');
  };

  // Drag-and-drop reordering removed

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex-1 overflow-auto p-1 space-y-1">
        {orderedIds.length > 0 && Object.keys(snapshots).length === 0 && (
          <div className="space-y-2">
            {[...Array(Math.max(orderedIds.length || 0, 3))].map((_, i) => (
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
        {orderedIds.length === 0 && (
          <div className="text-[10px] opacity-70 p-2">
            Pin issues from the Issue List to keep them handy here.
          </div>
        )}

        {orderedIds.map(id => (
          <PinnedIssueRow
            key={id}
            id={id}
            issue={snapshots[id] as any}
            onUnpin={() => unpin(id)}
            onOpen={() => openIssue(snapshots[id])}
          />
        ))}
      </div>
    </div>
  );
};

interface RowProps {
  id: string;
  issue: any | null | undefined;
  onUnpin: () => void;
  onOpen: () => void;
}

const PinnedIssueRow: React.FC<RowProps> = ({ id, issue, onUnpin, onOpen }) => {
  // Local-only view: no external fetches

  const [open, setOpen] = React.useState(false);
  const [loadingChecklist, setLoadingChecklist] = React.useState(false);
  const [updating, setUpdating] = React.useState(false);
  const [checklist, setChecklist] = React.useState<
    { text: string; checked: boolean; raw: string; line: number }[]
  >([]);
  const [description, setDescription] = React.useState<string | undefined>(
    issue?.description
  );
  const [labelsOptions, setLabelsOptions] = React.useState<
    { id: number; name: string; color: string }[]
  >([]);
  const [labelsValue, setLabelsValue] = React.useState<string | undefined>(
    Array.isArray((issue as any)?.labels) && (issue as any).labels.length
      ? (issue as any).labels[0]
      : undefined
  );

  const openedAgo = issue?.created_at
    ? dayjs(issue.created_at).fromNow()
    : (issue as any)?.createdAt
      ? dayjs((issue as any).createdAt).fromNow()
      : '';
  const assignees = Array.isArray((issue as any)?.assignees)
    ? ((issue as any).assignees as any[])
    : (issue as any)?.assignee
      ? [(issue as any).assignee as any]
      : [];
  const iid = (issue as any)?.iid ?? (issue as any)?.number ?? '';
  const labels: string[] = Array.isArray((issue as any)?.labels)
    ? ((issue as any).labels as string[])
    : [];

  const inaccessible = issue === null;

  const projectId = (issue as any)?.project?.id ?? (issue as any)?.project_id;

  React.useEffect(() => {
    // preload labels palette for compact selector
    let mounted = true;
    (async () => {
      if (!projectId) return;
      try {
        const res = await api.getGitLabProjectLabels(projectId);
        if (mounted && res.success && res.data) {
          setLabelsOptions((res.data.items || []) as any);
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  const fetchChecklist = React.useCallback(async () => {
    if (!projectId || !iid) return;
    setLoadingChecklist(true);
    try {
      const [dRes, cRes] = await Promise.all([
        api.getGitLabIssue(projectId, Number(iid)),
        api.getGitLabIssueChecklist(projectId, Number(iid)),
      ]);
      if (dRes.success && dRes.data)
        setDescription((dRes.data as any).description);
      if (cRes.success && cRes.data) setChecklist(cRes.data.items || []);
    } finally {
      setLoadingChecklist(false);
    }
  }, [projectId, iid]);

  const onToggleOpen = (val: boolean) => {
    setOpen(val);
    if (val && checklist.length === 0) fetchChecklist();
  };

  const handleToggleChecklist = async (idx: number, nextChecked: boolean) => {
    // optimistic toggle in UI
    setChecklist(prev =>
      prev.map((it, i) => (i === idx ? { ...it, checked: nextChecked } : it))
    );
    if (!projectId || !iid) return;
    // compute new description
    const lines = String(description || '').split(/\r?\n/);
    const target = checklist[idx];
    if (!target) return;
    const lineIndex = (target.line ?? 0) - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    const line = lines[lineIndex];
    const updatedLine = line.replace(
      /\[(?: |x|X)\]/,
      nextChecked ? '[x]' : '[ ]'
    );
    const newDesc = [
      ...lines.slice(0, lineIndex),
      updatedLine,
      ...lines.slice(lineIndex + 1),
    ].join('\n');
    setDescription(newDesc);
    setUpdating(true);
    try {
      await api.updateGitLabIssue(projectId, Number(iid), {
        description: newDesc,
      });
      // sync snapshot for local-first feel
      await storageService.upsertPinnedSnapshot(id, {
        description: newDesc,
        updated_at: new Date().toISOString(),
      } as any);
    } catch (e) {
      // Keep optimistic state; optionally queue a retry for background processing
      try {
        await storageService.enqueuePendingAction({
          id,
          action: 'update',
          payload: { projectId, iid: Number(iid), description: newDesc },
          tries: 0,
          lastTriedAt: Date.now(),
        } as any);
      } catch {}
    } finally {
      setUpdating(false);
    }
  };

  const handleSelectLabel = async (val: string) => {
    if (!projectId || !iid) return;
    // cancel any refetches relevant to this simple view; we only maintain local state
    const prev = labelsValue;
    setLabelsValue(val);
    // also update snapshot optimistically
    const serverPrev = labels.slice();
    await storageService.upsertPinnedSnapshot(id, { labels: [val] } as any);
    try {
      const res = await api.updateGitLabIssue(projectId, Number(iid), {
        labels: [val],
      });
      const serverLabels: string[] | undefined = Array.isArray(
        (res.data as any)?.labels
      )
        ? ((res.data as any).labels as string[])
        : undefined;
      if (serverLabels && serverLabels.length) {
        setLabelsValue(serverLabels[0]);
        await storageService.upsertPinnedSnapshot(id, {
          labels: serverLabels,
        } as any);
      }
    } catch (e) {
      setLabelsValue(prev);
      await storageService.upsertPinnedSnapshot(id, {
        labels: serverPrev,
      } as any);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={onToggleOpen}>
      <div
        className={cn(
          'group w-full text-left rounded-md glass-card border border-[color:var(--qa-border)] px-4 py-3 hover:bg-[color:var(--qa-glass-hover)]',
          inaccessible && 'opacity-60'
        )}
      >
        <div className="flex flex-col gap-2">
          {/* Row 1: caret + title, right: number + status */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <CollapsibleTrigger asChild>
                    <button
                      className="shrink-0 w-5 h-5 grid place-items-center rounded hover:bg-white/10"
                      aria-label="Toggle"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className={cn(
                          'w-4 h-4 transition-transform text-blue-500',
                          open ? 'rotate-90' : ''
                        )}
                        aria-hidden
                      >
                        <path d="M7 5l6 5-6 5V5z" fill="currentColor" />
                      </svg>
                    </button>
                  </CollapsibleTrigger>
                  <div className="truncate max-w-[200px] text-[13px] font-semibold">
                    {issue?.title || 'No longer accessible'}
                  </div>
                </div>
                <div className="mt-0.5 text-[12px] opacity-80 truncate">
                  {(issue as any)?.project?.name ?? (issue as any)?.project_id ?? ''}
                </div>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-3">
              <div className="text-[12px] opacity-80">#{iid || '—'}</div>
              {(() => {
                const isClosed = (issue as any)?.state === 'closed';
                const value = isClosed ? 'closed' : 'open';
                const handleChange = async (val: string) => {
                  if (!projectId || !iid) return;
                  try {
                    await api.updateGitLabIssue(projectId, Number(iid), {
                      state: val === 'closed' ? 'close' : 'reopen',
                    });
                    await storageService.upsertPinnedSnapshot(id, {
                      state: val === 'closed' ? 'closed' : 'opened',
                      updated_at: new Date().toISOString(),
                    } as any);
                  } catch {}
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
                      <SelectContent sideOffset={6} className="glass-modal rounded-md">
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Row 2: opened by ... | star + more */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] opacity-80 truncate">
              {openedAgo && <span>Opened {openedAgo}</span>}
              {issue?.author?.name && (
                <>
                  <span className="mx-1">•</span>
                  <span>by {issue.author.name}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 ml-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Unpin"
                onClick={e => {
                  e.stopPropagation();
                  onUnpin();
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-amber-500 fill-current"
                  aria-hidden
                >
                  <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.786 1.401 8.168L12 18.897l-7.335 3.867 1.401-8.168L.132 9.21l8.2-1.192z" />
                </svg>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/80"
                title="More"
                onClick={e => {
                  e.stopPropagation();
                  onOpen();
                }}
              >
                ⋯
              </Button>
            </div>
          </div>

          {/* Row 3: spacer */}
          <div className="h-1" />

          {/* Row 4: Labels heading + selector */}
          <div className="space-y-1" onClick={e => e.stopPropagation()}>
            <div className="text-[11px] font-medium opacity-80">Labels</div>
            {projectId ? (
              <Select value={labelsValue} onValueChange={handleSelectLabel}>
                <SelectTrigger className="h-7 w-40 text-[12px] glass-input">
                  {labelsValue ? (
                    <div className="flex items-center gap-2 truncate">
                      {(() => {
                        const opt = labelsOptions.find(o => o.name === labelsValue);
                        return opt ? (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full border border-white/20"
                            style={{ backgroundColor: opt.color }}
                          />
                        ) : null;
                      })()}
                      <span className="truncate">{labelsValue}</span>
                    </div>
                  ) : (
                    <SelectValue placeholder="Select label" />
                  )}
                </SelectTrigger>
                <SelectContent sideOffset={6} className="glass-modal rounded-md">
                  {labelsOptions.map(l => (
                    <SelectItem key={l.id} value={l.name}>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full border border-gray-300"
                          style={{ backgroundColor: l.color }}
                        />
                        <span className="text-[12px]">{l.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>
        <CollapsibleContent>
          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="mb-1 text-[11px] font-medium opacity-80">
              Checklist
            </div>
            {loadingChecklist ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-3.5 rounded" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                ))}
              </div>
            ) : checklist.length ? (
              <div className="space-y-1">
                {checklist.map((c, idx) => (
                  <label
                    key={`${c.line}-${idx}`}
                    className="flex items-start gap-2 text-[12px] cursor-pointer"
                    onClick={e => {
                      // Toggle when clicking text area
                      e.stopPropagation();
                      handleToggleChecklist(idx, !c.checked);
                    }}
                  >
                    <Checkbox
                      checked={c.checked}
                      onCheckedChange={val => handleToggleChecklist(idx, !!val)}
                      onClick={e => {
                        // Isolate checkbox clicks from parent label
                        e.stopPropagation();
                      }}
                      className="mt-0.5 h-4 w-4 rounded-sm border border-neutral-400 bg-transparent data-[state=checked]:bg-neutral-200 data-[state=checked]:border-neutral-300 data-[state=checked]:text-neutral-900"
                    />
                    <span className="leading-4 opacity-90 select-none">
                      {c.text}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-[11px] opacity-60">
                No checkboxes in description
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

const PinnedIssues: React.FC<PinnedIssuesProps> = props => (
  <PinnedIssuesInner {...props} />
);

export default PinnedIssues;
