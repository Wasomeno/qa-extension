import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiService from '@/services/api';
import type {
  ListMRsParams,
  MergeRequestSummary,
} from '@/types/merge-requests';

export interface UseInfiniteMRsParams extends Omit<ListMRsParams, 'page'> {
  assignee_id?: number | 'me';
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

    return [
      'merge-requests',
      {
        search: params.search || '',
        projectId: params.projectId || '',
        state: params.state || 'opened',
        assignee_id: params.assignee_id || 'me',
        reviewer_id: params.reviewer_id || '',
        author_id: params.author_id || '',
        labels: labelsStr,
        per_page: params.per_page || 20,
        sort: params.sort || 'newest',
      },
    ];
  }, [
    params.search,
    params.projectId,
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
        const order_by = params.sort === 'oldest' ? 'created_at' : 'updated_at';
        const sort = params.sort === 'oldest' ? 'asc' : 'desc';

        // If no project is selected, we need to fetch across all projects
        // GitLab API requires a project ID for MRs, so we'll need to get user's projects first
        if (!params.projectId) {
          // Fetch user's projects to get all MRs across them
          const projectsRes = await apiService.getProjects();
          if (
            !projectsRes.success ||
            !projectsRes.data ||
            projectsRes.data.length === 0
          ) {
            console.log('No projects found for user');
            return { items: [], total: 0, nextPage: null };
          }

          // Fetch MRs from all projects and combine them
          const allMRs: MergeRequestSummary[] = [];

          // Limit to first 5 projects to avoid too many requests
          const projectsToFetch = projectsRes.data.slice(0, 5);

          for (const project of projectsToFetch) {
            try {
              const res = await apiService.getMergeRequests(project.id, {
                state: params.state || 'opened',
                search: params.search,
                order_by,
                sort,
                per_page: params.per_page || 20,
                page: 1,
              });

              if (res.success && res.data && Array.isArray(res.data.items)) {
                allMRs.push(...(res.data.items as MergeRequestSummary[]));
              }
            } catch (err) {
              console.warn(
                `Failed to fetch MRs for project ${project.id}:`,
                err
              );
            }
          }

          // Sort combined results
          allMRs.sort((a, b) => {
            const dateA = new Date(
              sort === 'asc' ? a.created_at : a.updated_at
            ).getTime();
            const dateB = new Date(
              sort === 'asc' ? b.created_at : b.updated_at
            ).getTime();
            return sort === 'asc' ? dateA - dateB : dateB - dateA;
          });

          const items = allMRs.slice(0, params.per_page || 20);
          const hasMoreItems = allMRs.length > (params.per_page || 20);

          setAllItems(items);
          setCurrentPage(1);
          setHasMore(hasMoreItems);

          return {
            items,
            total: allMRs.length,
            nextPage: hasMoreItems ? 2 : null,
          };
        }

        // Single project fetch
        const res = await apiService.getMergeRequests(params.projectId, {
          state: params.state || 'opened',
          search: params.search,
          order_by,
          sort,
          per_page: params.per_page || 20,
          page: 1,
        });

        if (!res.success || !res.data) {
          console.error('MRs fetch failed', res.error);
          return { items: [], total: 0, nextPage: null };
        }

        const items = Array.isArray(res.data.items)
          ? (res.data.items as MergeRequestSummary[])
          : [];
        const total = res.data.total || items.length;
        const nextPage = items.length >= (params.per_page || 20) ? 2 : null;

        setAllItems(items);
        setCurrentPage(1);
        setHasMore(!!nextPage);

        return { items, total, nextPage };
      } catch (e) {
        console.error('MRs fetch error', e);
        return { items: [], total: 0, nextPage: null };
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 300_000, // 5 minutes
    gcTime: 300_000,
    enabled: true, // Always enabled - will fetch across all projects if no project selected
  });

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || query.isFetching) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const order_by = params.sort === 'oldest' ? 'created_at' : 'updated_at';
      const sort = params.sort === 'oldest' ? 'asc' : 'desc';

      // If no project selected, skip load more for now (complex multi-project pagination)
      if (!params.projectId) {
        setHasMore(false);
        setIsLoadingMore(false);
        return;
      }

      const res = await apiService.getMergeRequests(params.projectId, {
        state: params.state || 'opened',
        search: params.search,
        order_by,
        sort,
        per_page: params.per_page || 20,
        page: nextPage,
      });

      if (res.success && res.data) {
        const items = Array.isArray(res.data.items)
          ? (res.data.items as MergeRequestSummary[])
          : [];
        const hasMoreItems = items.length >= (params.per_page || 20);

        setAllItems(prev => [...prev, ...items]);
        setCurrentPage(nextPage);
        setHasMore(hasMoreItems);
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
    params.projectId,
    params.state,
    params.search,
    params.sort,
    params.per_page,
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
