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

        const order_by = params.sort === 'oldest' ? 'created_at' : 'updated_at';
        const sort = params.sort === 'oldest' ? 'asc' : 'desc';

        const perPage = params.per_page || 20;

        const response = await apiService.getMergeRequestsForProjects(
          params.projectIds,
          {
            state: params.state || 'opened',
            search: params.search,
            order_by,
            sort,
            per_page: perPage,
            page: 1,
            author_id:
              typeof params.author_id === 'number'
                ? params.author_id
                : undefined,
            assignee_id:
              typeof params.assignee_id === 'number'
                ? params.assignee_id
                : undefined,
            reviewer_id:
              typeof params.reviewer_id === 'number'
                ? params.reviewer_id
                : undefined,
          }
        );

        if (!response.success || !response.data) {
          setAllItems([]);
          setHasMore(false);
          return { items: [], total: 0, nextPage: null };
        }

        const fetchedItems = Array.isArray(response.data.items)
          ? (response.data.items as MergeRequestSummary[])
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
          typeof response.data.nextPage === 'number'
            ? response.data.nextPage
            : fetchedItems.length >= perPage
              ? 2
              : null;

        setAllItems(sortedItems);
        setCurrentPage(1);
        setHasMore(!!nextPage);

        return {
          items: sortedItems,
          total: response.data.total ?? fetchedItems.length,
          nextPage,
        };
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
      const order_by = params.sort === 'oldest' ? 'created_at' : 'updated_at';
      const sort = params.sort === 'oldest' ? 'asc' : 'desc';
      const perPage = params.per_page || 20;

      const response = await apiService.getMergeRequestsForProjects(
        params.projectIds,
        {
          state: params.state || 'opened',
          search: params.search,
          order_by,
          sort,
          per_page: perPage,
          page: nextPage,
          author_id:
            typeof params.author_id === 'number' ? params.author_id : undefined,
          assignee_id:
            typeof params.assignee_id === 'number'
              ? params.assignee_id
              : undefined,
          reviewer_id:
            typeof params.reviewer_id === 'number'
              ? params.reviewer_id
              : undefined,
        }
      );

      if (response.success && response.data) {
        const newItems = Array.isArray(response.data.items)
          ? (response.data.items as MergeRequestSummary[])
          : [];

        if (newItems.length === 0) {
          setHasMore(false);
        } else {
          setAllItems(prev => {
            const all = [...prev, ...newItems];
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

          const nextPageFromResponse =
            typeof response.data.nextPage === 'number'
              ? response.data.nextPage
              : newItems.length >= perPage
                ? nextPage + 1
                : null;

          setHasMore(nextPageFromResponse !== null);
        }
      } else {
        setHasMore(false);
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
