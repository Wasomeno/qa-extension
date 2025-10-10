import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { Button } from '@/src/components/ui/ui/button';
import { Skeleton } from '@/src/components/ui/ui/skeleton';
import IssueRow from '@/components/issue-list/issue-row';
import type { IssueFilterState, GitLabLabel } from '../types';

interface IssueListContentProps {
  issues: any[];
  allProjectLabels: Record<string, GitLabLabel[]>;
  filters: IssueFilterState;
  isLoading: boolean;
  isError: boolean;
  error: any;
  isFetching: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onSelect?: (item: any) => void;
  onIssueOpen: (item: any) => void;
  pinnedIds: Set<string>;
  pinnedCount: number;
  onTogglePin: (id: string, item: any) => void;
  evidenceModeIds: Set<string>;
  onToggleEvidenceMode: (id: string) => void;
  onExitEvidenceMode: (id: string) => void;
  portalContainer?: Element | null;
}

export const IssueListContent: React.FC<IssueListContentProps> = ({
  issues,
  allProjectLabels,
  filters,
  isLoading,
  isError,
  error,
  isFetching,
  hasNextPage,
  onLoadMore,
  onSelect,
  onIssueOpen,
  pinnedIds,
  pinnedCount,
  onTogglePin,
  evidenceModeIds,
  onToggleEvidenceMode,
  onExitEvidenceMode,
  portalContainer,
}) => {
  const queryClient = useQueryClient();

  // Create issue query key for optimistic updates
  const issuesQueryKey = [
    'issues',
    {
      search: filters.search,
      projectId: filters.selectedProjectIds.length === 1 ? filters.selectedProjectIds[0] : '',
      labels: filters.selectedLabels.slice().sort().join(','),
      assigneeId: filters.selectedAssigneeIds.length === 1 ? filters.selectedAssigneeIds[0] : '',
      createdBy: 'any',
      status: getStatusFilter(filters.selectedStatuses),
      limit: 5,
      sort: filters.sort,
    },
  ];

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
      // Refetch is handled by parent component
    } catch (_) {
      // Error handling can be improved
    }
  };

  const handleIssueLabelsChange = async (
    projectId: string | undefined,
    iid: number | undefined,
    vals: string[]
  ) => {
    if (!projectId || !iid) return;

    // Optimistic update
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
      }
    } catch (e) {
      // Revert optimistic update
      queryClient.setQueryData(issuesQueryKey, prev);
    }
  };

  // Create label palettes from API response
  const labelPalettes = React.useMemo(() => {
    const map: Record<string, Map<string, GitLabLabel>> = {};
    issues.forEach(item => {
      const projectId = item.project?.id;
      const projectLabels = item.project?.labels || [];
      if (projectId && projectLabels.length > 0) {
        const inner = new Map<string, GitLabLabel>();
        projectLabels.forEach((l: GitLabLabel) => inner.set(l.name, l));
        map[projectId] = inner;
      }
    });
    return map;
  }, [issues]);

  const labelLoadingMap = React.useMemo(() => {
    const map: Record<string, boolean> = {};
    issues.forEach(item => {
      const projectId = item.project?.id;
      if (projectId) {
        map[projectId] = false; // Labels are embedded, never loading
      }
    });
    return map;
  }, [issues]);

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

  const renderIssueRow = (item: any) => {
    const projectId = item.project?.id as string | undefined;
    const iid = item.number as number | undefined;
    const palette = projectId ? labelPalettes[projectId] : undefined;
    const selectedLabels = Array.isArray(item.labels) ? item.labels : [];
    const isInEvidenceMode = evidenceModeIds.has(item.id);

    return (
      <IssueRow
        key={item.id}
        item={item}
        pinned={pinnedIds.has(item.id)}
        pinDisabled={!pinnedIds.has(item.id) && pinnedCount >= 5}
        onTogglePin={() => onTogglePin(item.id, item)}
        onOpen={onIssueOpen}
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
        isInEvidenceMode={isInEvidenceMode}
        onToggleEvidenceMode={() => onToggleEvidenceMode(item.id)}
        onExitEvidenceMode={() => onExitEvidenceMode(item.id)}
      />
    );
  };

  return (
    <div className="flex-1 overflow-y-scroll px-4 py-2 space-y-2">
      {/* Loading State */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map(renderLoadingCard)}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="text-xs text-red-600">
          {(error as any)?.message || 'Failed to load issues'}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && issues.length === 0 && (
        <div className="text-xs text-white/70">No issues found.</div>
      )}

      {/* Issue List */}
      {issues.map(renderIssueRow)}

      {/* Load More Button */}
      {hasNextPage && !isLoading && (
        <div className="flex justify-center p-4">
          <Button
            onClick={onLoadMore}
            disabled={isFetching}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            {isFetching ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      {/* Loading More Indicators */}
      {isFetching && !isLoading && (
        <div className="space-y-2">
          {[...Array(2)].map(renderLoadingCard)}
        </div>
      )}
    </div>
  );
};

function getStatusFilter(selectedStatuses: string[]): string | undefined {
  if (selectedStatuses.length === 0) return undefined;
  if (selectedStatuses.includes('open') && selectedStatuses.includes('closed')) {
    return undefined; // Show both
  }
  return selectedStatuses.includes('closed') ? 'closed' : undefined;
}