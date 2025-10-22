import { useMemo } from 'react';
import { useInfiniteMergeRequests } from '@/hooks/useInfiniteMergeRequests';
import type { MRFilters } from '../types';

export const useMRData = (filters: MRFilters, ready: boolean) => {
  const params = useMemo(() => {
    const projectIds = filters.projectIds.length > 0 ? filters.projectIds : [];

    return {
      search: filters.search,
      projectIds,
      state: filters.state,
      author_id: 'me' as const,
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
