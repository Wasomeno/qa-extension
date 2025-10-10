import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api, {
  ListIssuesParams,
  ListIssuesResponse,
  IssueListItem,
} from '@/services/api';

export interface UseInfiniteIssuesParams
  extends Omit<ListIssuesParams, 'cursor'> {}

export const useInfiniteIssues = (
  params: UseInfiniteIssuesParams
): {
  items: IssueListItem[];
  projectLabels: Record<string, any[]>;
  loadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  isFetching: boolean;
  data: { items: IssueListItem[]; nextCursor?: string | null } | undefined;
} => {
  const [allItems, setAllItems] = useState<IssueListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const queryKey = useMemo(() => {
    const labelsStr = Array.isArray(params.labels)
      ? params.labels.slice().sort().join(',')
      : '';

    return [
      'issues',
      {
        search: params.search || '',
        projectId: params.projectId || '',
        labels: labelsStr,
        assigneeId: params.assigneeId || '',
        createdBy: params.createdBy || 'me',
        status: params.status || '',
        limit: params.limit || 5,
        sort: params.sort || 'newest',
      },
    ];
  }, [
    params.search,
    params.projectId,
    JSON.stringify(params.labels),
    params.assigneeId,
    params.createdBy,
    params.status,
    params.limit,
    params.sort,
  ]);

  // Reset state when query parameters change
  useEffect(() => {
    setAllItems([]);
    setNextCursor(null);
    setHasMore(true);
    setIsLoadingMore(false);
  }, [queryKey]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const res = await api.listGitLabIssuesGlobal({ ...params, cursor: null });
        if (!res.success || !res.data) {
          console.error('Issues fetch failed', res.error);
          return { items: [], nextCursor: null };
        }
        const items = Array.isArray(res.data.items)
          ? (res.data.items as IssueListItem[])
          : [];
        const cursor = (res.data as ListIssuesResponse).nextCursor ?? null;

        setAllItems(items);
        setNextCursor(cursor);
        setHasMore(!!cursor);

        return { items, nextCursor: cursor };
      } catch (e) {
        console.error('Issues fetch error', e);
        return { items: [], nextCursor: null };
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 300_000, // 5 minutes
    gcTime: 300_000, // 5 minutes
  });

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || query.isFetching || !nextCursor) return;

    setIsLoadingMore(true);
    try {
      const res = await api.listGitLabIssuesGlobal({ ...params, cursor: nextCursor });
      if (res.success && res.data) {
        const items = Array.isArray(res.data.items)
          ? (res.data.items as IssueListItem[])
          : [];
        const cursor = (res.data as ListIssuesResponse).nextCursor ?? null;

        setAllItems(prev => [...prev, ...items]);
        setNextCursor(cursor);
        setHasMore(!!cursor);
      }
    } catch (e) {
      console.error('Load more error', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, query.isFetching, nextCursor, params]);

  const projectLabels: Record<string, any[]> = useMemo(() => {
    const combined: Record<string, any[]> = {};
    if (query.data && (query.data as any).projectLabels) {
      Object.assign(combined, (query.data as any).projectLabels);
    }
    return combined;
  }, [query.data]);

  return {
    ...query,
    items: allItems,
    projectLabels,
    loadMore,
    hasMore,
    isLoadingMore
  };
};

export default useInfiniteIssues;
