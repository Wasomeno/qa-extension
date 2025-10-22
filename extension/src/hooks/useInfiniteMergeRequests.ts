import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiService from '@/services/api';
import type {
  ListMRsParams,
  MergeRequestSummary,
} from '@/types/merge-requests';

export interface UseInfiniteMRsParams extends Omit<ListMRsParams, 'page'> {
  assignee_id?: number | 'me';
  author_id?: number | 'me';
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
        assignee_id: params.assignee_id || '',
        reviewer_id: params.reviewer_id || '',
        author_id: params.author_id || '',
        labels: labelsStr,
        per_page: params.per_page || 20,
        sort: params.sort || 'newest',
      },
    ];
  }, [
    params.search,
    params.projectIds,
    params.state,
    params.assignee_id,
    params.reviewer_id,
    params.author_id,
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
      if (!params.projectIds || params.projectIds.length === 0) {
        return { items: [], total: 0, nextPage: null };
      }

      const order_by: 'created_at' | 'updated_at' =
        params.sort === 'oldest' ? 'created_at' : 'updated_at';
      const sort: 'asc' | 'desc' = params.sort === 'oldest' ? 'asc' : 'desc';
      const stateFilter: 'opened' | 'closed' | 'locked' | 'merged' | 'all' =
        params.state ?? 'opened';
      const perPage = params.per_page || 20;

      const resolveUserParam = (
        value: UseInfiniteMRsParams['author_id']
      ): number | 'me' | undefined => {
        if (value === 'me') return 'me';
        if (typeof value === 'number') return value;
        return undefined;
      };

      const baseOptions = {
        state: stateFilter,
        search: params.search,
        order_by,
        sort,
        per_page: perPage,
        page: pageToFetch,
        author_id: resolveUserParam(params.author_id),
        assignee_id: resolveUserParam(params.assignee_id),
        reviewer_id: resolveUserParam(params.reviewer_id),
      };

      try {
        const aggregated = await apiService.getMergeRequestsForProjects(
          params.projectIds,
          baseOptions
        );

        if (aggregated.success && aggregated.data) {
          const fetchedItems = Array.isArray(aggregated.data.items)
            ? (aggregated.data.items as MergeRequestSummary[])
            : [];

          const sortedItems = [...fetchedItems].sort((a, b) => {
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

          const nextPage =
            typeof aggregated.data.nextPage === 'number'
              ? aggregated.data.nextPage
              : fetchedItems.length >= perPage
                ? pageToFetch + 1
                : null;

          return {
            items: sortedItems,
            total: aggregated.data.total ?? fetchedItems.length,
            nextPage,
          };
        } else if (!aggregated.success) {
          const reason = aggregated.error || aggregated.message || 'unknown';
          console.warn(
            'Aggregated MR fetch unavailable, using per-project fallback:',
            reason
          );
        }
      } catch (error) {
        console.warn(
          'Aggregated MR fetch failed, falling back to per-project requests:',
          error
        );
      }

      try {
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
      params.search,
      params.sort,
      params.per_page,
      params.author_id,
      params.assignee_id,
      params.reviewer_id,
    ]
  );

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        // Project IDs are required - return empty if not provided
        if (!params.projectIds || params.projectIds.length === 0) {
          setAllItems([]);
          setCurrentPage(1);
          setHasMore(false);
          return { items: [], total: 0, nextPage: null };
        }

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
    enabled: !!params.projectIds && params.projectIds.length > 0, // Only enabled when projects are selected
  });

  const loadMore = useCallback(async () => {
    if (
      !hasMore ||
      isLoadingMore ||
      query.isFetching ||
      !params.projectIds ||
      params.projectIds.length === 0
    ) {
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
    params.search,
    params.sort,
    params.per_page,
    params.author_id,
    params.assignee_id,
    params.reviewer_id,
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
