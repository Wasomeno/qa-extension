import { useMemo } from 'react';
import { useInfiniteMergeRequests } from '@/hooks/useInfiniteMergeRequests';
import type { MRFilters } from '../types';

export const useMRData = (filters: MRFilters, ready: boolean) => {
  const params = useMemo(() => {
    // Default to first project if multiple selected, or no filter if none selected
    const projectId = filters.projectIds.length > 0 ? filters.projectIds[0] : undefined;

    return {
      search: filters.search,
      projectId,
      state: filters.state,
      assignee_id: 'me' as const,
      per_page: 20,
      sort: 'newest' as const,
    };
  }, [filters]);

  const {
    items: mergeRequests,
    isLoading,
    isError,
    error,
    isFetching,
    hasMore,
    loadMore,
    isLoadingMore,
    refetch,
  } = useInfiniteMergeRequests(params);

  return {
    mergeRequests,
    isLoading: !ready || isLoading,
    isError,
    error,
    isFetching,
    hasMore,
    loadMore,
    isLoadingMore,
    refetch,
  };
};
