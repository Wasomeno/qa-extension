import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import type { IssueFilterState, IssueData, GitLabLabel } from '../types';
import { CLIENT_RENEG_LIMIT } from 'node:tls';

export const useIssueData = (
  filters: IssueFilterState,
  filtersReady: boolean
) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [allProjectLabels, setAllProjectLabels] = useState<
    Record<string, GitLabLabel[]>
  >({});

  const projectFilterValue =
    filters.selectedProjectIds.length > 0
      ? filters.selectedProjectIds.slice().sort().join(',')
      : '';

  // Create stable query key
  const queryKey = [
    'issues-page',
    {
      search: filters.search,
      projectId: projectFilterValue,
      assigneeId:
        filters.selectedAssigneeIds.length === 1 &&
        filters.selectedAssigneeIds[0] !== 'unassigned'
          ? filters.selectedAssigneeIds[0]
          : '',
      labels: filters.selectedLabels.slice().sort().join(','),
      status: getStatusFilter(filters.selectedStatuses),
      sort: filters.sort,
      page: currentPage,
    },
  ];

  // Query for current page
  const {
    data: currentPageData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<IssueData> => {
      const statusFilter = getStatusFilter(filters.selectedStatuses);

      const res = await api.listGitLabIssuesGlobal({
        search: filters.search || undefined,
        projectId: projectFilterValue || undefined,
        assigneeId:
          filters.selectedAssigneeIds.length === 1 &&
          filters.selectedAssigneeIds[0] !== 'unassigned'
            ? filters.selectedAssigneeIds[0]
            : undefined,
        labels: filters.selectedLabels,
        status: statusFilter as any,
        limit: 5,
        sort: filters.sort,
        cursor: currentPage > 1 ? `page:${currentPage}` : null,
      });

      console.log('PARAMS', {
        search: filters.search || undefined,
        projectId: projectFilterValue || undefined,
        assigneeId:
          filters.selectedAssigneeIds.length === 1 &&
          filters.selectedAssigneeIds[0] !== 'unassigned'
            ? filters.selectedAssigneeIds[0]
            : undefined,
        labels: filters.selectedLabels,
        status: statusFilter as any,
        limit: 5,
        sort: filters.sort,
        cursor: currentPage > 1 ? `page:${currentPage}` : null,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to load issues');
      }

      return res.data || { items: [], nextCursor: null, projectLabels: {} };
    },
    staleTime: 300_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    enabled: filtersReady,
  });

  // Reset pagination when filters change
  useEffect(() => {
    if (!filtersReady) return;

    setCurrentPage(1);
    setAllItems([]);
    setAllProjectLabels({});
  }, [
    filters.search,
    filters.selectedProjectIds,
    filters.selectedAssigneeIds,
    filters.selectedLabels,
    filters.selectedStatuses,
    filters.sort,
    filtersReady,
  ]);

  // Accumulate items when new page data arrives
  useEffect(() => {
    if (!filtersReady) return;

    if (currentPageData?.items) {
      if (currentPage === 1) {
        setAllItems(currentPageData.items);
      } else {
        setAllItems(prev => [...prev, ...currentPageData.items]);
      }

      if (currentPageData.projectLabels) {
        setAllProjectLabels(prev => ({
          ...prev,
          ...currentPageData.projectLabels,
        }));
      }
    }
  }, [currentPageData, currentPage, filtersReady]);

  // Filter issues by selected projects and assignees (client-side filtering)
  const visibleIssues = allItems.filter(item => {
    // Assignee filter
    if (filters.selectedAssigneeIds.length > 0) {
      const assignees = Array.isArray((item as any).assignees)
        ? (item as any).assignees
        : item.assignee
          ? [item.assignee]
          : [];

      const hasUnassigned = filters.selectedAssigneeIds.includes('unassigned');
      const assignedIds = assignees.map((a: any) => String(a.id));
      const matchAssigned = assignedIds.some((id: string) =>
        filters.selectedAssigneeIds.includes(id)
      );
      const isUnassigned = assignedIds.length === 0;

      if (!((hasUnassigned && isUnassigned) || matchAssigned)) {
        return false;
      }
    }

    return true;
  });

  const loadMore = () => {
    if (!filtersReady) return;

    if (currentPageData?.nextCursor && !isFetching) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const combinedLoading = !filtersReady || isLoading;

  return {
    issues: visibleIssues,
    allProjectLabels,
    isLoading: combinedLoading,
    isError,
    error,
    isFetching,
    hasNextPage: filtersReady && !!currentPageData?.nextCursor,
    loadMore,
    refetch,
  };
};

function getStatusFilter(selectedStatuses: string[]): string | undefined {
  if (selectedStatuses.length === 0) return undefined;
  if (
    selectedStatuses.includes('open') &&
    selectedStatuses.includes('closed')
  ) {
    return undefined; // Show both
  }
  return selectedStatuses.includes('closed') ? 'closed' : undefined;
}
