import React from 'react';
import { Button } from '@/src/components/ui/ui/button';
import { storageService, PinnedIssueSnapshot } from '@/services/storage';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import AvatarGroup from '@/components/issue-list/AvatarGroup';

interface PinnedIssuesProps {
  className?: string;
}

dayjs.extend(relativeTime);

const PinnedIssuesInner: React.FC<PinnedIssuesProps> = ({ className }) => {
  // Subscribe to storage updates without keeping local React state
  const snapshots = React.useSyncExternalStore(
    (onStoreChange: () => void) =>
      storageService.onChanged('pinnedSnapshots', () => onStoreChange()),
    () =>
      (((storageService as any).cache?.get('pinnedSnapshots') || {}) as Record<
        string,
        PinnedIssueSnapshot
      >)
  );

  // Prime the cache once so getSnapshot has data
  React.useEffect(() => {
    storageService.getPinnedSnapshots().catch(() => {});
  }, []);

  const orderedIds = React.useMemo(() => Object.keys(snapshots || {}), [snapshots]);

  const unpin = async (id: string) => {
    try { await storageService.deletePinnedSnapshot(id); } catch {}
    try { await storageService.unpinIssue(id); } catch {}
  };

  const openIssue = (issue: any) => {
    if (!issue) return;
    const url = issue.webUrl || issue.web_url || `${location.origin}/issues/${issue?.id ?? ''}`;
    window.open(url, '_blank');
  };

  // Drag-and-drop reordering removed

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      <div className="p-4 border-b border-[color:var(--qa-border)]">
        <div className="text-sm font-semibold">Pinned</div>
        <div className="text-xs opacity-80">Up to 5 issues</div>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {orderedIds.length > 0 && Object.keys(snapshots).length === 0 && (
          <div className="space-y-2">
            {[...Array(Math.max(orderedIds.length || 0, 3))].map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-2 glass-card border border-[color:var(--qa-border)] rounded-lg p-2"
              >
                <Skeleton className="h-4 w-4 rounded" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="mt-2 flex gap-1">
                    <Skeleton className="h-4 w-14 rounded-full" />
                    <Skeleton className="h-4 w-10 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-6 w-12 rounded" />
                <Skeleton className="h-6 w-12 rounded" />
              </div>
            ))}
          </div>
        )}
        {orderedIds.length === 0 && (
          <div className="text-xs opacity-80 p-2">
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

const PinnedIssueRow: React.FC<RowProps> = ({
  id,
  issue,
  onUnpin,
  onOpen,
}) => {
  // Local-only view: no external fetches

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

  return (
    <div
      className={cn(
        'group w-full text-left rounded-md glass-card border border-[color:var(--qa-border)] px-4 py-3 hover:bg-[color:var(--qa-glass-hover)]',
        inaccessible && 'opacity-60'
      )}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="truncate max-w-[180px] text-[13px] font-semibold">
                {issue?.title || 'No longer accessible'}
              </div>
              <div className="shrink-0 text-[12px] opacity-80">
                #{iid || '—'}
              </div>
            </div>
            <div className="mt-1 text-[12px] opacity-80">
              <span className="truncate">
                Project {(issue as any)?.project?.name ?? (issue as any)?.project_id ?? ''}
              </span>
              {openedAgo && <span className="mx-1">·</span>}
              {openedAgo && <span>opened {openedAgo}</span>}
              {issue?.author?.name && (
                <>
                  <span className="mx-1">·</span>
                  <span>by {issue.author.name}</span>
                </>
              )}
            </div>
            {labels.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {labels.map(l => (
                  <span key={l} className="px-2 py-0.5 text-[11px] rounded-full bg-white/5 border border-white/10">
                    {l}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-2">
          {/* state badge removed for minimal UI */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
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
          {assignees.length ? (
            <AvatarGroup users={assignees as any} size={20} />
          ) : null}
        </div>
      </div>
    </div>
  );
};

const PinnedIssues: React.FC<PinnedIssuesProps> = props => (
  <PinnedIssuesInner {...props} />
);

export default PinnedIssues;
