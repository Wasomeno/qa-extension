import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiService from '@/services/api';
import type {
  ListMRsParams,
  MergeRequestSummary,
} from '@/types/merge-requests';

export interface UseInfiniteMRsParams
  extends Omit<ListMRsParams, 'page' | 'projectId'> {
  projectIds?: string[];
}

export const useInfiniteMergeRequests = (params: UseInfiniteMRsParams) => {
  const [allItems, setAllItems] = useState<MergeRequestSummary[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Create stable query key
  const queryKey = useMemo(() => {
    const labelsStr = Array.isArray(params.labels)
      ? params.labels.slice().sort().join(',')
      : '';
    const projectIdsStr = Array.isArray(params.projectIds)
      ? params.projectIds.slice().sort().join(',')
      : '';

    return [
      'merge-requests',
      {
        search: params.search || '',
        projectIds: projectIdsStr,
        state: params.state || 'opened',
        scope: params.scope || '',
        labels: labelsStr,
        per_page: params.per_page || 20,
        sort: params.sort || 'newest',
      },
    ];
  }, [
    params.search,
    params.projectIds,
    params.state,
    params.scope,
    JSON.stringify(params.labels),
    params.per_page,
    params.sort,
  ]);

  // Reset state when query parameters change
  useEffect(() => {
    setAllItems([]);
    setCurrentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
  }, [queryKey]);

  const fetchPage = useCallback(
    async (pageToFetch: number) => {
      const order_by: 'created_at' | 'updated_at' =
        params.sort === 'oldest' ? 'created_at' : 'updated_at';
      const sort: 'asc' | 'desc' = params.sort === 'oldest' ? 'asc' : 'desc';
      const stateFilter: 'opened' | 'closed' | 'locked' | 'merged' | 'all' =
        params.state ?? 'opened';
      const perPage = params.per_page || 20;

      const baseOptions = {
        state: stateFilter,
        scope: params.scope,
        search: params.search,
        order_by,
        sort,
        per_page: perPage,
        page: pageToFetch,
      };

      try {
        // If no project IDs provided, use the global endpoint which will default to user's accessible projects
        if (!params.projectIds || params.projectIds.length === 0) {
          const globalResult = await apiService.getMergeRequestsForProjects(
            [],
            { ...baseOptions }
          );

          if (globalResult.success && globalResult.data) {
            const items = Array.isArray(globalResult.data.items)
              ? globalResult.data.items
              : [];
            const total = globalResult.data.total || items.length;
            const hasMoreItems = items.length >= perPage;
            return {
              items,
              total,
              nextPage: hasMoreItems ? pageToFetch + 1 : null,
            };
          }

          return { items: [], total: 0, nextPage: null };
        }

        const results = await Promise.all(
          params.projectIds.map(projectId =>
            apiService.getMergeRequests(projectId, { ...baseOptions })
          )
        );

        let combined: MergeRequestSummary[] = [];
        let total = 0;
        let anySuccess = false;
        let anyHasMore = false;

        results.forEach(res => {
          if (res.success && res.data) {
            anySuccess = true;
            const items = Array.isArray(res.data.items)
              ? (res.data.items as MergeRequestSummary[])
              : [];
            combined.push(...items);
            total += res.data.total || items.length;
            if (items.length >= perPage) {
              anyHasMore = true;
            }
          } else if (res.error) {
            console.error(
              'Fallback MR fetch failed for one project:',
              res.error
            );
          }
        });

        if (!anySuccess) {
          return { items: [], total: 0, nextPage: null };
        }

        combined.sort((a, b) => {
          const dateA = new Date(
            order_by === 'created_at' ? a.created_at : a.updated_at
          );
          const dateB = new Date(
            order_by === 'created_at' ? b.created_at : b.updated_at
          );
          return sort === 'asc'
            ? dateA.getTime() - dateB.getTime()
            : dateB.getTime() - dateA.getTime();
        });

        const nextPage = anyHasMore ? pageToFetch + 1 : null;

        return {
          items: combined,
          total: total || combined.length,
          nextPage,
        };
      } catch (fallbackError) {
        console.error('Fallback MR fetch encountered an error:', fallbackError);
        return { items: [], total: 0, nextPage: null };
      }
    },
    [
      params.projectIds,
      params.state,
      params.scope,
      params.search,
      params.sort,
      params.per_page,
    ]
  );

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const pageResult = await fetchPage(1);

        setAllItems(pageResult.items);
        setCurrentPage(1);
        setHasMore(!!pageResult.nextPage);

        return pageResult;
      } catch (e) {
        console.error('MRs fetch error', e);
        return { items: [], total: 0, nextPage: null };
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 300_000, // 5 minutes
    gcTime: 300_000,
    enabled: true, // Always enabled - service will use default projects if none provided
  });

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || query.isFetching) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const pageResult = await fetchPage(nextPage);

      if (pageResult.items.length === 0) {
        setHasMore(false);
      } else {
        const order_by: 'created_at' | 'updated_at' =
          params.sort === 'oldest' ? 'created_at' : 'updated_at';
        const sort: 'asc' | 'desc' = params.sort === 'oldest' ? 'asc' : 'desc';

        setAllItems(prev => {
          const all = [...prev, ...pageResult.items];
          all.sort((a, b) => {
            const dateA = new Date(
              order_by === 'created_at' ? a.created_at : a.updated_at
            );
            const dateB = new Date(
              order_by === 'created_at' ? b.created_at : b.updated_at
            );
            return sort === 'asc'
              ? dateA.getTime() - dateB.getTime()
              : dateB.getTime() - dateA.getTime();
          });

          return all;
        });

        setCurrentPage(nextPage);
        setHasMore(pageResult.nextPage !== null);
      }
    } catch (e) {
      console.error('Load more MRs error', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    hasMore,
    isLoadingMore,
    query.isFetching,
    currentPage,
    params.projectIds,
    params.state,
    params.scope,
    params.search,
    params.sort,
    params.per_page,
    fetchPage,
  ]);

  // Use query data items if available and allItems is empty (handles cache on remount)
  const items = allItems.length > 0 ? allItems : query.data?.items || [];

  return {
    ...query,
    items,
    loadMore,
    hasMore,
    isLoadingMore,
  };
};

export default useInfiniteMergeRequests;
