import React from 'react';
import { storageService, PinnedIssueSnapshot } from '@/services/storage';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '@/services/api';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import PinnedIssueRow from './pinned-issue-row';
import IssueCardSkeleton from '@/components/common/IssueCardSkeleton';

interface PinnedIssuesProps {
  className?: string;
  onSelect: (issue: PinnedIssueSnapshot) => void;
  portalContainer?: Element | null;
}

dayjs.extend(relativeTime);

type GitLabLabel = {
  id: number;
  name: string;
  color: string;
  text_color?: string;
  description?: string;
};

const PinnedIssuesInner: React.FC<PinnedIssuesProps> = ({
  className,
  onSelect,
  portalContainer,
}) => {
  const [pinnedIds, setPinnedIds] = React.useState<Set<string>>(new Set());
  const [pinnedCount, setPinnedCount] = React.useState(0);
  const [evidenceModeIds, setEvidenceModeIds] = React.useState<Set<string>>(
    new Set()
  );

  const queryClient = useQueryClient();
  const pinnedIssues = useQuery({
    queryKey: ['pinnedIssues'],
    queryFn: async () => storageService.getParsedPinnedSnapshots(),
  });

  // Fetch project label palettes for the pinned issues
  const projectIds = React.useMemo(
    () =>
      Array.from(
        new Set(
          (pinnedIssues.data || []).map(it => it.project?.id).filter(Boolean)
        )
      ) as string[],
    [pinnedIssues.data]
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
    const map: Record<string, Map<string, GitLabLabel>> = {};
    labelQueries.forEach((q, idx) => {
      const pid = projectIds[idx];
      const labels = (q.data as GitLabLabel[]) || [];
      const inner = new Map<string, GitLabLabel>();
      labels.forEach((l: GitLabLabel) => inner.set(l.name, l));
      map[pid] = inner;
    });
    return map;
  }, [labelQueries, projectIds]);

  const labelLoadingMap = React.useMemo(() => {
    const map: Record<string, boolean> = {};
    labelQueries.forEach((q, idx) => {
      const pid = projectIds[idx];
      if (!pid) return;
      map[pid] = Boolean((q as any)?.isLoading || (q as any)?.isFetching);
    });
    return map;
  }, [labelQueries, projectIds]);

  const unpin = async (id: string) => {
    try {
      await storageService.deletePinnedSnapshot(id);
    } catch {}
    try {
      await storageService.unpinIssue(id);
    } catch {}
  };

  const togglePin = async (issue: PinnedIssueSnapshot) => {
    const id = issue.id;
    if (pinnedIds.has(id)) {
      // Use the existing unpin function that handles both storage operations
      await unpin(id);
      // Invalidate the React Query cache to update the UI immediately
      await queryClient.invalidateQueries({ queryKey: ['pinnedIssues'] });
      return;
    }
    if (pinnedCount >= 5) {
      // Optional: could show a toast here
      return;
    }
    await storageService.pinIssue(id);
    // Persist GitLab reference (projectId + iid) for detail fetching
    const projectId = issue?.project?.id;
    const iid = (issue?.number ??
      (issue as any)?.iid ??
      (issue as any)?.gitlabIssueIid) as number | undefined;
    const webUrl = (issue as any)?.webUrl || (issue as any)?.web_url;
    if (projectId && typeof iid === 'number') {
      await storageService.updatePinnedRef(id, { projectId, iid, webUrl });
    }

    try {
      await storageService.upsertPinnedSnapshot(
        id,
        Object.assign({}, issue as any, { lastSyncedAt: Date.now() }) as any
      );
    } catch {}
  };

  // Evidence mode handlers
  const toggleEvidenceMode = (id: string) => {
    setEvidenceModeIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const exitEvidenceMode = (id: string) => {
    setEvidenceModeIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
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
      // Refetch pinned issues to update the cache
      await queryClient.invalidateQueries({ queryKey: ['pinnedIssues'] });
    } catch (_) {
      await queryClient.invalidateQueries({ queryKey: ['pinnedIssues'] });
    }
  };

  const handleIssueLabelsChange = async (
    projectId: string | undefined,
    iid: number | undefined,
    vals: string[]
  ) => {
    if (!projectId || !iid) return;
    try {
      await api.updateGitLabIssue(projectId, iid, {
        labels: vals,
      });
      // Update the pinned snapshot with new labels
      await queryClient.invalidateQueries({ queryKey: ['pinnedIssues'] });
    } catch (e) {
      console.error('Failed to update labels for pinned issue:', e);
      await queryClient.invalidateQueries({ queryKey: ['pinnedIssues'] });
    }
  };

  // Initialize pinned state
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

  return (
    <div
      className={cn(
        'flex flex-col flex-1 w-[500px] overflow-y-scroll  h-full p-4',
        className
      )}
    >
      <div className="flex flex-1 flex-col p-1 space-y-1">
        {pinnedIssues.isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <IssueCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!pinnedIssues.isLoading && pinnedIssues.data?.length === 0 ? (
          <div className="flex flex-1 justify-center items-center gap-3 rounded-xl border border-dashed border-gray-200 dark:border-white/15 p-4 text-sm text-gray-600 dark:text-gray-300">
            <span className="text-center">
              Nothing pinned. Use the issue list menu to{' '}
              <span className="font-medium">Pin</span> issues you’re tracking.
            </span>
          </div>
        ) : null}

        {!pinnedIssues.isLoading && pinnedIssues.data?.length
          ? pinnedIssues.data?.map(issue => {
              const projectId = issue.project?.id as string | undefined;
              const iid = issue.number as number | undefined;
              const palette = projectId ? labelPalettes[projectId] : undefined;
              const selectedLabels = Array.isArray(issue.labels)
                ? issue.labels
                : [];
              const isInEvidenceMode = evidenceModeIds.has(issue.id);

              return (
                <PinnedIssueRow
                  key={issue.id}
                  issue={issue}
                  pinned={pinnedIds.has(issue.id)}
                  pinDisabled={!pinnedIds.has(issue.id) && pinnedCount >= 5}
                  onTogglePin={togglePin}
                  onOpen={onSelect}
                  projectLabelPalette={palette}
                  selectedLabels={selectedLabels}
                  onChangeLabels={(vals: string[]) =>
                    handleIssueLabelsChange(projectId, iid, vals)
                  }
                  onChangeState={(val: 'open' | 'closed') =>
                    handleIssueStatusChange(projectId, iid, val)
                  }
                  portalContainer={portalContainer}
                  labelsLoading={projectId ? labelLoadingMap[projectId] : false}
                  // Evidence mode props
                  isInEvidenceMode={isInEvidenceMode}
                  onToggleEvidenceMode={() => toggleEvidenceMode(issue.id)}
                  onExitEvidenceMode={() => exitEvidenceMode(issue.id)}
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
