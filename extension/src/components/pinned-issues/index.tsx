import React from 'react';
import { Button } from '@/src/components/ui/ui/button';
import { storageService, PinnedIssueSnapshot } from '@/services/storage';
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
import IssueCard from '@/components/common/IssueCard';
import IssueCardSkeleton from '@/components/common/IssueCardSkeleton';

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
              <IssueCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!pinnedIssues.isLoading && pinnedIssues.data?.length === 0 ? (
          <div className="text-[10px] opacity-70 p-2">
            Pin issues from the Issue List to keep them handy here.
          </div>
        ) : null}

        {!pinnedIssues.isLoading && pinnedIssues.data?.length
          ? pinnedIssues.data?.map(issue => {
              const projectId = issue.project?.id as string | undefined;
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
                <IssueCard
                  key={issue.id}
                  onClick={() => onSelect(issue)}
                  aria-label={`Open issue ${issue.title}`}
                  title={issue.title}
                  projectName={issue.project?.name ?? 'Project'}
                  number={issue.number ?? '—'}
                  evidenceEnabled
                  evidenceProjectId={projectId}
                  evidenceIid={iid as number}
                  statusControl={
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
                        >
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  }
                  metaLeft={
                    issue.author?.name ? (
                      <>
                        <span className="mx-1">•</span>
                        <span>by {issue.author.name}</span>
                      </>
                    ) : null
                  }
                  actionRight={
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
                  }
                />
              );
            })
          : null}
      </div>
    </div>
  );
};

const PinnedIssues: React.FC<PinnedIssuesProps> = props => (
  <PinnedIssuesInner {...props} />
);

export default PinnedIssues;
